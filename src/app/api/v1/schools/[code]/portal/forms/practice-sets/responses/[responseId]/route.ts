import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { getPupilResponseWithMarking, ManualMarkingError } from "@/lib/forms/manual-marking-service";
import { PracticeError } from "@/lib/question-bank/practice-service";

export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; responseId: string }> }) => {
    const { responseId } = await ctx.params;
    try {
      const response = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return getPupilResponseWithMarking(tx, {
          tenantId: auth.tenant.tenantId,
          responseId,
          studentId: student.id,
        });
      });
      return ok({ response });
    } catch (err) {
      if (err instanceof ManualMarkingError) {
        return fail(err.message, err.statusCode, err.code);
      }
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES, area: "academics" },
);
