import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { addFeeToOpenInvoices } from "@/lib/programs/fees-service";
import { addToOpenSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ code: string; id: string; itemId: string }> };

/** POST /api/v1/schools/[code]/programs/[id]/fees/items/[itemId]/add-to-open { periodKey } - add a fee made later to the invoices of that period that have no payment and no discount (never to a paid or part-paid one). Audited. */
export const POST = withAuth(
  validate({ body: addToOpenSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, itemId } = await params;
    return respond(await addFeeToOpenInvoices(auth, id, itemId, body.periodKey));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
