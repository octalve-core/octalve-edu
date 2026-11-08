import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { setPayInFull } from "@/lib/finance/part-payment-service";
import { payInFullSchema } from "@/lib/finance/part-payment-validation";

/**
 * PATCH /api/v1/schools/[code]/finance/invoices/[id]/pay-in-full { payInFull: boolean }
 * The school's administrator marks one open invoice "pay in full" (no part payments on it), or clears the mark. It only tightens what the school's rule says, and never allows
 * what it forbids. Audited. An invoice of another school, or one that does not exist, answers 404.
 */
export const PATCH = withAuth(
  validate(
    { body: payInFullSchema },
    async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }, { body }) => {
      const { id } = await ctx.params;
      const result = await setPayInFull(auth.tenant, auth.userId, id, body.payInFull);
      return result.ok ? ok(result.data) : fail(result.message, result.status, result.code);
    },
  ),
  { tenant: true, roles: [Role.ADMIN] },
);
