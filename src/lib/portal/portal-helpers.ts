import { Role, StandingState } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { PracticeError, resolveStudentForUser } from "@/lib/question-bank/practice-service";
import { studentStandingNow } from "@/lib/standing/rules";

export const PORTAL_STUDENT_ROLES = [Role.STUDENT, Role.ADMIN];
export const PORTAL_ALL_ROLES = [Role.STUDENT, Role.PARENT, Role.ADMIN];

const todayDay = () => new Date().toISOString().slice(0, 10);

/// The caller's OWN student record: the one their sign-in is linked to. A pupil has one; a guardian, a teacher and an administrator do not (they get null). An EXPELLED pupil has none
/// here either (task 0028): the portal answers as it does for anyone without a record, and never says why. A suspended pupil keeps reading; see `getStudentForWork`.
export async function getStudentFromAuth(tx: Tx, tenantId: string, userId: string) {
  return resolveStudentForUser(tx, tenantId, userId);
}

/// The same, for the routes where a pupil DOES something: hands in work, takes a quiz, practises (task 0028, section 4.3). A suspended pupil can read but not do these. The check only
/// ever narrows what the pupil may do. A suspension applies through its last day; after it the pupil is active again with nobody having to lift it.
export async function getStudentForWork(tx: Tx, tenantId: string, userId: string) {
  const student = await resolveStudentForUser(tx, tenantId, userId);
  if (student && studentStandingNow(student, todayDay()) === StandingState.SUSPENDED)
    throw new PracticeError("You can't do this while you are suspended. You can still read your work and your results.", 403, "SUSPENDED");
  return student;
}

/// The student a portal caller asks about by id, for the routes a guardian may use (a pupil's history). Whose it may be is decided here and nowhere else:
///   - a pupil: their own record only (a student id that is not theirs is "not found", exactly as one that does not exist);
///   - a guardian: the pupils their APPROVED links name (a pending or revoked link, or a link of an archived guardian, names nobody);
///   - the school's administrator: any pupil of the school.
/// Anyone else gets null. With no id asked for, the caller's own record. Archived pupils are never returned.
export async function getStudentForViewer(tx: Tx, params: { tenantId: string; userId: string; role: Role; requestedStudentId?: string }) {
  const { tenantId, userId, role, requestedStudentId } = params;
  if (!requestedStudentId) return resolveStudentForUser(tx, tenantId, userId);
  const include = { campus: { select: { id: true, name: true } } };
  if (role === Role.ADMIN) {
    return tx.studentRecord.findFirst({ where: { id: requestedStudentId, tenantId, archivedAt: null }, include });
  }
  // An expelled pupil's practice and forms history is not shown to the pupil or to a guardian; what is owed is settled through the invoices, which this does not touch.
  if (role === Role.PARENT) {
    return tx.studentRecord.findFirst({
      where: {
        id: requestedStudentId,
        tenantId,
        archivedAt: null,
        standing: { not: StandingState.EXPELLED },
        guardians: { some: { status: "APPROVED", guardian: { userId, archivedAt: null } } },
      },
      include,
    });
  }
  if (role === Role.STUDENT) {
    return tx.studentRecord.findFirst({
      where: { id: requestedStudentId, tenantId, userId, archivedAt: null, standing: { not: StandingState.EXPELLED } },
      include,
    });
  }
  return null;
}

/// The pupils a guardian may look at: those their APPROVED links name (a pending or revoked link, a link of an archived guardian and an archived pupil name nobody). The same rule
/// as `getStudentForViewer` for a guardian, so what is listed here is exactly what the history route will open.
export async function listChildrenForGuardian(tx: Tx, tenantId: string, userId: string) {
  const rows = await tx.studentRecord.findMany({
    where: {
      tenantId,
      archivedAt: null,
      standing: { not: StandingState.EXPELLED },
      guardians: { some: { status: "APPROVED", guardian: { userId, archivedAt: null } } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, middleName: true, lastName: true, admissionNo: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(" "),
    admissionNo: r.admissionNo,
  }));
}
