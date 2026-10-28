import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { syncRosterForPaperWork, PaperWorkError } from "@/lib/forms/paper-work-service";

export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const result = await auth.tenant.run(async (tx) => {
        return syncRosterForPaperWork(tx, auth.tenant.tenantId, formId);
      });
      return ok(result);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
