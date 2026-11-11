import { EnrollmentStatus, ResultStatus, SessionStatus } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { assignedArmIds } from "@/lib/attendance/access";
import { approverScope, NO_SCOPE } from "./approver-scope";
import { OUTSIDE_CAMPUS, isCampusAdmin, mayChangeClass, ownsNothing } from "./campus-admin";
import { schemeForClassGroup } from "./scheme";
import type { ServiceResult } from "./service";

// What the Results screens read (task 0031): the choices an entry sheet offers, the sheet itself and the class list of the report-cards tab. Reads only: saving goes through the existing
// `recordStudentResults`, and the status changes through `transitionResultStatuses`, so there is one writer and one set of rules for marks.
//
// A campus rule and an assignment rule decide what a person sees, the same two the rest of the results code applies (and `recordStudentResults` re-checks on every save):
//   CAMPUS     - a member anchored to a campus works with that campus's classes and the school's; another campus's arm is "not found", the same answer as an unknown id.
//   ASSIGNMENT - a teacher enters a subject only in an arm they are ASSIGNED to teach it in (a subject assignment, not a timetable slot).

export type SheetCaller = { role: string; campusId: string | null; userId: string; permissions?: readonly string[] };

const campusAllows = (caller: SheetCaller, classCampusId: string | null) =>
  !ownsNothing(caller.role, caller.campusId) &&
  (caller.role === "ADMIN" || caller.campusId === null || classCampusId === null || classCampusId === caller.campusId);

const notFound = (message: string): { ok: false; failure: "NOT_FOUND"; message: string } => ({ ok: false, failure: "NOT_FOUND", message });

export interface PeriodOption {
  id: string;
  label: string;
  ordinal: number;
  isCurrent: boolean;
  sessionId: string;
  sessionLabel: string;
}
export interface ArmOption {
  id: string;
  name: string;
  classGroupName: string;
}
export interface PairOption {
  classArmId: string;
  armName: string;
  classGroupId: string;
  classGroupName: string;
  subjectId: string;
  subjectName: string;
}

/// The (arm, subject) pairs a teacher is assigned: exactly the assignments of their live staff record.
async function assignedPairs(tx: Tx, tenantId: string, userId: string): Promise<Set<string>> {
  const rows = await tx.staffSubjectAssignment.findMany({
    where: { tenantId, staffRecord: { userId, archivedAt: null } },
    select: { classArmId: true, subjectId: true },
  });
  return new Set(rows.map((r) => `${r.classArmId}:${r.subjectId}`));
}

/**
 * What the Marks tab offers: the periods of the ACTIVE session(s) the person works in, and the (arm, subject) pairs they may enter. An administrator gets every live arm with each subject its
 * class offers; a teacher only their assignments; other staff none (they still get the periods: a reviewer needs them). A campus-anchored member gets their campus's sessions and the school's.
 */
export async function entryOptions(tx: Tx, tenantId: string, caller: SheetCaller) {
  if (ownsNothing(caller.role, caller.campusId)) return { periods: [], pairs: [], arms: [] };
  const sessions = await tx.academicSession.findMany({
    where: {
      tenantId,
      status: SessionStatus.ACTIVE,
      archivedAt: null,
      ...(caller.role !== "ADMIN" && caller.campusId !== null ? { OR: [{ campusId: null }, { campusId: caller.campusId }] } : {}),
    },
    select: {
      id: true,
      label: true,
      periods: {
        where: { archivedAt: null },
        select: { id: true, label: true, ordinal: true, isCurrent: true },
        orderBy: { ordinal: "asc" },
      },
    },
    orderBy: { startDate: "desc" },
  });
  const periods: PeriodOption[] = sessions.flatMap((s) =>
    s.periods.map((p) => ({
      id: p.id,
      label: p.label,
      ordinal: p.ordinal,
      isCurrent: p.isCurrent,
      sessionId: s.id,
      sessionLabel: s.label,
    })),
  );

  // Every live arm the person's campus reaches, once: the pairs and the readable arms both come from it.
  const allArms = await tx.classArm.findMany({
    where: { tenantId, archivedAt: null, classGroup: { archivedAt: null } },
    select: {
      id: true,
      name: true,
      classGroup: {
        select: {
          id: true,
          name: true,
          campusId: true,
          offerings: { select: { subject: { select: { id: true, name: true, archivedAt: true } } } },
        },
      },
    },
  });
  const arms = allArms.filter((arm) => campusAllows(caller, arm.classGroup.campusId));

  // Entering: an administrator every arm with each subject its class offers, a campus administrator the same for the classes of their own campus only (not the school-wide ones: task 0046),
  // a teacher only their assignments, other staff nothing.
  let pairs: PairOption[] = [];
  if (caller.role === "ADMIN" || isCampusAdmin(caller.role) || caller.role === "TEACHING_STAFF") {
    const mine = caller.role === "TEACHING_STAFF" ? await assignedPairs(tx, tenantId, caller.userId) : null;
    const subjects = mine ? await tx.subject.findMany({ where: { tenantId, archivedAt: null }, select: { id: true, name: true } }) : [];
    const subjectName = new Map(subjects.map((x) => [x.id, x.name]));
    for (const arm of isCampusAdmin(caller.role) ? arms.filter((a) => mayChangeClass(caller.campusId, a.classGroup.campusId)) : arms) {
      const base = { classArmId: arm.id, armName: arm.name, classGroupId: arm.classGroup.id, classGroupName: arm.classGroup.name };
      if (mine) {
        for (const key of mine) {
          const [armId, subjectId] = key.split(":");
          if (armId === arm.id && subjectName.has(subjectId)) pairs.push({ ...base, subjectId, subjectName: subjectName.get(subjectId)! });
        }
      } else {
        for (const o of arm.classGroup.offerings)
          if (!o.subject.archivedAt) pairs.push({ ...base, subjectId: o.subject.id, subjectName: o.subject.name });
      }
    }
    pairs = pairs.sort(
      (a, b) =>
        a.classGroupName.localeCompare(b.classGroupName) ||
        a.armName.localeCompare(b.armName) ||
        a.subjectName.localeCompare(b.subjectName),
    );
  }

  // Reading (the review filter and the report cards): an administrator and other staff every arm of their campus; a teacher the arms they teach or are assigned a timetable slot in, and
  // the arms of their approver scope (the same set `classRoster` admits).
  let readable = arms;
  if (caller.role === "TEACHING_STAFF") {
    const scope = (caller.permissions ?? []).includes("CAN_APPROVE_RESULTS") ? await approverScope(tx, tenantId, caller.userId) : NO_SCOPE;
    const assigned = await assignedArmIds(tx, tenantId, caller.userId);
    readable = arms.filter((arm) => scope.general || scope.armIds.has(arm.id) || assigned.has(arm.id));
  }
  const armOptions: ArmOption[] = readable
    .map((arm) => ({ id: arm.id, name: arm.name, classGroupName: arm.classGroup.name }))
    .sort((a, b) => a.classGroupName.localeCompare(b.classGroupName) || a.name.localeCompare(b.name));
  return { periods, pairs, arms: armOptions };
}

export interface SheetRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  /// A suspended pupil is on the roll and is shown as such; the sheet does not stop their marks.
  standing: string;
  result: {
    id: string;
    status: ResultStatus;
    score: number;
    maxScore: number;
    components: { name: string; score: number; maxScore: number }[] | null;
    gradeLetter: string | null;
    gradeRemark: string | null;
  } | null;
}

/**
 * The sheet for one subject in one arm and period: the pupils on the arm's roll for the period's session, the scheme's parts (the class's own scheme, else the school's single one, else a
 * single total out of 100) and what is saved so far. A teacher outside the assignment gets NOT_ASSIGNED; another campus's arm, an archived arm and an unknown id are all NOT_FOUND.
 */
export async function getSheet(
  tx: Tx,
  tenantId: string,
  caller: SheetCaller,
  q: { periodId: string; classArmId: string; subjectId: string },
): Promise<
  ServiceResult<{
    period: { id: string; label: string; sessionId: string; sessionLabel: string };
    arm: { id: string; name: string; classGroupName: string };
    subject: { id: string; name: string };
    /// `components` as the scheme defines them; `parts` what a result is entered under (the components, then the exam: task 0032, D0).
    scheme: {
      id: string | null;
      name: string | null;
      totalMax: number;
      examMax: number;
      components: { name: string; maxScore: number }[];
      parts: { name: string; maxScore: number }[];
    };
    rows: SheetRow[];
  }>
> {
  const [period, arm, subject] = await Promise.all([
    tx.academicPeriod.findFirst({
      where: { tenantId, id: q.periodId, archivedAt: null },
      include: { session: { select: { id: true, label: true, campusId: true } } },
    }),
    tx.classArm.findFirst({
      where: { tenantId, id: q.classArmId, archivedAt: null },
      include: { classGroup: { select: { id: true, name: true, campusId: true, archivedAt: true } } },
    }),
    tx.subject.findFirst({ where: { tenantId, id: q.subjectId, archivedAt: null }, select: { id: true, name: true } }),
  ]);
  if (!period || !arm || arm.classGroup.archivedAt || !subject || !campusAllows(caller, arm.classGroup.campusId))
    return notFound("No such class, subject or term.");
  // A campus administrator enters marks for a class of their own campus, in a term of their campus's calendar or the school's (task 0046); a school-wide class is the school administrator's.
  if (isCampusAdmin(caller.role)) {
    if (period.session.campusId !== null && period.session.campusId !== caller.campusId) return notFound("No such class, subject or term.");
    if (!mayChangeClass(caller.campusId, arm.classGroup.campusId)) return { ok: false, failure: "OUTSIDE_CAMPUS", message: OUTSIDE_CAMPUS };
  }
  if (caller.role === "TEACHING_STAFF" && !(await assignedPairs(tx, tenantId, caller.userId)).has(`${arm.id}:${subject.id}`)) {
    return { ok: false, failure: "NOT_ASSIGNED", message: "You are not assigned to teach this subject to this class." };
  }

  const enrolments = await tx.studentEnrollment.findMany({
    where: { tenantId, sessionId: period.sessionId, classArmId: arm.id, status: EnrollmentStatus.ACTIVE, student: { archivedAt: null } },
    select: { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, standing: true } } },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { studentId: "asc" }],
  });
  const studentIds = enrolments.map((e) => e.student.id);
  const saved = studentIds.length
    ? await tx.result.findMany({ where: { tenantId, periodId: period.id, subjectId: subject.id, studentId: { in: studentIds } } })
    : [];
  const byStudent = new Map(saved.map((r) => [r.studentId, r]));

  const scheme = await schemeForClassGroup(tx, tenantId, arm.classGroup.id);

  return {
    ok: true,
    data: {
      period: { id: period.id, label: period.label, sessionId: period.session.id, sessionLabel: period.session.label },
      arm: { id: arm.id, name: arm.name, classGroupName: arm.classGroup.name },
      subject,
      scheme: scheme ?? { id: null, name: null, totalMax: 100, examMax: 0, components: [], parts: [] },
      rows: enrolments.map(({ student }) => {
        const r = byStudent.get(student.id);
        return {
          studentId: student.id,
          admissionNo: student.admissionNo,
          firstName: student.firstName,
          lastName: student.lastName,
          standing: student.standing,
          result: r
            ? {
                id: r.id,
                status: r.status,
                score: Number(r.score),
                maxScore: Number(r.maxScore),
                components: Array.isArray(r.componentScores)
                  ? (r.componentScores as { name: string; score: number; maxScore: number }[])
                  : null,
                gradeLetter: r.gradeLetter,
                gradeRemark: r.gradeRemark,
              }
            : null,
        };
      }),
    },
  };
}

export interface RosterRow {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  published: number;
  total: number;
}

/**
 * The pupils of an arm for a period, with how many of their results are published, for the report-cards tab. An administrator reads every arm; a teacher the arms they are assigned (a subject
 * assignment or a timetable slot, as for a roll call) and the arms of their approver scope; other staff the campus rule only. Another campus's arm is NOT_FOUND.
 */
export async function classRoster(
  tx: Tx,
  tenantId: string,
  caller: SheetCaller,
  q: { periodId: string; classArmId: string },
): Promise<
  ServiceResult<{
    period: { id: string; label: string; sessionLabel: string };
    arm: { id: string; name: string; classGroupName: string };
    rows: RosterRow[];
  }>
> {
  const [period, arm] = await Promise.all([
    tx.academicPeriod.findFirst({
      where: { tenantId, id: q.periodId, archivedAt: null },
      include: { session: { select: { label: true, campusId: true } } },
    }),
    tx.classArm.findFirst({
      where: { tenantId, id: q.classArmId, archivedAt: null },
      include: { classGroup: { select: { name: true, campusId: true } } },
    }),
  ]);
  if (!period || !arm || !campusAllows(caller, arm.classGroup.campusId)) return notFound("No such class or term.");
  if (isCampusAdmin(caller.role) && period.session.campusId !== null && period.session.campusId !== caller.campusId)
    return notFound("No such class or term.");
  if (caller.role === "TEACHING_STAFF") {
    const scope = (caller.permissions ?? []).includes("CAN_APPROVE_RESULTS") ? await approverScope(tx, tenantId, caller.userId) : NO_SCOPE;
    const mine = scope.general || scope.armIds.has(arm.id) || (await assignedArmIds(tx, tenantId, caller.userId)).has(arm.id);
    if (!mine) return notFound("No such class or term.");
  }

  const enrolments = await tx.studentEnrollment.findMany({
    where: {
      tenantId,
      sessionId: period.sessionId,
      classArmId: arm.id,
      status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PROMOTED, EnrollmentStatus.REPEATED, EnrollmentStatus.ALUMNI] },
      student: { archivedAt: null },
    },
    select: { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } } },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }, { studentId: "asc" }],
  });
  const ids = enrolments.map((e) => e.student.id);
  const results = ids.length
    ? await tx.result.findMany({
        where: { tenantId, periodId: period.id, studentId: { in: ids } },
        select: { studentId: true, status: true },
      })
    : [];
  const count = new Map<string, { published: number; total: number }>();
  for (const r of results) {
    const c = count.get(r.studentId) ?? { published: 0, total: 0 };
    c.total++;
    if (r.status === ResultStatus.PUBLISHED || r.status === ResultStatus.LOCKED) c.published++;
    count.set(r.studentId, c);
  }
  return {
    ok: true,
    data: {
      period: { id: period.id, label: period.label, sessionLabel: period.session.label },
      arm: { id: arm.id, name: arm.name, classGroupName: arm.classGroup.name },
      rows: enrolments.map(({ student }) => ({
        studentId: student.id,
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        published: count.get(student.id)?.published ?? 0,
        total: count.get(student.id)?.total ?? 0,
      })),
    },
  };
}
