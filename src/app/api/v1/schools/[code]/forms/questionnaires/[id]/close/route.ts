import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { closeQuestionnaire } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

// Closes a questionnaire (the service existed; nothing reached it). Same rules as closing a practice set: whoever manages the form, in their school and campus.
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const result = await auth.tenant.run(async (tx) =>
        closeQuestionnaire(tx, { formId, tenantId: auth.tenant.tenantId, userId: auth.userId }),
      );
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) return fail(err.message, err.statusCode, err.code);
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
