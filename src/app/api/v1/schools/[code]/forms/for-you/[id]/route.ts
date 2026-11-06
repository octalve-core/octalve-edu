import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FOR_YOU_ROLES } from "@/lib/question-bank/items-http";
import { getQuestionnaireForMember } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

// The questions of a questionnaire addressed to the signed-in member of staff or guardian. A questionnaire that is not theirs (another campus, another role, closed) is refused in a
// sentence; one of another school does not exist for them.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const details = await auth.tenant.run(async (tx) =>
        getQuestionnaireForMember(tx, {
          formId,
          memberId: auth.userId,
          memberRole: auth.tenant.role,
          campusId: auth.tenant.campusId,
          tenantId: auth.tenant.tenantId,
        }),
      );
      return ok(details);
    } catch (err) {
      if (err instanceof FormsServiceError) return fail(err.message, err.statusCode, err.code);
      throw err;
    }
  },
  { tenant: true, roles: FOR_YOU_ROLES, area: "academics" },
);
