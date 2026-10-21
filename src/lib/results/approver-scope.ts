import type { Tx } from "@/lib/tenant/for-tenant";

// Where one person approves results (ADR 0018). The results list and the transitions that need approval authority (approve, return, publish, revert, lock) both ask
// the functions here, so what a person sees and what they may do cannot drift apart. The scope is only ever read from `ResultApprovalScope`; holding the
// CAN_APPROVE_RESULTS permission is still required (the caller checks it), and the campus rule still applies on top.

/// `general`: every class of the person's campus (the whole school for a membership with no campus). Otherwise the arms of the sections and classes assigned.
export type ApproverScope = { general: boolean; armIds: ReadonlySet<string> };

/// No scope, no approving (fail closed): what a person with no rows gets.
export const NO_SCOPE: ApproverScope = { general: false, armIds: new Set() };

/// The scope of one person in one school. A GENERAL row wins; otherwise the arms of every class group in an assigned (live) section, plus every arm of an assigned class
/// group. An archived section covers nothing: archiving a section ends what it granted.
export async function approverScope(tx: Tx, tenantId: string, userId: string): Promise<ApproverScope> {
  const rows = await tx.resultApprovalScope.findMany({
    where: { tenantId, userId },
    select: { kind: true, sectionId: true, classGroupId: true },
  });
  if (rows.some((row) => row.kind === "GENERAL")) return { general: true, armIds: new Set() };

  const sectionIds = rows.flatMap((row) => (row.kind === "SECTION" && row.sectionId ? [row.sectionId] : []));
  const classGroupIds = rows.flatMap((row) => (row.kind === "CLASS" && row.classGroupId ? [row.classGroupId] : []));
  if (sectionIds.length === 0 && classGroupIds.length === 0) return NO_SCOPE;

  const arms = await tx.classArm.findMany({
    where: {
      tenantId,
      classGroup: {
        OR: [
          ...(sectionIds.length > 0 ? [{ sectionId: { in: sectionIds }, section: { is: { archivedAt: null } } }] : []),
          ...(classGroupIds.length > 0 ? [{ id: { in: classGroupIds } }] : []),
        ],
      },
    },
    select: { id: true },
  });
  return { general: false, armIds: new Set(arms.map((arm) => arm.id)) };
}

/// Which of these results the scope covers: the student has an ACTIVE enrolment, in the session of the result's period, in an arm the scope reaches. A general scope
/// covers all of them (the campus rule is applied by the caller, before this).
export async function inScopeResultIds(
  tx: Tx,
  tenantId: string,
  scope: ApproverScope,
  results: readonly { id: string; studentId: string; sessionId: string }[],
): Promise<Set<string>> {
  if (scope.general) return new Set(results.map((result) => result.id));
  if (scope.armIds.size === 0 || results.length === 0) return new Set();
  const enrolments = await tx.studentEnrollment.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      classArmId: { in: [...scope.armIds] },
      studentId: { in: [...new Set(results.map((result) => result.studentId))] },
      sessionId: { in: [...new Set(results.map((result) => result.sessionId))] },
    },
    select: { studentId: true, sessionId: true },
  });
  const covered = new Set(enrolments.map((row) => `${row.studentId}|${row.sessionId}`));
  return new Set(results.filter((result) => covered.has(`${result.studentId}|${result.sessionId}`)).map((result) => result.id));
}
