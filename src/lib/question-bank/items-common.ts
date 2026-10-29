import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { maySeeOverlap, maySetVisibility, mayDecide, mayEditAsSubmitter, maySubmit, mayMakeGeneral, type BankItemFacts, type BankViewer } from "@/lib/question-bank/rules";
import { overlapScore, OVERLAP_THRESHOLD } from "@/lib/question-bank/overlap";

// What the question bank item services share (task 0024 slice C): the failure shape, the row each service selects, the view a staff member gets back, and the silent
// overlap check. The services decide nothing about WHO may do WHAT: that is `rules.ts`, asked with a viewer read in the same transaction as the change.

export type { Tx };
export type Fail = { ok: false; status: number; code: string; message: string };

export const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
/// The one answer for an item that does not exist and for one the person may not see: nothing is confirmed.
export const NOT_FOUND: Fail = fail(404, "NOT_FOUND", "Not found");

export const ITEM_SELECT = {
  id: true,
  tenantId: true,
  campusId: true,
  bank: true,
  type: true,
  prompt: true,
  explanation: true,
  points: true,
  difficulty: true,
  topic: true,
  options: true,
  correctAnswer: true,
  subjectLabel: true,
  subjectKey: true,
  visibility: true,
  visibleFrom: true,
  status: true,
  version: true,
  submittedById: true,
  approvedById: true,
  approvedAt: true,
  retiredReason: true,
  createdAt: true,
  updatedAt: true,
  submittedBy: { select: { user: { select: { name: true } } } },
  classTags: { select: { label: true, labelKey: true }, orderBy: { label: "asc" as const } },
  images: {
    select: { id: true, alt: true, decorative: true, width: true, height: true, contentType: true, sortOrder: true },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.QuestionBankItemSelect;

export type ItemRow = Prisma.QuestionBankItemGetPayload<{ select: typeof ITEM_SELECT }>;

export const factsOf = (row: ItemRow): BankItemFacts => ({
  campusId: row.campusId,
  subjectKey: row.subjectKey,
  status: row.status,
  visibility: row.visibility,
  visibleFrom: row.visibleFrom,
  submittedById: row.submittedById,
});

export type OverlapView = { id: string; score: number; similarTo: { kind: "BANK_ITEM" | "ASSESSMENT_QUESTION"; id: string } };

export type ItemView = {
  id: string;
  campusId: string | null;
  type: ItemRow["type"];
  prompt: string;
  explanation: string | null;
  points: number;
  difficulty: number | null;
  topic: string | null;
  options: unknown;
  correctAnswer: unknown;
  subject: string | null;
  classTags: string[];
  visibility: ItemRow["visibility"];
  visibleFrom: Date | null;
  status: ItemRow["status"];
  version: number;
  submittedBy: string | null;
  mine: boolean;
  approvedAt: Date | null;
  /// Why a rejected question was rejected, or why a retired one was retired: the one thing an uploader is told besides its status.
  reason: string | null;
  images: ItemRow["images"];
  createdAt: Date;
  updatedAt: Date;
  /// What this person may do with it now, so a screen offers only what the server would accept.
  can: { edit: boolean; submit: boolean; approve: boolean; reject: boolean; retire: boolean; setVisibility: boolean; makeGeneral: boolean };
  /// ONLY present (as a key) for an exam approver in scope or a superadmin. For everyone else the key does not exist, not even as an empty list: an uploader must not be able to
  /// tell a question that was flagged from one that was not.
  overlap?: OverlapView[];
};

/// The latest reason given for the item's current state (a rejection's, or a retirement's).
async function latestReason(db: Pick<Tx, "questionBankReview">, row: ItemRow): Promise<string | null> {
  if (row.status === "RETIRED") return row.retiredReason;
  if (row.status !== "REJECTED") return null;
  const review = await db.questionBankReview.findFirst({
    where: { tenantId: row.tenantId, itemId: row.id, outcome: "REJECTED" },
    orderBy: { createdAt: "desc" },
    select: { reason: true },
  });
  return review?.reason ?? null;
}

export async function viewOf(db: Pick<Tx, "questionBankReview" | "questionOverlapFlag">, viewer: BankViewer, row: ItemRow): Promise<ItemView> {
  const facts = factsOf(row);
  const view: ItemView = {
    id: row.id,
    campusId: row.campusId,
    type: row.type,
    prompt: row.prompt,
    explanation: row.explanation,
    points: row.points,
    difficulty: row.difficulty,
    topic: row.topic,
    options: row.options,
    correctAnswer: row.correctAnswer,
    subject: row.subjectLabel,
    classTags: row.classTags.map((tag) => tag.label),
    visibility: row.visibility,
    visibleFrom: row.visibleFrom,
    status: row.status,
    version: row.version,
    submittedBy: row.submittedBy.user.name,
    mine: row.submittedById === viewer.userId,
    approvedAt: row.approvedAt,
    reason: await latestReason(db, row),
    images: row.images,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    can: {
      edit: mayEditAsSubmitter(viewer, facts) || mayDecide(viewer, facts, "edit").ok,
      submit: maySubmit(viewer, facts),
      approve: mayDecide(viewer, facts, "approve").ok,
      reject: mayDecide(viewer, facts, "reject").ok,
      retire: mayDecide(viewer, facts, "retire").ok,
      setVisibility: maySetVisibility(viewer, facts),
      makeGeneral: mayMakeGeneral(viewer, facts),
    },
  };
  if (maySeeOverlap(viewer, facts)) {
    const flags = await db.questionOverlapFlag.findMany({ where: { tenantId: row.tenantId, itemId: row.id }, orderBy: { score: "desc" } });
    view.overlap = flags.map((flag) => ({
      id: flag.id,
      score: flag.score,
      similarTo: flag.similarToItemId
        ? { kind: "BANK_ITEM", id: flag.similarToItemId }
        : { kind: "ASSESSMENT_QUESTION", id: flag.similarToAssessmentQuestionId ?? "" },
    }));
  }
  return view;
}

/// Locks the item row for the rest of the transaction, so two decisions on one question cannot both pass their checks.
export async function lockItem(tx: Tx, tenantId: string, id: string): Promise<ItemRow | null> {
  await tx.$queryRaw`SELECT "id" FROM "QuestionBankItem" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  return tx.questionBankItem.findFirst({ where: { id, tenantId }, select: ITEM_SELECT });
}

/// The words the question is compared by: its prompt and each option (an option is `{ text }` in the bank and a plain string in a quiz).
const inputOf = (row: { prompt: string; options: unknown }) => ({
  prompt: row.prompt,
  options: Array.isArray(row.options) ? row.options.map((option: unknown) => (typeof option === "string" ? option : String((option as { text?: unknown })?.text ?? ""))) : [],
});

const CANDIDATES = 500;
const MAX_FLAGS = 5;

/// The silent overlap check (design note section 7, rule 4): compares the question with the other questions of THIS school's bank that could be confused with it (the same
/// campus's and the school-wide ones, PENDING or APPROVED) and with the questions of quizzes that are published, and keeps the closest few at or above the threshold. Only exam
/// approvers are ever shown the result. Replaces the item's earlier flags, so a corrected question stops being flagged.
export async function refreshOverlap(tx: Tx, row: Pick<ItemRow, "id" | "tenantId" | "campusId" | "prompt" | "options">): Promise<number> {
  const mine = inputOf(row);
  const { tenantId } = row;
  const [bankItems, quizQuestions] = await Promise.all([
    tx.questionBankItem.findMany({
      where: {
        tenantId,
        id: { not: row.id },
        status: { in: ["PENDING", "APPROVED"] },
        OR: row.campusId === null ? [{ campusId: null }] : [{ campusId: row.campusId }, { campusId: null }],
      },
      select: { id: true, prompt: true, options: true },
      orderBy: { createdAt: "desc" },
      take: CANDIDATES,
    }),
    row.campusId === null
      ? Promise.resolve([] as { id: string; prompt: string; options: Prisma.JsonValue }[])
      : tx.quizQuestion.findMany({
          where: { tenantId, quiz: { campusId: row.campusId, status: "PUBLISHED", archivedAt: null } },
          select: { id: true, prompt: true, options: true },
          orderBy: { createdAt: "desc" },
          take: CANDIDATES,
        }),
  ]);
  const scored = [
    ...bankItems.map((candidate) => ({ kind: "bank" as const, id: candidate.id, score: overlapScore(mine, inputOf(candidate)) })),
    ...quizQuestions.map((candidate) => ({ kind: "quiz" as const, id: candidate.id, score: overlapScore(mine, inputOf(candidate)) })),
  ]
    .filter((hit) => hit.score >= OVERLAP_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FLAGS);

  await tx.questionOverlapFlag.deleteMany({ where: { tenantId, itemId: row.id } });
  if (scored.length > 0) {
    await tx.questionOverlapFlag.createMany({
      data: scored.map((hit) => ({
        tenantId,
        itemId: row.id,
        score: Math.min(1, hit.score),
        similarToItemId: hit.kind === "bank" ? hit.id : null,
        similarToAssessmentQuestionId: hit.kind === "quiz" ? hit.id : null,
      })),
    });
  }
  return scored.length;
}

/// A snapshot of what the item says now, kept for every version (the table is append-only).
export const snapshotOf = (row: ItemRow): Prisma.InputJsonValue => ({
  type: row.type,
  prompt: row.prompt,
  explanation: row.explanation,
  points: row.points,
  difficulty: row.difficulty,
  topic: row.topic,
  options: row.options as Prisma.InputJsonValue,
  correctAnswer: row.correctAnswer as Prisma.InputJsonValue,
  subject: row.subjectLabel,
  classTags: row.classTags.map((tag) => tag.label),
  images: row.images.map((image) => ({ id: image.id, alt: image.alt, decorative: image.decorative })),
  visibility: row.visibility,
  visibleFrom: row.visibleFrom ? row.visibleFrom.toISOString() : null,
  status: row.status,
});
