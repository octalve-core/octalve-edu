import type { Tx } from "@/lib/tenant/for-tenant";

// What a campus administrator may do with marks (task 0046, decision D7 of task 0031; ADR 0016). They SEE their campus's pupils and classes and the school-wide ones, like every member anchored to
// a campus; they CHANGE (enter marks, import them, write a remark) only for pupils on the roll of a class of THEIR OWN campus. A class or pupil of the whole school (no campus) is the school
// administrator's to change; another campus's is "not found", the one answer an unknown id gets. Approving and publishing are not decided here: they need the permission and the scope of ADR 0018.

export const OUTSIDE_CAMPUS =
  "That belongs to the whole school or to another campus. Only a school administrator can enter marks or remarks for it.";

export const isCampusAdmin = (role: string): boolean => role === "CAMPUS_ADMIN";

/// A campus administrator with no campus cannot exist (the people routes refuse to make one) but is still treated as owning nothing: failing closed beats reading everything, which is what
/// "anchored to no campus" means for any other member.
export const ownsNothing = (role: string, campusId: string | null): boolean => isCampusAdmin(role) && campusId === null;

/// Whether a class of campus `classCampusId` is one this campus administrator may change: their own campus's class and no other.
export const mayChangeClass = (campusId: string | null, classCampusId: string | null): boolean =>
  campusId !== null && classCampusId === campusId;

/// The pupils among `studentIds` who are NOT on the roll (an ACTIVE enrolment in the session) of a class of this campus: the ones a campus administrator may not enter marks for.
export async function pupilsOutsideCampus(
  tx: Tx,
  tenantId: string,
  campusId: string | null,
  sessionId: string,
  studentIds: readonly string[],
): Promise<string[]> {
  if (campusId === null) return [...studentIds];
  const rolled = await tx.studentEnrollment.findMany({
    where: { tenantId, sessionId, status: "ACTIVE", studentId: { in: [...studentIds] }, classArm: { classGroup: { campusId } } },
    select: { studentId: true },
  });
  const inside = new Set(rolled.map((row) => row.studentId));
  return studentIds.filter((id) => !inside.has(id));
}
