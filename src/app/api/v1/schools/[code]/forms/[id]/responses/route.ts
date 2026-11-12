import { Permission } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { getPracticeSetResponsesForStaff, FormsServiceError } from "@/lib/forms/forms-service";

// A practice set's responses for the staff who may read its results (the service existed; nothing reached it). Same options as the questionnaire analytics: the results permission.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const responses = await auth.tenant.run(async (tx) =>
        getPracticeSetResponsesForStaff(tx, { formId, tenantId: auth.tenant.tenantId, userId: auth.userId }),
      );
      return ok({ responses });
    } catch (err) {
      if (err instanceof FormsServiceError) return fail(err.message, err.statusCode, err.code);
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES, permissions: [Permission.CAN_VIEW_FORM_RESULTS], area: "academics" },
);
