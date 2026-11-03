import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FOR_YOU_ROLES } from "@/lib/question-bank/items-http";
import { listAvailableQuestionnairesForMember } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

// The questionnaires addressed to the signed-in member of staff or guardian (their role is named by the audience), open now, of their campus or the whole school's, with whether they
// answered. Pupils have their own portal routes.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    try {
      const questionnaires = await auth.tenant.run(async (tx) =>
        listAvailableQuestionnairesForMember(tx, {
          tenantId: auth.tenant.tenantId,
          userId: auth.userId,
          role: auth.tenant.role,
          campusId: auth.tenant.campusId,
        }),
      );
      return ok({ questionnaires });
    } catch (err) {
      if (err instanceof FormsServiceError) return fail(err.message, err.statusCode, err.code);
      throw err;
    }
  },
  { tenant: true, roles: FOR_YOU_ROLES, area: "academics" },
);
