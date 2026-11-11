import { Decimal } from "@prisma/client/runtime/library";
import { EnrollmentStatus, Prisma, PromotionDecision, PromotionDecisionMode, ResultStatus } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import type { ErrorDetail } from "@/lib/api/envelope";
import {
  DEFAULT_PASS_MARK,
  campusAdminMayRoll,
  classCalendarProblem,
  computeStudentSessionAverage,
  evaluatePromotionRecommendation,
  nextRungClasses,
  resolveTargetArm,
  streamPlacement,
  sessionPairProblem,
  validateSessionPromotionEligibility,
  finalTermGap,
} from "./rules";
import type { ExecutePromotionInput, PromotionOverride, PromotionPlacement, PromotionPreviewQuery } from "./validation";

// Rolling a class into the next session (task 0031; AlEemaan's tasks 0025 and 0037, whose nine faults are built out here from the start - see the task file, section 3.3).
//
// Every refusal is decided BEFORE the first write: `forTenant().transaction` commits when the function RETURNS and rolls back only when it THROWS (ADR 0002), and a PromotionError is
// thrown, so a refused roll leaves nothing behind either way.

/// A request that cannot be a rollover. The routes answer it with `status` and the message, which says what to change; it is never a 500.
export class PromotionError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
    /// What the client reads the refusal by (task 0040: `UNDO_BLOCKED`, `ALREADY_UNDONE`); `PROMOTION_REFUSED` for every refusal of a roll.
    public readonly code: string = "PROMOTION_REFUSED",
    /// A list the refusal carries (task 0040: the pupils that stop an undo, one line each).
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "PromotionError";
  }
}

/// Who is rolling: their role in this school and the campus their membership is anchored to (null = the whole school).
export type Caller = { role: string; campusId: string | null; userId: string };

export const NO_SUCH_CLASS = "The class was not found.";

export interface StudentPreviewRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  currentArmId: string;
  currentArmName: string;
  termAverages: Record<number, number | null>;
  overallAverage: number | null;
  recommendedDecision: PromotionDecision;
  recommendationReason: string;
  targetClassArmId: string | null;
  targetClassArmName: string | null;
  /// The class the pupil would be placed in (the next class for a promotion, their own for a repeat), null for a graduate or a leaver (task 0035).
  targetClassGroupId: string | null;
  targetClassGroupName: string | null;
  /// The pupil is to be promoted, has no place in the next session yet, and the next rung has several classes whose stream cannot be worked out from this class: the roll will not guess.
  needsPlacement: boolean;
  /// The pupil already has an enrolment in the target session: a roll leaves them alone.
  alreadyEnrolledInTarget: boolean;
}

/// A class a promoted pupil may be placed in: a live class of the next rung, with its live arms.
export interface RungClass {
  id: string;
  name: string;
  streamName: string | null;
  arms: { id: string; name: string }[];
}

export interface PromotionPreview {
  sourceClassGroup: { id: string; name: string; sortOrder: number };
  targetClassGroup: { id: string; name: string; sortOrder: number } | null;
  isTerminalClass: boolean;
  passMark: number;
  academicPeriods: { id: string; ordinal: number; label: string; isCurrent: boolean }[];
  eligibility: { eligible: boolean; finalPeriodOrdinal: number; reason?: string };
  /// Advice (task 0047): how many pupils to be rolled have no published marks for the final period, so their average does not count it. `null` when nobody is missing. Never a refusal.
  finalTermGap: { ordinal: number; label: string; pupils: number } | null;
  targetArms: { id: string; name: string }[];
  /// Every live class of the next rung (one, or several when a school has streams). The roll's default target is `targetClassGroup`; a pupil may be placed in any of these.
  rungClasses: RungClass[];
  /// The stream of this class does not say which of `rungClasses` the pupils go to: every pupil to be promoted needs a placement.
  placementNeeded: boolean;
  students: StudentPreviewRow[];
  summary: { totalEvaluated: number; totalPromoted: number; totalRepeated: number; totalGraduated: number; totalSkipped: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/// Both sessions are live ones of this school and make a valid pair, and the class fits the calendar they belong to. Another school's id is the same 404 as an unknown one.
async function checkSessions(tx: Tx, tenantId: string, sourceSessionId: string, targetSessionId: string, classCampusId: string | null) {
  const sessions = await tx.academicSession.findMany({
    where: { tenantId, id: { in: [sourceSessionId, targetSessionId] }, archivedAt: null },
    select: { id: true, startDate: true, campusId: true, status: true },
  });
  const source = sessions.find((s) => s.id === sourceSessionId);
  const target = sessions.find((s) => s.id === targetSessionId);
  if (!source) throw new PromotionError("The source session was not found.", 404);
  if (!target) throw new PromotionError("The target session was not found.", 404);
  const problem = sessionPairProblem(source, target) ?? classCalendarProblem(classCampusId, source.campusId);
  if (problem) throw new PromotionError(problem);
  if (target.status === "CLOSED") throw new PromotionError("The target session is closed. Pupils cannot be enrolled into it.", 409);
  return { source, target };
}

/// The class the caller may roll: a campus administrator rolls only their own campus's classes (or the school's classes in their own campus's calendar); another campus's class is the
/// same 404 as an unknown one, a school-wide class in the school's own calendar is the school administrator's (403).
function checkCampus(caller: Caller, classCampusId: string | null, sessionCampusId: string | null) {
  if (caller.role === "ADMIN") return;
  if (caller.role !== "CAMPUS_ADMIN") throw new PromotionError("Only an administrator can promote a class.", 403);
  if (campusAdminMayRoll(caller.campusId, classCampusId, sessionCampusId)) return;
  if (classCampusId === null)
    throw new PromotionError("That class belongs to the whole school. Only the school administrator can promote it.", 403);
  throw new PromotionError(NO_SUCH_CLASS, 404);
}

/** A dry run for one class: who is on the roll, what each pupil scored in each period, what the rule advises and where they would go. Writes nothing. */
export async function previewPromotion(tx: Tx, tenantId: string, caller: Caller, query: PromotionPreviewQuery): Promise<PromotionPreview> {
  const { sourceSessionId, targetSessionId, sourceClassGroupId, passMark } = query;

  const classes = await tx.classGroup.findMany({
    where: { tenantId },
    select: { id: true, name: true, sortOrder: true, campusId: true, archivedAt: true, streamName: true },
  });
  const sourceClass = classes.find((c) => c.id === sourceClassGroupId);
  // An archived class has no roll worth rolling and is not offered; naming one is the same 404 as an unknown one.
  if (!sourceClass || sourceClass.archivedAt) throw new PromotionError(NO_SUCH_CLASS, 404);
  // Who may roll it is judged before the sessions are looked at, so a campus administrator learns nothing of another campus's class.
  if (caller.role !== "ADMIN" && caller.role !== "CAMPUS_ADMIN")
    throw new PromotionError("Only an administrator can promote a class.", 403);
  if (caller.role === "CAMPUS_ADMIN" && sourceClass.campusId !== null && sourceClass.campusId !== caller.campusId)
    throw new PromotionError(NO_SUCH_CLASS, 404);
  const { source } = await checkSessions(tx, tenantId, sourceSessionId, targetSessionId, sourceClass.campusId);
  checkCampus(caller, sourceClass.campusId, source.campusId);

  const rung = nextRungClasses(sourceClass, classes);
  const { target: nextClass, needsPlacement: placementNeeded } = streamPlacement(sourceClass, rung);
  const isTerminalClass = rung.length === 0;
  const rungArms = rung.length
    ? await tx.classArm.findMany({
        where: { tenantId, classGroupId: { in: rung.map((c) => c.id) }, archivedAt: null },
        select: { id: true, name: true, classGroupId: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      })
    : [];
  const armsOf = (classId: string) => rungArms.filter((a) => a.classGroupId === classId).map((a) => ({ id: a.id, name: a.name }));
  const rungClasses: RungClass[] = rung.map((c) => ({ id: c.id, name: c.name, streamName: c.streamName ?? null, arms: armsOf(c.id) }));
  const targetArms = nextClass ? armsOf(nextClass.id) : [];

  const periods = await tx.academicPeriod.findMany({
    where: { tenantId, sessionId: sourceSessionId, archivedAt: null },
    select: { id: true, ordinal: true, label: true, isCurrent: true },
    orderBy: { ordinal: "asc" },
  });
  const eligibility = validateSessionPromotionEligibility(periods);

  // The roll: pupils ACTIVE in this class in the source session. An expelled pupil's enrolment is EXPELLED, not ACTIVE, so they are not here and are never touched; a suspended pupil is.
  const enrolments = await tx.studentEnrollment.findMany({
    where: {
      tenantId,
      sessionId: sourceSessionId,
      status: EnrollmentStatus.ACTIVE,
      classArm: { classGroupId: sourceClassGroupId },
      student: {
        archivedAt: null,
        ...(caller.role === "CAMPUS_ADMIN" ? { OR: [{ campusId: null }, { campusId: caller.campusId }] } : {}),
      },
    },
    select: {
      studentId: true,
      classArmId: true,
      classArm: { select: { name: true } },
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { studentId: "asc" }],
  });
  const studentIds = enrolments.map((e) => e.studentId);

  // Only a result the school has stood behind counts: PUBLISHED or LOCKED.
  const results = studentIds.length
    ? await tx.result.findMany({
        where: {
          tenantId,
          studentId: { in: studentIds },
          period: { sessionId: sourceSessionId },
          status: { in: [ResultStatus.PUBLISHED, ResultStatus.LOCKED] },
        },
        select: { studentId: true, score: true, maxScore: true, period: { select: { ordinal: true } } },
      })
    : [];
  const already = studentIds.length
    ? new Set(
        (
          await tx.studentEnrollment.findMany({
            // A place that an undone roll cancelled (task 0040) is not a place: the pupil is rolled normally and the cancelled row is revived.
            where: { tenantId, sessionId: targetSessionId, studentId: { in: studentIds }, status: { not: EnrollmentStatus.CANCELLED } },
            select: { studentId: true },
          })
        ).map((e) => e.studentId),
      )
    : new Set<string>();

  // student -> period ordinal -> the percentages of that term's subjects
  const percentages = new Map<string, Map<number, number[]>>();
  for (const r of results) {
    const max = Number(r.maxScore);
    const pct = max > 0 ? (Number(r.score) / max) * 100 : 0;
    const perTerm = percentages.get(r.studentId) ?? new Map<number, number[]>();
    perTerm.set(r.period.ordinal, [...(perTerm.get(r.period.ordinal) ?? []), pct]);
    percentages.set(r.studentId, perTerm);
  }

  let totalPromoted = 0;
  let totalRepeated = 0;
  let totalGraduated = 0;
  let totalSkipped = 0;
  const students: StudentPreviewRow[] = enrolments.map((enrolment) => {
    const perTerm = percentages.get(enrolment.studentId);
    const termAverages: Record<number, number | null> = {};
    for (const p of periods) {
      const scores = perTerm?.get(p.ordinal);
      termAverages[p.ordinal] = scores && scores.length > 0 ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    }
    const overallAverage = computeStudentSessionAverage(periods.map((p) => termAverages[p.ordinal]));
    const advice = evaluatePromotionRecommendation(overallAverage, isTerminalClass, passMark);
    const alreadyEnrolledInTarget = already.has(enrolment.studentId);
    if (alreadyEnrolledInTarget) totalSkipped++;
    else if (advice.decision === PromotionDecision.PROMOTED) totalPromoted++;
    else if (advice.decision === PromotionDecision.GRADUATED) totalGraduated++;
    else totalRepeated++;
    const armId =
      advice.decision === PromotionDecision.PROMOTED ? resolveTargetArm(enrolment.classArm.name, targetArms) : enrolment.classArmId;
    return {
      studentId: enrolment.studentId,
      admissionNo: enrolment.student.admissionNo,
      firstName: enrolment.student.firstName,
      lastName: enrolment.student.lastName,
      currentArmId: enrolment.classArmId,
      currentArmName: enrolment.classArm.name,
      termAverages,
      overallAverage,
      recommendedDecision: advice.decision,
      recommendationReason: advice.reason,
      targetClassArmId: armId,
      targetClassArmName:
        targetArms.find((a) => a.id === armId)?.name ?? (advice.decision === PromotionDecision.PROMOTED ? null : enrolment.classArm.name),
      targetClassGroupId:
        advice.decision === PromotionDecision.PROMOTED
          ? (nextClass?.id ?? null)
          : advice.decision === PromotionDecision.REPEATED
            ? sourceClass.id
            : null,
      targetClassGroupName:
        advice.decision === PromotionDecision.PROMOTED
          ? (nextClass?.name ?? null)
          : advice.decision === PromotionDecision.REPEATED
            ? sourceClass.name
            : null,
      needsPlacement: placementNeeded && advice.decision === PromotionDecision.PROMOTED && !alreadyEnrolledInTarget,
      alreadyEnrolledInTarget,
    };
  });

  return {
    sourceClassGroup: { id: sourceClass.id, name: sourceClass.name, sortOrder: sourceClass.sortOrder },
    targetClassGroup: nextClass ? { id: nextClass.id, name: nextClass.name, sortOrder: nextClass.sortOrder } : null,
    isTerminalClass,
    passMark,
    academicPeriods: periods,
    eligibility,
    finalTermGap: finalTermGap(periods, students),
    targetArms,
    rungClasses,
    placementNeeded,
    students,
    summary: { totalEvaluated: students.length, totalPromoted, totalRepeated, totalGraduated, totalSkipped },
  };
}

const nameOf = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`;
/// "Ada Obi", "Ada Obi and Bayo Ade", "Ada Obi, Bayo Ade, Chi Eze and 4 more": a sentence can name some pupils without becoming a list.
function namesOf(rows: readonly { firstName: string; lastName: string }[]): string {
  const shown = rows.slice(0, 3).map(nameOf);
  if (rows.length > 3) return `${shown.join(", ")} and ${rows.length - 3} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
}

/// What a placement may ask for (task 0035): a pupil on the roll who is to be promoted and has no place in the next session yet, into a live class of the NEXT rung (never any class of
/// the school), and, when the stream of this class does not say where its pupils go, one for every pupil who is to be promoted. Returns studentId -> class. Decided before the first write.
function checkPlacements(
  preview: PromotionPreview,
  placements: readonly PromotionPlacement[],
  overrides: ReadonlyMap<string, PromotionOverride>,
): Map<string, string> {
  const roster = new Map(preview.students.map((row) => [row.studentId, row]));
  const finalDecision = (row: StudentPreviewRow) => overrides.get(row.studentId)?.decision ?? row.recommendedDecision;
  const allowed = new Set(preview.rungClasses.map((c) => c.id));
  const placed = new Map<string, string>();
  for (const p of placements) {
    const row = roster.get(p.studentId);
    if (!row)
      throw new PromotionError(
        "A placement names a pupil who is not in this class for the source session. Generate the preview again.",
        409,
      );
    if (finalDecision(row) !== PromotionDecision.PROMOTED)
      throw new PromotionError(`${nameOf(row)} is not being promoted, so there is no next class to choose for them.`, 409);
    if (row.alreadyEnrolledInTarget)
      throw new PromotionError(`${nameOf(row)} already has a place in the next session, so there is nothing to choose.`, 409);
    if (!allowed.has(p.classGroupId))
      throw new PromotionError(
        `${preview.sourceClassGroup.name} does not move up into the class chosen for ${nameOf(row)}. Choose ${
          preview.rungClasses.length > 0 ? `one of ${preview.rungClasses.map((c) => c.name).join(", ")}` : "no class: it is the last one"
        }.`,
        409,
      );
    placed.set(p.studentId, p.classGroupId);
  }
  if (preview.placementNeeded) {
    const missing = preview.students.filter(
      (row) => !row.alreadyEnrolledInTarget && finalDecision(row) === PromotionDecision.PROMOTED && !placed.has(row.studentId),
    );
    if (missing.length > 0)
      throw new PromotionError(
        `${preview.sourceClassGroup.name} moves up into more than one class and is not a stream of any of them. Choose the class for ${namesOf(missing)}.`,
        409,
      );
  }
  return placed;
}

/// What an override may ask for: only a pupil on the roll, no PROMOTED where there is no next class, no GRADUATED for a class that has one, and an arm that really belongs to the class the
/// pupil goes to (the next class for a promotion, the same class for a repeat) and is still in use. Each refusal names the pupil and says what to change.
async function checkOverrides(
  tx: Tx,
  tenantId: string,
  preview: PromotionPreview,
  overrides: ReadonlyMap<string, PromotionOverride>,
  placements: ReadonlyMap<string, string>,
) {
  const roster = new Map(preview.students.map((row) => [row.studentId, row]));
  const armIds = [...new Set([...overrides.values()].map((o) => o.targetClassArmId).filter((x): x is string => Boolean(x)))];
  const arms = armIds.length
    ? await tx.classArm.findMany({ where: { tenantId, id: { in: armIds } }, select: { id: true, classGroupId: true, archivedAt: true } })
    : [];
  const armById = new Map(arms.map((a) => [a.id, a]));

  for (const o of overrides.values()) {
    const row = roster.get(o.studentId);
    if (!row)
      throw new PromotionError(
        "An override names a pupil who is not in this class for the source session. Generate the preview again.",
        409,
      );
    const name = `${row.firstName} ${row.lastName}`;
    if (!o.overrideReason) throw new PromotionError(`Say why ${name} is handled differently from what the rule advises.`);
    if (o.decision === PromotionDecision.PROMOTED && !preview.targetClassGroup) {
      throw new PromotionError(
        `${name} cannot be promoted: ${preview.sourceClassGroup.name} has no next class. Graduate or repeat them instead.`,
      );
    }
    if (o.decision === PromotionDecision.GRADUATED && preview.targetClassGroup) {
      throw new PromotionError(
        `${name} cannot graduate: ${preview.sourceClassGroup.name} has a next class (${preview.targetClassGroup.name}). Promote or repeat them instead.`,
      );
    }
    if (o.targetClassArmId) {
      const placed = placements.get(o.studentId);
      const goesTo =
        o.decision === PromotionDecision.PROMOTED
          ? (preview.rungClasses.find((c) => c.id === placed) ?? preview.targetClassGroup)
          : o.decision === PromotionDecision.REPEATED
            ? preview.sourceClassGroup
            : null;
      if (!goesTo) throw new PromotionError(`${name} is not moving to a class, so there is no arm to choose.`);
      const arm = armById.get(o.targetClassArmId);
      if (!arm || arm.archivedAt || arm.classGroupId !== goesTo.id)
        throw new PromotionError(`The arm chosen for ${name} is not an active arm of ${goesTo.name}.`);
    }
  }
}

export interface PromotionBatchView {
  id: string;
  createdAt: string;
  passMark: number;
  notes: string | null;
  sourceSession: { id: string; label: string };
  targetSession: { id: string; label: string };
  sourceClassGroup: { id: string; name: string };
  targetClassGroup: { id: string; name: string } | null;
  executedBy: { id: string; name: string | null; email: string | null };
  /// Set when the roll was undone (task 0040): when, why, by whom, and how many pupils were put back.
  reversal: {
    createdAt: string;
    reason: string;
    restored: number;
    cancelled: number;
    by: { id: string; name: string | null; email: string | null };
  } | null;
  totals: { evaluated: number; promoted: number; repeated: number; graduated: number; withdrawn: number; skipped: number };
}

type BatchRow = Prisma.PromotionBatchGetPayload<Record<string, never>>;

/// The names a batch is shown with, read in a few queries for a whole list.
async function viewBatches(tx: Tx, tenantId: string, rows: BatchRow[]): Promise<PromotionBatchView[]> {
  if (rows.length === 0) return [];
  const sessionIds = [...new Set(rows.flatMap((b) => [b.sourceSessionId, b.targetSessionId]))];
  const classIds = [...new Set(rows.flatMap((b) => [b.sourceClassGroupId, b.targetClassGroupId]).filter((x): x is string => x !== null))];
  const reversals = await tx.promotionReversal.findMany({ where: { tenantId, batchId: { in: rows.map((b) => b.id) } } });
  const reversalOf = new Map(reversals.map((r) => [r.batchId, r]));
  const userIds = [...new Set([...rows.map((b) => b.executedByUserId), ...reversals.map((r) => r.reversedByUserId)])];
  const [sessions, classes, users] = await Promise.all([
    tx.academicSession.findMany({ where: { tenantId, id: { in: sessionIds } }, select: { id: true, label: true } }),
    tx.classGroup.findMany({ where: { tenantId, id: { in: classIds } }, select: { id: true, name: true } }),
    tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
  ]);
  const session = new Map(sessions.map((s) => [s.id, s]));
  const klass = new Map(classes.map((c) => [c.id, c]));
  const user = new Map(users.map((u) => [u.id, u]));
  return rows.map((b) => ({
    id: b.id,
    createdAt: b.createdAt.toISOString(),
    passMark: Number(b.passMark),
    notes: b.notes,
    sourceSession: session.get(b.sourceSessionId) ?? { id: b.sourceSessionId, label: "(removed)" },
    targetSession: session.get(b.targetSessionId) ?? { id: b.targetSessionId, label: "(removed)" },
    sourceClassGroup: klass.get(b.sourceClassGroupId) ?? { id: b.sourceClassGroupId, name: "(removed)" },
    targetClassGroup: b.targetClassGroupId ? (klass.get(b.targetClassGroupId) ?? { id: b.targetClassGroupId, name: "(removed)" }) : null,
    executedBy: {
      id: b.executedByUserId,
      name: user.get(b.executedByUserId)?.name ?? null,
      email: user.get(b.executedByUserId)?.email ?? null,
    },
    reversal: reversalOf.has(b.id)
      ? {
          createdAt: reversalOf.get(b.id)!.createdAt.toISOString(),
          reason: reversalOf.get(b.id)!.reason,
          restored: reversalOf.get(b.id)!.restored,
          cancelled: reversalOf.get(b.id)!.cancelled,
          by: {
            id: reversalOf.get(b.id)!.reversedByUserId,
            name: user.get(reversalOf.get(b.id)!.reversedByUserId)?.name ?? null,
            email: user.get(reversalOf.get(b.id)!.reversedByUserId)?.email ?? null,
          },
        }
      : null,
    totals: {
      evaluated: b.totalEvaluated,
      promoted: b.totalPromoted,
      repeated: b.totalRepeated,
      graduated: b.totalGraduated,
      withdrawn: b.totalWithdrawn,
      skipped: b.totalSkipped,
    },
  }));
}

/**
 * Commits a roll. The pupils are processed under a row lock on their source enrolments (in id order, so two overlapping rolls cannot wait on each other) and each with a compare-and-set on
 * ACTIVE, so two administrators pressing the button together process each pupil once: the second finds them already dealt with and records none. A pupil who already has an enrolment in the
 * target session is left alone (never overwritten: it may be a placement an administrator made by hand). The batch is written ONCE, with its final totals, because the table is append-only.
 */
export async function executePromotion(tx: Tx, tenantId: string, caller: Caller, input: ExecutePromotionInput) {
  const { sourceSessionId, targetSessionId, sourceClassGroupId, targetClassGroupId, passMark, overrides, placements, notes } = input;

  const preview = await previewPromotion(tx, tenantId, caller, { sourceSessionId, targetSessionId, sourceClassGroupId, passMark });

  // The class pupils move to is whatever the progression says NOW; a screen opened before a class was added or archived must be refreshed, not obeyed.
  if (targetClassGroupId !== undefined && (targetClassGroupId ?? null) !== (preview.targetClassGroup?.id ?? null)) {
    throw new PromotionError("The class these pupils move to has changed since the preview was made. Generate the preview again.", 409);
  }
  const overrideMap = new Map(overrides.map((o) => [o.studentId, o]));
  const placementMap = checkPlacements(preview, placements, overrideMap);
  await checkOverrides(tx, tenantId, preview, overrideMap, placementMap);

  // Somebody is to be promoted into a class that has no arm: refuse now, before the first write, instead of failing half way through the roll.
  const rungById = new Map(preview.rungClasses.map((c) => [c.id, c]));
  const classOf = (studentId: string) => placementMap.get(studentId) ?? preview.targetClassGroup?.id ?? null;
  const movers = preview.students.filter(
    (p) => !p.alreadyEnrolledInTarget && (overrideMap.get(p.studentId)?.decision ?? p.recommendedDecision) === PromotionDecision.PROMOTED,
  );
  for (const classId of new Set(movers.map((m) => classOf(m.studentId)))) {
    const goesTo = classId ? rungById.get(classId) : undefined;
    if (goesTo && goesTo.arms.length === 0) {
      throw new PromotionError(
        `${goesTo.name} has no arm yet, so nobody can be promoted into it. Add an arm under Classes & subjects first.`,
        409,
      );
    }
  }

  // Lock the source enrolments of the roll, then read their status under the lock.
  const rosterIds = preview.students.map((s) => s.studentId);
  const held = rosterIds.length
    ? await tx.$queryRaw<{ id: string; studentId: string; status: EnrollmentStatus }[]>`
        SELECT id, "studentId", status FROM "StudentEnrollment"
        WHERE "tenantId" = ${tenantId} AND "sessionId" = ${sourceSessionId} AND "studentId" = ANY(${rosterIds}::text[])
        ORDER BY id
        FOR UPDATE`
    : [];
  const source = new Map(held.map((row) => [row.studentId, row]));

  const records: Prisma.PromotionRecordCreateManyInput[] = [];
  const totals = { promoted: 0, repeated: 0, graduated: 0, withdrawn: 0, skipped: 0 };

  // Who already has a place in the target session is read AGAIN, under the lock. The preview's answer was read before the lock: a roll that committed in between would have made it say "already
  // placed" about pupils it had itself just moved, and this roll would then record a batch that "left them as they were".
  const targetPlaces = rosterIds.length
    ? await tx.studentEnrollment.findMany({
        where: { tenantId, sessionId: targetSessionId, studentId: { in: rosterIds } },
        select: { id: true, studentId: true, status: true },
      })
    : [];
  const placedNow = new Set(targetPlaces.filter((e) => e.status !== EnrollmentStatus.CANCELLED).map((e) => e.studentId));
  // A place that an undone roll cancelled (task 0040) is brought back to life, not duplicated: an enrolment is unique per pupil and session.
  const cancelledPlace = new Map(targetPlaces.filter((e) => e.status === EnrollmentStatus.CANCELLED).map((e) => [e.studentId, e.id]));

  for (const pupil of preview.students) {
    const sourceEnrolment = source.get(pupil.studentId);
    // Already dealt with (by an earlier roll of this class, or by hand): leave it alone, so running the same roll twice changes nothing the second time.
    if (!sourceEnrolment || sourceEnrolment.status !== EnrollmentStatus.ACTIVE) continue;
    // Still on the roll, but with a place in the next session already (put there by hand): leave them as they are, never overwrite it.
    if (placedNow.has(pupil.studentId)) {
      totals.skipped++;
      continue;
    }

    const override = overrideMap.get(pupil.studentId);
    const decision = override ? override.decision : pupil.recommendedDecision;
    const sourceStatus =
      decision === PromotionDecision.PROMOTED
        ? EnrollmentStatus.PROMOTED
        : decision === PromotionDecision.GRADUATED
          ? EnrollmentStatus.ALUMNI
          : decision === PromotionDecision.WITHDRAWN
            ? EnrollmentStatus.WITHDRAWN
            : EnrollmentStatus.REPEATED;
    const moved = await tx.studentEnrollment.updateMany({
      where: { tenantId, id: sourceEnrolment.id, status: EnrollmentStatus.ACTIVE },
      data: { status: sourceStatus },
    });
    if (moved.count === 0) continue;

    let targetEnrollmentId: string | null = null;
    let placedClassId: string | null = null;
    if (decision === PromotionDecision.PROMOTED || decision === PromotionDecision.REPEATED) {
      const promoted = decision === PromotionDecision.PROMOTED;
      // The class follows the FINAL decision too: the one the pupil was placed in (or the next class) for a promotion, their own for a repeat.
      placedClassId = promoted ? classOf(pupil.studentId) : sourceClassGroupId;
      // The arm follows the FINAL decision: the matching arm of that class for a promotion, the pupil's own arm for a repeat; an arm the administrator chose wins (checked above).
      const armId =
        override?.targetClassArmId ||
        (promoted
          ? resolveTargetArm(pupil.currentArmName, (placedClassId ? rungById.get(placedClassId)?.arms : null) ?? [])
          : pupil.currentArmId);
      if (!armId)
        throw new PromotionError(
          `${pupil.firstName} ${pupil.lastName} cannot be promoted: ${(placedClassId ? rungById.get(placedClassId)?.name : null) ?? "the next class"} has no arm.`,
          409,
        );
      const revivable = cancelledPlace.get(pupil.studentId);
      if (revivable) {
        const revived = await tx.studentEnrollment.updateMany({
          where: { tenantId, id: revivable, status: EnrollmentStatus.CANCELLED },
          data: { status: EnrollmentStatus.ACTIVE, classArmId: armId },
        });
        if (revived.count !== 1)
          throw new PromotionError(
            `${pupil.firstName} ${pupil.lastName}'s place changed while the roll was being made. Generate the preview again.`,
            409,
          );
        targetEnrollmentId = revivable;
      } else {
        const created = await tx.studentEnrollment.create({
          data: { tenantId, studentId: pupil.studentId, sessionId: targetSessionId, classArmId: armId, status: EnrollmentStatus.ACTIVE },
          select: { id: true },
        });
        targetEnrollmentId = created.id;
      }
    }

    if (decision === PromotionDecision.PROMOTED) totals.promoted++;
    else if (decision === PromotionDecision.GRADUATED) totals.graduated++;
    else if (decision === PromotionDecision.WITHDRAWN) totals.withdrawn++;
    else totals.repeated++;

    records.push({
      tenantId,
      batchId: "", // set below, once the batch exists
      studentId: pupil.studentId,
      sourceEnrollmentId: sourceEnrolment.id,
      targetEnrollmentId,
      targetClassGroupId: targetEnrollmentId ? placedClassId : null,
      overallAverage: pupil.overallAverage === null ? null : new Decimal(pupil.overallAverage),
      termAverages: pupil.termAverages as unknown as Prisma.InputJsonValue,
      decision,
      decisionMode: override ? PromotionDecisionMode.OVERRIDDEN : PromotionDecisionMode.AUTOMATIC,
      overrideReason: override?.overrideReason ?? null,
    });
  }

  // Nobody was processed (the class was already rolled, or another roll got to every pupil first): there is nothing to record, so say so instead of writing an empty batch. Nothing has been
  // written at this point, so refusing leaves the database as it was.
  if (records.length === 0 && totals.skipped === 0) {
    throw new PromotionError(
      "Nobody on the roll of this class could be processed. It may already have been rolled. Generate the preview again.",
      409,
    );
  }

  const batch = await tx.promotionBatch.create({
    data: {
      tenantId,
      sourceSessionId,
      targetSessionId,
      sourceClassGroupId,
      targetClassGroupId: preview.targetClassGroup?.id ?? null,
      passMark: new Decimal(passMark ?? DEFAULT_PASS_MARK),
      totalEvaluated: preview.students.length,
      totalPromoted: totals.promoted,
      totalRepeated: totals.repeated,
      totalGraduated: totals.graduated,
      totalWithdrawn: totals.withdrawn,
      totalSkipped: totals.skipped,
      executedByUserId: caller.userId,
      notes: notes ?? null,
    },
  });
  if (records.length > 0) await tx.promotionRecord.createMany({ data: records.map((r) => ({ ...r, batchId: batch.id })) });

  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: caller.userId,
      action: "PROMOTION_EXECUTED",
      targetType: "PromotionBatch",
      targetId: batch.id,
      afterValue: {
        sourceSessionId,
        targetSessionId,
        sourceClassGroupId,
        targetClassGroupId: preview.targetClassGroup?.id ?? null,
        totals: { evaluated: preview.students.length, ...totals },
        placements: placementMap.size,
      },
    },
  });

  const [view] = await viewBatches(tx, tenantId, [batch]);
  return view;
}

/// Which batches the caller may see: an administrator all, a campus administrator those of their own campus's classes and of the school's classes in their own campus's calendar.
async function visibleBatches(tx: Tx, tenantId: string, caller: Caller): Promise<Prisma.PromotionBatchWhereInput> {
  if (caller.role === "ADMIN") return { tenantId };
  if (caller.role !== "CAMPUS_ADMIN" || caller.campusId === null) return { tenantId, id: "" }; // nothing
  const [classes, sessions] = await Promise.all([
    tx.classGroup.findMany({ where: { tenantId }, select: { id: true, campusId: true } }),
    tx.academicSession.findMany({ where: { tenantId, campusId: caller.campusId }, select: { id: true } }),
  ]);
  return {
    tenantId,
    OR: [
      { sourceClassGroupId: { in: classes.filter((c) => c.campusId === caller.campusId).map((c) => c.id) } },
      {
        sourceClassGroupId: { in: classes.filter((c) => c.campusId === null).map((c) => c.id) },
        sourceSessionId: { in: sessions.map((s) => s.id) },
      },
    ],
  };
}

export async function listPromotionBatches(tx: Tx, tenantId: string, caller: Caller): Promise<PromotionBatchView[]> {
  const rows = await tx.promotionBatch.findMany({
    where: await visibleBatches(tx, tenantId, caller),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return viewBatches(tx, tenantId, rows);
}

/// One batch with its records, each with the decision that was TAKEN and the one the rule ADVISED (recomputed from the stored average, the batch's pass mark and whether it had a next class:
/// a pure function, so the history shows both without a second copy in the database). null for a batch that is not there or that the caller may not see.
export async function getPromotionBatch(tx: Tx, tenantId: string, caller: Caller, batchId: string) {
  const row = await tx.promotionBatch.findFirst({ where: { AND: [await visibleBatches(tx, tenantId, caller), { id: batchId }] } });
  if (!row) return null;
  const [batch] = await viewBatches(tx, tenantId, [row]);
  const stored = await tx.promotionRecord.findMany({ where: { tenantId, batchId } });
  const students = await tx.studentRecord.findMany({
    where: { tenantId, id: { in: stored.map((r) => r.studentId) } },
    select: { id: true, admissionNo: true, firstName: true, lastName: true },
  });
  const who = new Map(students.map((s) => [s.id, s]));
  const records = stored
    .map((r) => ({ ...r, student: who.get(r.studentId) ?? { id: r.studentId, admissionNo: "", firstName: "(removed)", lastName: "" } }))
    .sort(
      (a, b) =>
        a.student.lastName.localeCompare(b.student.lastName) ||
        a.student.firstName.localeCompare(b.student.firstName) ||
        a.studentId.localeCompare(b.studentId),
    );
  const terminal = row.targetClassGroupId === null;
  return {
    batch,
    records: records.map((r) => {
      const average = r.overallAverage === null ? null : Number(r.overallAverage);
      return {
        id: r.id,
        student: r.student,
        overallAverage: average,
        termAverages: r.termAverages as Record<string, number | null>,
        decision: r.decision,
        decisionMode: r.decisionMode,
        overrideReason: r.overrideReason,
        recommendedDecision: evaluatePromotionRecommendation(average, terminal, Number(row.passMark)).decision,
        movedToEnrollmentId: r.targetEnrollmentId,
      };
    }),
  };
}
