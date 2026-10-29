import type { Prisma } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { parseItem, type StoredItem } from "@/lib/question-bank/item-input";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { effectiveSettingsIn } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { mayAuthorIn, mayDecide, mayEditAsSubmitter, maySubmit, staffMaySee, type BankViewer } from "@/lib/question-bank/rules";
import {
  NOT_FOUND,
  ITEM_SELECT,
  factsOf,
  fail,
  lockItem,
  refreshOverlap,
  snapshotOf,
  viewOf,
  type Fail,
  type ItemRow,
  type ItemView,
} from "@/lib/question-bank/items-common";

// Writing, submitting, reading and listing question bank items (task 0024 slice C). Authority is `rules.ts`, asked with a viewer read INSIDE the transaction that changes
// anything, so a person deactivated a moment ago changes nothing. Every change is one transaction through `tenant.run` (ADR 0002): the item, its class tags, a version snapshot
// (append-only) and an audit row. An item the person may not see is "Not found", the same answer as one that does not exist, and one of another school is simply not there
// (row-level security) as well as filtered by the school's id in every query.

type TenantCtx = TenantAuthContext["tenant"];

export const ACCESS_OFF = "The question bank is switched off for your role in this campus.";

/// The `bank.access.*` switches: a school-wide or campus "off" closes the bank for that group. An administrator of the campus is held to `admins`, other staff to `staff`; the
/// school's own administrator is never shut out.
export async function bankOpenFor(tx: Tx, tenantId: string, viewer: BankViewer, campusId: string | null): Promise<boolean> {
  if (viewer.isSchoolAdmin) return true;
  const settings = await effectiveSettingsIn(tx, tenantId, campusId);
  const administers = viewer.memberships.some(
    (m) => (m.role === "ADMIN" || m.role === "CAMPUS_ADMIN") && (campusId === null || m.campusId === campusId),
  );
  return administers ? settings["bank.access.admins"] : settings["bank.access.staff"];
}

function dataOf(item: StoredItem) {
  return {
    type: item.type,
    prompt: item.prompt,
    explanation: item.explanation,
    points: item.points,
    difficulty: item.difficulty,
    topic: item.topic,
    options: item.options as unknown as Prisma.InputJsonValue,
    correctAnswer: item.correctAnswer as Prisma.InputJsonValue,
    subjectLabel: item.subjectLabel,
    subjectKey: item.subjectKey,
  };
}

async function replaceTags(tx: Tx, tenantId: string, itemId: string, tags: StoredItem["classTags"]) {
  await tx.questionBankClassTag.deleteMany({ where: { tenantId, itemId } });
  if (tags.length > 0)
    await tx.questionBankClassTag.createMany({ data: tags.map((tag) => ({ tenantId, itemId, label: tag.label, labelKey: tag.labelKey })) });
}

async function reread(tx: Tx, tenantId: string, id: string): Promise<ItemRow> {
  return tx.questionBankItem.findFirstOrThrow({ where: { id, tenantId }, select: ITEM_SELECT });
}

export type ItemResult = { ok: true; item: ItemView } | Fail;
type Problems = { ok: false; status: 400; code: "VALIDATION"; message: string; details: { path: string; message: string }[] };
const invalid = (problems: { path: string; message: string }[]): Problems => ({
  ok: false,
  status: 400,
  code: "VALIDATION",
  message: problems[0]?.message ?? "That question cannot be saved.",
  details: problems,
});

/// A new question, saved as a DRAFT that only its writer sees. `campusId` is the campus it is written for (null: the school's own, in a school with no campuses).
export async function createItem(
  tenant: TenantCtx,
  input: { userId: string; campusId: string | null; body: unknown },
): Promise<ItemResult | Problems> {
  const parsed = parseItem(input.body);
  if (!parsed.ok) return invalid(parsed.problems);
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    if (input.campusId !== null) {
      // another school's campus is, to this one, a campus that does not exist
      const campus = await tx.campus.findFirst({ where: { id: input.campusId, tenantId }, select: { id: true } });
      if (!campus) return NOT_FOUND;
    }
    const viewer = await loadViewer(tx, tenantId, input.userId);
    if (!mayAuthorIn(viewer, input.campusId)) return fail(403, "FORBIDDEN", "You cannot write questions for this campus.");
    if (!(await bankOpenFor(tx, tenantId, viewer, input.campusId))) return fail(403, "BANK_OFF", ACCESS_OFF);

    const created = await tx.questionBankItem.create({
      data: {
        ...dataOf(parsed.item),
        tenantId,
        campusId: input.campusId,
        bank: "ASSESSMENT",
        status: "DRAFT",
        submittedById: input.userId,
      },
      select: { id: true },
    });
    await replaceTags(tx, tenantId, created.id, parsed.item.classTags);
    const row = await reread(tx, tenantId, created.id);
    await tx.questionBankItemVersion.create({
      data: { tenantId, itemId: row.id, version: 1, snapshot: snapshotOf(row), actorUserId: input.userId },
    });
    await writeBankAudit(tx, {
      tenantId,
      campusId: row.campusId,
      itemId: row.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "ITEM_CREATED",
      newValue: { version: 1, status: "DRAFT", type: row.type },
    });
    return { ok: true, item: await viewOf(tx, viewer, row) } as const;
  });
}

/// Edits a question. Its writer may edit it while it is a DRAFT, PENDING or REJECTED (a PENDING one stays pending with a new version, and is checked for overlap again); a
/// reviewer in scope may correct an APPROVED one (a new version and a review row). Everyone else: "Not found" if they cannot see it, otherwise 403.
export async function updateItem(tenant: TenantCtx, input: { userId: string; id: string; body: unknown }): Promise<ItemResult | Problems> {
  const parsed = parseItem(input.body);
  if (!parsed.ok) return invalid(parsed.problems);
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const before = await lockItem(tx, tenantId, input.id);
    if (!before) return NOT_FOUND;
    const viewer = await loadViewer(tx, tenantId, input.userId);
    const facts = factsOf(before);
    if (!staffMaySee(viewer, facts, new Date())) return NOT_FOUND;

    const asWriter = mayEditAsSubmitter(viewer, facts);
    const asReviewer = !asWriter && mayDecide(viewer, facts, "edit").ok;
    if (!asWriter && !asReviewer) return fail(403, "FORBIDDEN", "You cannot edit this question.");
    if (!(await bankOpenFor(tx, tenantId, viewer, before.campusId))) return fail(403, "BANK_OFF", ACCESS_OFF);

    const version = before.version + 1;
    await tx.questionBankItem.update({ where: { id: before.id }, data: { ...dataOf(parsed.item), version } });
    await replaceTags(tx, tenantId, before.id, parsed.item.classTags);
    const after = await reread(tx, tenantId, before.id);
    await tx.questionBankItemVersion.create({
      data: { tenantId, itemId: after.id, version, snapshot: snapshotOf(after), actorUserId: input.userId },
    });
    if (asReviewer)
      await tx.questionBankReview.create({ data: { tenantId, itemId: after.id, version, reviewerId: input.userId, outcome: "EDITED" } });
    if (after.status === "PENDING") await refreshOverlap(tx, after);
    await writeBankAudit(tx, {
      tenantId,
      campusId: after.campusId,
      itemId: after.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: asReviewer ? "ITEM_EDITED_BY_REVIEWER" : "ITEM_EDITED",
      oldValue: { version: before.version },
      newValue: { version, status: after.status },
    });
    return { ok: true, item: await viewOf(tx, viewer, after) } as const;
  });
}

/// Sends a DRAFT or REJECTED question for review. It is checked, silently, for overlap with the bank and with published quizzes: the writer is never told the result.
export async function submitItem(tenant: TenantCtx, input: { userId: string; id: string }): Promise<ItemResult> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const before = await lockItem(tx, tenantId, input.id);
    if (!before) return NOT_FOUND;
    const viewer = await loadViewer(tx, tenantId, input.userId);
    const facts = factsOf(before);
    if (!staffMaySee(viewer, facts, new Date())) return NOT_FOUND;
    if (!maySubmit(viewer, facts)) {
      return before.submittedById === input.userId
        ? fail(409, "WRONG_STATE", "Only a draft or a rejected question can be sent for review.")
        : fail(403, "FORBIDDEN", "You cannot send this question for review.");
    }
    if (!(await bankOpenFor(tx, tenantId, viewer, before.campusId))) return fail(403, "BANK_OFF", ACCESS_OFF);

    await tx.questionBankItem.update({ where: { id: before.id }, data: { status: "PENDING" } });
    const after = await reread(tx, tenantId, before.id);
    await refreshOverlap(tx, after);
    await writeBankAudit(tx, {
      tenantId,
      campusId: after.campusId,
      itemId: after.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "ITEM_SUBMITTED",
      oldValue: { status: before.status },
      newValue: { status: "PENDING", version: after.version },
    });
    return { ok: true, item: await viewOf(tx, viewer, after) } as const;
  });
}

export type HistoryEntry = { id: string; version: number; outcome: string; reason: string | null; at: Date; by: string | null };

/// One question, if the person may see it. Includes the history of decisions on it.
export async function getItem(
  tenant: TenantCtx,
  input: { userId: string; id: string },
): Promise<{ ok: true; item: ItemView; history: HistoryEntry[] } | Fail> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const viewer = await loadViewer(tx, tenantId, input.userId);
    const row = await tx.questionBankItem.findFirst({ where: { id: input.id, tenantId }, select: ITEM_SELECT });
    if (!row || !staffMaySee(viewer, factsOf(row), new Date())) return NOT_FOUND;
    const item = await viewOf(tx, viewer, row);
    const reviews = await tx.questionBankReview.findMany({
      where: { tenantId, itemId: row.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        version: true,
        outcome: true,
        reason: true,
        createdAt: true,
        reviewer: { select: { user: { select: { name: true } } } },
      },
    });
    return {
      ok: true as const,
      item,
      history: reviews.map((review) => ({
        id: review.id,
        version: review.version,
        outcome: review.outcome,
        reason: review.reason,
        at: review.createdAt,
        by: review.reviewer.user.name,
      })),
    };
  });
}

export const LIST_MAX = 50;
export type ListQuery = {
  campusId?: string;
  status?: ItemRow["status"];
  q?: string;
  subjectKey?: string;
  classTagKey?: string;
  mine?: boolean;
  cursor?: string;
  limit?: number;
};

/// A page of questions the person may see, newest first. The database narrows by the school, the person's campuses and other people's drafts; EVERY row is then put through
/// `staffMaySee` before it is returned, so the rule that decides is the one in `rules.ts`, not a copy of it in a query.
export async function listItems(
  tenant: TenantCtx,
  input: { userId: string; query: ListQuery },
): Promise<{ items: ItemView[]; nextCursor: string | null }> {
  const { tenantId } = tenant;
  const { query } = input;
  const limit = Math.min(Math.max(query.limit ?? 20, 1), LIST_MAX);
  return tenant.run(async (tx) => {
    const viewer = await loadViewer(tx, tenantId, input.userId);
    const wholeSchool = viewer.isSchoolAdmin || viewer.memberships.some((m) => m.campusId === null);
    const staffCampuses = viewer.memberships.flatMap((m) => (m.campusId === null ? [] : [m.campusId]));

    const and: Prisma.QuestionBankItemWhereInput[] = [{ tenantId }];
    if (!wholeSchool) and.push({ OR: [{ campusId: null }, { campusId: { in: staffCampuses } }] });
    if (!viewer.isSchoolAdmin) and.push({ OR: [{ submittedById: viewer.userId }, { status: { not: "DRAFT" } }] });
    if (query.campusId) and.push({ OR: [{ campusId: query.campusId }, { campusId: null }] });
    if (query.status) and.push({ status: query.status });
    if (query.mine) and.push({ submittedById: viewer.userId });
    if (query.subjectKey) and.push({ subjectKey: query.subjectKey });
    if (query.classTagKey) and.push({ classTags: { some: { labelKey: query.classTagKey } } });
    if (query.q) and.push({ prompt: { contains: query.q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } }); // % and _ are text here, not wildcards
    if (query.cursor) {
      const [at, id] = query.cursor.split("|");
      const when = new Date(at ?? "");
      if (id && !Number.isNaN(when.getTime())) and.push({ OR: [{ createdAt: { lt: when } }, { createdAt: when, id: { lt: id } }] });
    }

    const now = new Date();
    const visible: ItemRow[] = [];
    let scanned = 0;
    let exhausted = false;
    let last: ItemRow | null = null;
    // Rows the rule refuses are skipped, so more than a page may be read: bounded, so a person who can see little of a large bank costs a few queries and not a scan.
    while (visible.length <= limit && scanned < 400 && !exhausted) {
      const batch: ItemRow[] = await tx.questionBankItem.findMany({
        where: {
          AND: last ? [...and, { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] }] : and,
        },
        select: ITEM_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      });
      scanned += batch.length;
      exhausted = batch.length < 100;
      for (const row of batch) {
        last = row;
        if (staffMaySee(viewer, factsOf(row), now)) visible.push(row);
        if (visible.length > limit) break;
      }
    }
    const page = visible.slice(0, limit);
    const more = visible.length > limit;
    const items = await Promise.all(page.map((row) => viewOf(tx, viewer, row)));
    const tail = page[page.length - 1];
    return { items, nextCursor: more && tail ? `${tail.createdAt.toISOString()}|${tail.id}` : null };
  });
}

import { prepareOfferBackPayload } from "@/lib/question-bank/assessments";

export async function offerBackItem(
  tenant: TenantCtx,
  input: {
    userId: string;
    quizQuestionId: string;
    campusId?: string | null;
    subjectLabel?: string;
    topic?: string;
    difficulty?: number;
  },
): Promise<ItemResult> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const viewer = await loadViewer(tx, tenantId, input.userId);
    const targetCampus = input.campusId ?? null;
    if (!mayAuthorIn(viewer, targetCampus)) {
      return fail(403, "FORBIDDEN", "You are not authorized to author questions for this campus.");
    }
    if (!(await bankOpenFor(tx, tenantId, viewer, targetCampus))) {
      return fail(403, "FORBIDDEN", ACCESS_OFF);
    }

    const qq = await tx.quizQuestion.findFirst({
      where: { tenantId, id: input.quizQuestionId },
    });
    if (!qq) return NOT_FOUND;

    const payload = prepareOfferBackPayload(qq, {
      subjectLabel: input.subjectLabel,
      topic: input.topic,
      difficulty: input.difficulty,
    });

    const parsed = parseItem(payload);
    if (!parsed.ok) return invalid(parsed.problems);
    const item = parsed.item;

    const created = await tx.questionBankItem.create({
      data: {
        tenantId,
        campusId: targetCampus,
        bank: "ASSESSMENT",
        status: "PENDING",
        submittedById: viewer.userId,
        ...dataOf(item),
      },
    });

    await replaceTags(tx, tenantId, created.id, item.classTags);
    const row = await reread(tx, tenantId, created.id);
    await tx.questionBankItemVersion.create({
      data: {
        tenantId,
        itemId: row.id,
        version: 1,
        snapshot: snapshotOf(row),
        actorUserId: viewer.userId,
      },
    });
    await tx.questionBankReview.create({
      data: {
        tenantId,
        itemId: row.id,
        version: 1,
        reviewerId: viewer.userId,
        outcome: "APPROVED",
        reason: "Offered back from assessment question",
      },
    });
    await writeBankAudit(tx, {
      tenantId,
      campusId: row.campusId,
      itemId: row.id,
      actorUserId: viewer.userId,
      entity: "ITEM",
      action: "ITEM_SUBMITTED",
      newValue: { status: "APPROVED", version: 1, offeredBackFrom: qq.id },
    });
    await refreshOverlap(tx, row);

    const fresh = await reread(tx, tenantId, row.id);
    return { ok: true, item: await viewOf(tx, viewer, fresh) };
  });
}
