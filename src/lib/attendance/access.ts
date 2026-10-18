import { SessionStatus } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { attendanceFailure } from "./http";

// Who may read a class arm's roll call or a student's attendance history, and who may take a roll (task 0010 F3, ISS-0013, plan "Build design -
// platform follow-ups"). Two rules for staff, both answering a plain 404 (the same body an unknown id gets - nothing is confirmed):
//   CAMPUS - the arm's class group / the student must be school-wide (no campus) or in the member's own campus; a member with no campus is school-wide.
//   ARM    - TEACHING_STAFF only: the arm must be one they are ASSIGNED to - a subject assignment or a timetable slot of their staff record - and a
//            student's history needs an ACTIVE enrolment, in the active session, in such an arm. NON_TEACHING_STAFF have no arms by nature and get the
//            campus rule only.
// ADMIN is school-wide and CAMPUS_ADMIN is scoped by `armReadScope` / `studentReadScope` / `armScope` in lib/auth/campus-scope.ts, so every function
// here returns at once for them (and for any role this module does not govern: the route's `roles` list already decides who gets this far).
// A teacher with NO assignment therefore reads and writes no arm until an administrator gives them one.

type Auth = TenantAuthContext;
type Tx = Parameters<Auth["tenant"]["run"]>[0] extends (tx: infer T) => unknown ? T : never;

const GOVERNED = new Set(["TEACHING_STAFF", "NON_TEACHING_STAFF"]);
const campusAllows = (own: string | null, rowCampus: string | null) => own === null || rowCampus === null || own === rowCampus;
const notFound = () => attendanceFailure("NOT_FOUND");

/// The arms this person teaches: a subject assignment or a timetable slot of their (live) staff record.
async function assignedArmIds(tx: Tx, tenantId: string, userId: string): Promise<Set<string>> {
  const staff = await tx.staffRecord.findFirst({
    where: { tenantId, userId, archivedAt: null },
    select: { assignments: { select: { classArmId: true } }, timetableSlots: { select: { classArmId: true } } },
  });
  return new Set([...(staff?.assignments ?? []), ...(staff?.timetableSlots ?? [])].map((row) => row.classArmId));
}

/// null = allowed; otherwise the 404 to send. For the roll-call read and the roll-call write alike.
export async function armAccess(auth: Auth, armId: string): Promise<Response | null> {
  const { role, tenantId, campusId: own } = auth.tenant;
  if (!GOVERNED.has(role)) return null;
  const allowed = await auth.tenant.run(async (tx) => {
    const arm = await tx.classArm.findFirst({ where: { tenantId, id: armId }, select: { classGroup: { select: { campusId: true } } } });
    if (!arm || !campusAllows(own, arm.classGroup.campusId)) return false;
    return role === "TEACHING_STAFF" ? (await assignedArmIds(tx, tenantId, auth.userId)).has(armId) : true;
  });
  return allowed ? null : notFound();
}

/// null = allowed; otherwise the 404 to send.
export async function studentAccess(auth: Auth, studentId: string): Promise<Response | null> {
  const { role, tenantId, campusId: own } = auth.tenant;
  if (!GOVERNED.has(role)) return null;
  const allowed = await auth.tenant.run(async (tx) => {
    const student = await tx.studentRecord.findFirst({ where: { tenantId, id: studentId }, select: { campusId: true } });
    if (!student || !campusAllows(own, student.campusId)) return false;
    if (role !== "TEACHING_STAFF") return true;
    const arms = await assignedArmIds(tx, tenantId, auth.userId);
    if (arms.size === 0) return false;
    const active = await tx.academicSession.findFirst({
      where: { tenantId, status: SessionStatus.ACTIVE, archivedAt: null },
      select: { id: true },
    });
    if (!active) return false;
    const enrolment = await tx.studentEnrollment.findFirst({
      where: { tenantId, studentId, sessionId: active.id, status: "ACTIVE", classArmId: { in: [...arms] } },
      select: { id: true },
    });
    return enrolment !== null;
  });
  return allowed ? null : notFound();
}

export type RollCallArm = { id: string; name: string; classGroup: { id: string; name: string; campusId: string | null } };

/// The live arms this person may take or read a roll for - what the attendance screen offers. The same rules as `armAccess`, plus the campus rule for
/// a campus administrator (own campus and school-wide) so the list matches `armReadScope`.
export async function listRollCallArms(auth: Auth): Promise<RollCallArm[]> {
  const { role, tenantId, campusId: own } = auth.tenant;
  return auth.tenant.run(async (tx) => {
    const restrictCampus = role !== "ADMIN" && own !== null;
    const assigned = role === "TEACHING_STAFF" ? await assignedArmIds(tx, tenantId, auth.userId) : null;
    if (assigned && assigned.size === 0) return [];
    return tx.classArm.findMany({
      where: {
        tenantId,
        archivedAt: null,
        ...(assigned ? { id: { in: [...assigned] } } : {}),
        classGroup: { archivedAt: null, ...(restrictCampus ? { OR: [{ campusId: null }, { campusId: own }] } : {}) },
      },
      select: { id: true, name: true, classGroup: { select: { id: true, name: true, campusId: true, sortOrder: true } } },
      orderBy: [{ classGroup: { sortOrder: "asc" } }, { classGroup: { name: "asc" } }, { name: "asc" }],
    });
  });
}
