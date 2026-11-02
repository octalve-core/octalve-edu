import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { getPracticeSessionToResume, PracticeError } from "@/lib/question-bank/practice-service";

// Opens a session the pupil started and did not finish: the questions not yet answered (no keys), so they can carry on. Only the pupil's own session; a finished one is refused.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: sessionId } = await ctx.params;
    try {
      const result = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return getPracticeSessionToResume(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: student.campusId,
          studentId: student.id,
          role: auth.tenant.role,
          sessionId,
        });
      });
      return ok(result);
    } catch (err) {
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES },
);
