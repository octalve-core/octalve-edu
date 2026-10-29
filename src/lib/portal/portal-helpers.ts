import { Role } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { resolveStudentForUser } from "@/lib/question-bank/practice-service";

export const PORTAL_STUDENT_ROLES = [Role.STUDENT, Role.ADMIN];
export const PORTAL_ALL_ROLES = [Role.STUDENT, Role.PARENT, Role.ADMIN];

/// The caller's OWN student record: the one their sign-in is linked to. A pupil has one; a guardian, a teacher and an administrator do not (they get null).
export async function getStudentFromAuth(tx: Tx, tenantId: string, userId: string) {
  return resolveStudentForUser(tx, tenantId, userId);
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
  if (role === Role.PARENT) {
    return tx.studentRecord.findFirst({
      where: {
        id: requestedStudentId,
        tenantId,
        archivedAt: null,
        guardians: { some: { status: "APPROVED", guardian: { userId, archivedAt: null } } },
      },
      include,
    });
  }
  if (role === Role.STUDENT) {
    return tx.studentRecord.findFirst({ where: { id: requestedStudentId, tenantId, userId, archivedAt: null }, include });
  }
  return null;
}
