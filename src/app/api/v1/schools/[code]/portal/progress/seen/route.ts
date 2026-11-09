import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { getStudentForViewer } from "@/lib/portal/portal-helpers";
import { markSeen } from "@/lib/programs/progress-family";
import { seenSchema } from "@/lib/programs/progress-validation";

/**
 * POST /api/v1/schools/[code]/portal/progress/seen { studentId?, programId, weekStart }
 * The pupil or a guardian marks a week as seen (in place of a signature). A record of that, required for nothing; the same gate and switches as reading.
 */
export const POST = withAuth(
  validate({ body: seenSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    const { tenantId, role } = auth.tenant;
    const userId = auth.userId;
    const actor = role === Role.PARENT ? "GUARDIAN" : "PUPIL";
    const result = await auth.tenant.run(async (tx) => {
      const student = await getStudentForViewer(tx, { tenantId, userId, role, requestedStudentId: body.studentId });
      if (!student) return null;
      return markSeen(tx, tenantId, student.id, actor, { programId: body.programId, weekStart: body.weekStart });
    });
    if (!result) return noStore(fail("That pupil was not found.", 404, "NOT_FOUND"));
    return noStore(result.ok ? ok(result.data) : fail(result.message, result.status, result.code));
  }),
  { tenant: true, roles: [Role.STUDENT, Role.PARENT] },
);
