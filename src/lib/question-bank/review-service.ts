import { z } from "zod";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { cleanText } from "@/lib/question-bank/item-input";
import { normalizeLabel } from "@/lib/question-bank/labels";
import { loadViewer } from "@/lib/question-bank/viewer";
import {
  mayDecide,
  mayMakeGeneral,
  maySetVisibility,
  reviewPower,
  staffMaySee,
  type BankViewer,
  type DecisionAction,
} from "@/lib/question-bank/rules";
import {
  ITEM_SELECT,
  NOT_FOUND,
  factsOf,
  fail,
  lockItem,
  snapshotOf,
  viewOf,
  type Fail,
  type ItemRow,
  type ItemView,
  type Tx,
} from "@/lib/question-bank/items-common";

// Deciding on question bank submissions (task 0024 slice C; design note sections 7 and 8.1): approve, reject, retire, and the queue a reviewer works through. Each decision
// re-reads the person INSIDE the transaction that records it (someone deactivated a moment ago decides nothing), locks the item, asks `rules.ts`, and writes the item, an
// append-only review row, a version snapshot when the question changed, and an audit row together. A person with no authority over the item is told it does not exist.

type TenantCtx = TenantAuthContext["tenant"];

const REASON_MAX = 500;
const reason = z
  .string({ error: "Give a reason." })
  .transform((raw, ctx) => {
    const cleaned = cleanText(raw, { multiline: true });
    if (cleaned === null) {
      ctx.addIssue({ code: "custom", message: "The reason contains a character that cannot be used." });
      return z.NEVER;
    }
    return cleaned;
  })
  .pipe(z.string().min(1, "Give a reason.").max(REASON_MAX, `The reason can be at most ${REASON_MAX} characters.`));

export const reasonBody = z.strictObject({ reason });

const label = z
  .string()
  .transform((raw) => cleanText(raw, { multiline: false }) ?? "")
  .pipe(z.string().min(1).max(80));

/// What the person approving decides. `visibility` and `visibleFrom` only by someone who may set visibility; `general` only by someone who may make a question general; a plain
/// reviewer's approval leaves the question TEACHERS_ONLY on its own campus, the safe default. `subject` and `classTags` replace the writer's when given.
export const approveBody = z.strictObject({
  visibility: z.enum(["PRACTICE", "TEACHERS_ONLY", "TEACHERS_ONLY_UNTIL"]).optional(),
  visibleFrom: z.iso.datetime({ error: "Give the date and time as an ISO date." }).optional(),
  general: z.boolean().optional(),
  subject: label.nullable().optional(),
  classTags: z.array(label).max(10, "At most 10 classes.").optional(),
});
export type ApproveBody = z.infer<typeof approveBody>;

const why = (verdict: ReturnType<typeof mayDecide>, action: DecisionAction): Fail | null => {
  if (verdict.ok) return null;
  if (verdict.why === "SCOPE") return NOT_FOUND;
  if (verdict.why === "SELF") return fail(403, "OWN_QUESTION", "You cannot decide on your own question.");
  const wanted = action === "approve" || action === "reject" ? "pending review" : "approved";
  return fail(
    409,
    "WRONG_STATE",
    `Only a question that is ${wanted} can be ${action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "retire" ? "retired" : "edited"}.`,
  );
};

type Begun = { ok: false; failure: Fail } | { ok: true; row: ItemRow; viewer: BankViewer };

async function begin(tx: Tx, tenantId: string, userId: string, id: string, action: DecisionAction): Promise<Begun> {
  const row = await lockItem(tx, tenantId, id);
  if (!row) return { ok: false, failure: NOT_FOUND };
  const viewer = await loadViewer(tx, tenantId, userId);
  if (!staffMaySee(viewer, factsOf(row), new Date())) return { ok: false, failure: NOT_FOUND };
  const refusal = why(mayDecide(viewer, factsOf(row), action), action);
  if (refusal) return { ok: false, failure: refusal };
  return { ok: true, row, viewer };
}

export type DecisionResult = { ok: true; item: ItemView } | Fail;

export async function approveItem(tenant: TenantCtx, input: { userId: string; id: string; body: ApproveBody }): Promise<DecisionResult> {
  const { tenantId } = tenant;
  return tenant.run(async (tx): Promise<DecisionResult> => {
    const step = await begin(tx, tenantId, input.userId, input.id, "approve");
    if (!step.ok) return step.failure;
    const { row, viewer } = step;
    const { body } = input;

    const wantsVisibility = body.visibility !== undefined && body.visibility !== "TEACHERS_ONLY";
    if (wantsVisibility && !maySetVisibility(viewer, factsOf(row))) {
      return fail(
        403,
        "FORBIDDEN",
        "Only an exam approver, the administrator of the campus or the school's administrator can make a question visible to pupils.",
      );
    }
    if (body.general && !mayMakeGeneral(viewer, factsOf(row)))
      return fail(403, "FORBIDDEN", "Only a reviewer for every campus or the school's administrator can make a question general.");

    const visibility = body.visibility ?? "TEACHERS_ONLY";
    if (visibility === "TEACHERS_ONLY_UNTIL" && !body.visibleFrom)
      return fail(400, "VALIDATION", "Give the date and time from which pupils may see the question.");
    if (visibility !== "TEACHERS_ONLY_UNTIL" && body.visibleFrom)
      return fail(400, "VALIDATION", "A date is only for a question that becomes visible on a date.");
    const visibleFrom = visibility === "TEACHERS_ONLY_UNTIL" ? new Date(body.visibleFrom!) : null;
    if (visibleFrom && visibleFrom.getTime() <= Date.now())
      return fail(400, "VALIDATION", "The date a question becomes visible must be in the future.");

    const subjectLabel = body.subject === undefined ? row.subjectLabel : body.subject;
    const subjectKey = subjectLabel ? normalizeLabel(subjectLabel) : null;
    const tags =
      body.classTags === undefined
        ? row.classTags.map((tag) => ({ label: tag.label, labelKey: tag.labelKey }))
        : [...new Map(body.classTags.map((tag) => [normalizeLabel(tag), { label: tag, labelKey: normalizeLabel(tag) }])).values()].filter(
            (tag) => tag.labelKey !== "",
          );
    if (!subjectKey) return fail(400, "VALIDATION", "Choose the subject of the question before approving it.");
    if (tags.length === 0) return fail(400, "VALIDATION", "Choose at least one class for the question before approving it.");

    const changedContent =
      subjectLabel !== row.subjectLabel ||
      JSON.stringify(tags.map((t) => t.labelKey).sort()) !== JSON.stringify(row.classTags.map((t) => t.labelKey).sort());
    const version = changedContent ? row.version + 1 : row.version;
    const scopeCampus = body.general ? null : row.campusId;

    await tx.questionBankItem.update({
      where: { id: row.id },
      data: {
        status: "APPROVED",
        approvedById: input.userId,
        approvedAt: new Date(),
        visibility,
        visibleFrom,
        campusId: scopeCampus,
        subjectLabel,
        subjectKey,
        version,
      },
    });
    if (body.classTags !== undefined) {
      await tx.questionBankClassTag.deleteMany({ where: { tenantId, itemId: row.id } });
      await tx.questionBankClassTag.createMany({
        data: tags.map((tag) => ({ tenantId, itemId: row.id, label: tag.label, labelKey: tag.labelKey })),
      });
    }
    const after = await tx.questionBankItem.findFirstOrThrow({ where: { id: row.id, tenantId }, select: ITEM_SELECT });
    if (changedContent)
      await tx.questionBankItemVersion.create({
        data: { tenantId, itemId: row.id, version, snapshot: snapshotOf(after), actorUserId: input.userId },
      });
    await tx.questionBankReview.create({ data: { tenantId, itemId: row.id, version, reviewerId: input.userId, outcome: "APPROVED" } });
    await writeBankAudit(tx, {
      tenantId,
      campusId: row.campusId,
      itemId: row.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "ITEM_APPROVED",
      oldValue: { status: row.status, visibility: row.visibility, general: row.campusId === null },
      newValue: {
        status: "APPROVED",
        visibility,
        visibleFrom: visibleFrom ? visibleFrom.toISOString() : null,
        general: scopeCampus === null,
      },
    });
    return { ok: true, item: await viewOf(tx, viewer, after) } as const;
  });
}

async function decide(
  tenant: TenantCtx,
  input: { userId: string; id: string; reason: string },
  action: "reject" | "retire",
): Promise<DecisionResult> {
  const { tenantId } = tenant;
  return tenant.run(async (tx): Promise<DecisionResult> => {
    const step = await begin(tx, tenantId, input.userId, input.id, action);
    if (!step.ok) return step.failure;
    const { row, viewer } = step;
    const status = action === "reject" ? "REJECTED" : "RETIRED";
    await tx.questionBankItem.update({
      where: { id: row.id },
      data:
        action === "reject"
          ? { status }
          : {
              status,
              retiredReason: input.reason,
              approvedById: row.approvedById ?? input.userId,
              approvedAt: row.approvedAt ?? new Date(),
            },
    });
    await tx.questionBankReview.create({
      data: {
        tenantId,
        itemId: row.id,
        version: row.version,
        reviewerId: input.userId,
        outcome: action === "reject" ? "REJECTED" : "RETIRED",
        reason: input.reason,
      },
    });
    await writeBankAudit(tx, {
      tenantId,
      campusId: row.campusId,
      itemId: row.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: action === "reject" ? "ITEM_REJECTED" : "ITEM_RETIRED",
      oldValue: { status: row.status },
      newValue: { status },
      reason: input.reason,
    });
    const after = await tx.questionBankItem.findFirstOrThrow({ where: { id: row.id, tenantId }, select: ITEM_SELECT });
    return { ok: true, item: await viewOf(tx, viewer, after) } as const;
  });
}

export const rejectItem = (tenant: TenantCtx, input: { userId: string; id: string; reason: string }) => decide(tenant, input, "reject");
export const retireItem = (tenant: TenantCtx, input: { userId: string; id: string; reason: string }) => decide(tenant, input, "retire");

/// What a reviewer has waiting: PENDING questions they have authority over, oldest first, not their own (the school's administrator, who may decide anything, sees their own
/// too). Overlap flags are carried only for questions where the person is an exam approver.
export async function reviewQueue(tenant: TenantCtx, input: { userId: string; campusId?: string }): Promise<{ items: ItemView[] }> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const viewer = await loadViewer(tx, tenantId, input.userId);
    const reviewerCampuses = new Set<string | null>(viewer.reviewerRows.map((row) => row.campusId));
    const administered = viewer.memberships.flatMap((m) =>
      m.role === "ADMIN" ? [null] : m.role === "CAMPUS_ADMIN" && m.campusId ? [m.campusId] : [],
    );
    // A person who administers the whole school, or reviews for every campus, is not narrowed by campus; anyone else only reaches the campuses they administer or review for.
    // (Built as plain conditions: an empty `{}` inside `OR` is not a reliable "everything".)
    const everyCampus = viewer.isSchoolAdmin || administered.includes(null) || reviewerCampuses.has(null);
    const campuses = [...new Set([...administered, ...reviewerCampuses].filter((id): id is string => id !== null))];
    const where = viewer.isSchoolAdmin
      ? { tenantId, status: "PENDING" as const }
      : {
          tenantId,
          status: "PENDING" as const,
          submittedById: { not: viewer.userId },
          ...(everyCampus ? {} : { campusId: { in: campuses } }),
        };
    const rows = await tx.questionBankItem.findMany({
      where: { ...where, ...(input.campusId ? { campusId: input.campusId } : {}) },
      select: ITEM_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    // The rule decides, row by row: scope (an every-campus reviewer reaches a general question, a subject reviewer only their subject) and the self-decision rule.
    const mine = rows.filter(
      (row: ItemRow) => reviewPower(viewer, factsOf(row)).mayReview && (viewer.isSchoolAdmin || row.submittedById !== viewer.userId),
    );
    return { items: await Promise.all(mine.map((row) => viewOf(tx, viewer, row))) };
  });
}
