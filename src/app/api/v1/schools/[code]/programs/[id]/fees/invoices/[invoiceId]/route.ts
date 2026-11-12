import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { getInvoice, setProgramPayInFull } from "@/lib/programs/fees-service";
import { invoicePatchSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ code: string; id: string; invoiceId: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/fees/invoices/[invoiceId] - the invoice with its lines, payments, discounts and the part-payment rule in words. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, { params }: Ctx) => {
    const { id, invoiceId } = await params;
    return respond(await getInvoice(auth, id, invoiceId));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);

/** PATCH /api/v1/schools/[code]/programs/[id]/fees/invoices/[invoiceId] { payInFull } - "pay in full only" on one invoice. A school's administrator, a program admin, or the administrator of the invoice's campus. */
export const PATCH = withAuth(
  validate({ body: invoicePatchSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, invoiceId } = await params;
    return respond(await setProgramPayInFull(auth, id, invoiceId, body.payInFull));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
