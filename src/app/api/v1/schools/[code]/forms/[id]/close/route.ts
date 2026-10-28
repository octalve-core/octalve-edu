import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { closePracticeSet, FormsServiceError } from "@/lib/forms/forms-service";

export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const result = await auth.tenant.run(async (tx) => {
        return closePracticeSet(tx, {
          formId,
          tenantId: auth.tenant.tenantId,
          userId: auth.userId,
        });
      });
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
