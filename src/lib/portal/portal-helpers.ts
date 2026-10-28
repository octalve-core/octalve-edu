import { Role } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { resolveStudentForUser } from "@/lib/question-bank/practice-service";

export const PORTAL_STUDENT_ROLES = [Role.STUDENT, Role.ADMIN];
export const PORTAL_ALL_ROLES = [Role.STUDENT, Role.PARENT, Role.ADMIN];

export async function getStudentFromAuth(tx: Tx, tenantId: string, userId: string, requestedStudentId?: string) {
  if (requestedStudentId) {
    const student = await tx.studentRecord.findFirst({
      where: { id: requestedStudentId, tenantId, archivedAt: null },
      include: { campus: { select: { id: true, name: true } } },
    });
    return student;
  }
  return resolveStudentForUser(tx, tenantId, userId);
}
