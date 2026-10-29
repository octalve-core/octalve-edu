import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { finishPracticeSession, PracticeError } from "@/lib/question-bank/practice-service";

export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: sessionId } = await ctx.params;
    try {
      const summary = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return finishPracticeSession(tx, {
          tenantId: auth.tenant.tenantId,
          studentId: student.id,
          role: auth.tenant.role,
          sessionId,
        });
      });
      return ok(summary);
    } catch (err) {
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES },
);
