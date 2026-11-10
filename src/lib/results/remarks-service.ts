import { Prisma, ResultStatus } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { assignedArmIds } from "@/lib/attendance/access";
import { cleanRemark, remarkChange, remarkPermissions, remarksVisibleTo, type RemarkChange, type RemarkKey } from "./remarks";

// Report remarks (task 0036): saving them, and reading them for a card. Every refusal is decided BEFORE the first write, and a refusal is a returned failure (the route answers it with its
// status and sentence), never a thrown error: `forTenant().transaction` commits when the function RETURNS.

export type RemarkFailure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string };
const refuse = (status: RemarkFailure["status"], code: string, message: string): RemarkFailure => ({ ok: false, status, code, message });

/// The same sentence for a pupil who does not exist, who is another campus's, who is not on the roll of the term, and for a teacher who is not assigned to the pupil's arm: nothing is confirmed.
export const NO_SUCH_PUPIL = "No such pupil on the roll of that term.";

export type Caller = { role: string; userId: string; campusId: string | null };
export type CardRemarks = {
  teacher: string | null;
  principal: string | null;
  /// None of the pupil's results for the term is published or locked yet: the remarks can still be written.
  editable: boolean;
  /// What THIS viewer may write now (the matrix in remarks.ts, and only while editable).
  canWriteTeacher: boolean;
  canWritePrincipal: boolean;
};

const FROZEN = [ResultStatus.PUBLISHED, ResultStatus.LOCKED];
const frozen = async (tx: Tx, tenantId: string, studentId: string, periodId: string) =>
  (await tx.result.count({ where: { tenantId, studentId, periodId, status: { in: FROZEN } } })) > 0;

/// The remarks as one viewer sees them on the card, and what that viewer may do. `armId` is the pupil's arm in the term's session (null when they had none).
export async function remarksForCard(
  tx: Tx,
  tenantId: string,
  input: { studentId: string; periodId: string; armId: string | null; viewerRole: string; viewerUserId: string },
): Promise<CardRemarks> {
  const { studentId, periodId, armId, viewerRole, viewerUserId } = input;
  const [isFrozen, row] = await Promise.all([
    frozen(tx, tenantId, studentId, periodId),
    tx.reportRemark.findUnique({ where: { tenantId_studentId_periodId: { tenantId, studentId, periodId } } }),
  ]);
  const teaches = viewerRole === "TEACHING_STAFF" && armId !== null && (await assignedArmIds(tx, tenantId, viewerUserId)).has(armId);
  const may = remarkPermissions(viewerRole, teaches);
  const seen = remarksVisibleTo(viewerRole, isFrozen);
  return {
    teacher: seen ? (row?.teacherRemark ?? null) : null,
    principal: seen ? (row?.principalRemark ?? null) : null,
    editable: !isFrozen,
    canWriteTeacher: !isFrozen && may.teacher,
    canWritePrincipal: !isFrozen && may.principal,
  };
}

export type SaveRemarksInput = { periodId: string; teacherRemark?: unknown; principalRemark?: unknown };
export type SavedRemarks = {
  changed: boolean;
  teacherRemark: string | null;
  principalRemark: string | null;
  changes: Partial<Record<RemarkKey, RemarkChange>>;
};

/// Writes the remarks given (a key left out is left alone; null or blank clears). Who may write which, the freeze once anything is published, the clean-up of the text, one audit row naming
/// which remarks changed (never the words), and nothing written when nothing changed.
export async function saveReportRemarks(
  tx: Tx,
  tenantId: string,
  caller: Caller,
  studentId: string,
  input: SaveRemarksInput,
): Promise<{ ok: true; data: SavedRemarks } | RemarkFailure> {
  const keys = (["teacherRemark", "principalRemark"] as const).filter((key) => input[key] !== undefined);
  if (keys.length === 0) return refuse(400, "VALIDATION", "Give the teacher's remark, the principal's remark, or both.");
  const clean: Partial<Record<RemarkKey, string | null>> = {};
  for (const key of keys) {
    const cleaned = cleanRemark(input[key]);
    if (!cleaned.ok) return refuse(400, "VALIDATION", cleaned.message);
    clean[key] = cleaned.value;
  }

  const [student, period] = await Promise.all([
    tx.studentRecord.findFirst({ where: { tenantId, id: studentId }, select: { id: true, campusId: true } }),
    tx.academicPeriod.findFirst({ where: { tenantId, id: input.periodId }, select: { id: true, sessionId: true } }),
  ]);
  if (!student || !period) return refuse(404, "NOT_FOUND", NO_SUCH_PUPIL);
  // A member of one campus reaches that campus's pupils and the school's, as everywhere else.
  if (caller.role !== "ADMIN" && caller.campusId !== null && student.campusId !== null && student.campusId !== caller.campusId)
    return refuse(404, "NOT_FOUND", NO_SUCH_PUPIL);
  // The pupil's place in that term's session: a remark is about a term the pupil was on the roll of. (A pupil who left, was promoted or graduated since still was.)
  const enrolment = await tx.studentEnrollment.findFirst({
    where: { tenantId, studentId, sessionId: period.sessionId, status: { in: ["ACTIVE", "PROMOTED", "REPEATED", "ALUMNI"] } },
    select: { classArmId: true },
  });
  if (!enrolment) return refuse(404, "NOT_FOUND", NO_SUCH_PUPIL);

  const teaches = caller.role === "TEACHING_STAFF" && (await assignedArmIds(tx, tenantId, caller.userId)).has(enrolment.classArmId);
  // A teacher who does not teach this pupil is told what an unknown pupil is told.
  if (caller.role === "TEACHING_STAFF" && !teaches) return refuse(404, "NOT_FOUND", NO_SUCH_PUPIL);
  const may = remarkPermissions(caller.role, teaches);
  if (clean.principalRemark !== undefined && !may.principal)
    return refuse(403, "FORBIDDEN", "Only the school administrator writes the principal's remark.");
  if (clean.teacherRemark !== undefined && !may.teacher)
    return refuse(403, "FORBIDDEN", "You cannot write the teacher's remark on this pupil's report card.");

  if (await frozen(tx, tenantId, studentId, period.id))
    return refuse(409, "CONFLICT", "This pupil's results for the term are published, so the remarks can no longer be changed.");

  const key = { tenantId_studentId_periodId: { tenantId, studentId, periodId: period.id } };
  const existing = await tx.reportRemark.findUnique({ where: key });
  const next = {
    teacherRemark: clean.teacherRemark === undefined ? (existing?.teacherRemark ?? null) : clean.teacherRemark,
    principalRemark: clean.principalRemark === undefined ? (existing?.principalRemark ?? null) : clean.principalRemark,
  };
  const changes: Partial<Record<RemarkKey, RemarkChange>> = {};
  for (const k of keys) {
    const change = remarkChange(existing?.[k] ?? null, next[k]);
    if (change) changes[k] = change;
  }
  if (Object.keys(changes).length === 0) return { ok: true, data: { changed: false, ...next, changes } };

  // Who wrote what moves with the text: set or changed = the caller; cleared = nobody; an untouched remark keeps its author.
  const author = (k: RemarkKey, by: string | null | undefined) =>
    clean[k] === undefined ? (by ?? null) : clean[k] === null ? null : caller.userId;
  const data = {
    teacherRemark: next.teacherRemark,
    teacherRemarkByUserId: author("teacherRemark", existing?.teacherRemarkByUserId),
    principalRemark: next.principalRemark,
    principalRemarkByUserId: author("principalRemark", existing?.principalRemarkByUserId),
  };
  let rowId: string;
  if (next.teacherRemark === null && next.principalRemark === null) {
    // Both cleared: the row has nothing left to hold.
    await tx.reportRemark.delete({ where: key });
    rowId = existing!.id;
  } else if (existing) {
    await tx.reportRemark.update({ where: key, data });
    rowId = existing.id;
  } else {
    try {
      rowId = (await tx.reportRemark.create({ data: { tenantId, studentId, periodId: period.id, ...data }, select: { id: true } })).id;
    } catch (error) {
      // Two people saved the first remark of this pupil and term at the same moment: the other one won. Say so, so the screen reloads and the second person sees what is there.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        return refuse(409, "CONFLICT", "Someone else has just saved remarks for this pupil. Reload the card to see them.");
      throw error;
    }
  }
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: caller.userId,
      action: "REPORT_REMARKS_SAVED",
      targetType: "ReportRemark",
      targetId: rowId,
      afterValue: { studentId, periodId: period.id, changes },
    },
  });
  return { ok: true, data: { changed: true, ...next, changes } };
}
