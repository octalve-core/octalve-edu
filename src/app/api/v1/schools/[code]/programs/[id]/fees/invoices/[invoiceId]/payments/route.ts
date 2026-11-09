import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { fail } from "@/lib/api/envelope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { recordProgramPayment } from "@/lib/programs/fees-payments";
import { paymentSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ code: string; id: string; invoiceId: string }> };

/**
 * POST /api/v1/schools/[code]/programs/[id]/fees/invoices/[invoiceId]/payments { amount, channel?, reference?, notes? }
 * Records a payment taken outside (cash, a transfer). A school's administrator, a program admin, or the administrator of the invoice's campus. The invoice is locked, the part-payment rule applies
 * (409 `PAY_IN_FULL`, `BELOW_MINIMUM`), the amount cannot exceed the balance (409 `EXCEEDS_BALANCE`); rate limited.
 */
export const POST = withAuth(
  validate({ body: paymentSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    if (!(await reserveAttempt(`program-payment:${auth.userId}`, 120)))
      return fail("Too many payments. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const { id, invoiceId } = await params;
    return respond(await recordProgramPayment(auth, id, invoiceId, body), 201);
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
