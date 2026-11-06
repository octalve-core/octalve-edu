import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { closePaperWork, PaperWorkError } from "@/lib/forms/paper-work-service";

// Closes a paper-work assignment (the service existed; nothing reached it). Same rules as closing a practice set: whoever manages the form, in their school and campus.
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const result = await auth.tenant.run(async (tx) => closePaperWork(tx, auth.tenant.tenantId, auth.userId, formId));
      return ok(result);
    } catch (err) {
      if (err instanceof PaperWorkError) return fail(err.message, err.statusCode);
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
