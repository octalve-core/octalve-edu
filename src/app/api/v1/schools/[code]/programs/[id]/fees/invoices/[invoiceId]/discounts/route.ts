import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { applyProgramDiscount } from "@/lib/programs/fees-service";
import { discountSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ code: string; id: string; invoiceId: string }> };

/** POST /api/v1/schools/[code]/programs/[id]/fees/invoices/[invoiceId]/discounts { amount, reason } - a discount, kept with who and why; never below what was paid (409 `DISCOUNT_TOO_LARGE`). A school's administrator, a program admin, or the administrator of the invoice's campus. */
export const POST = withAuth(
  validate({ body: discountSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, invoiceId } = await params;
    return respond(await applyProgramDiscount(auth, id, invoiceId, body), 201);
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
