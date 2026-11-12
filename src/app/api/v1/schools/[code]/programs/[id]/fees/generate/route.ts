import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { generateInvoices, previewInvoices } from "@/lib/programs/fees-service";
import { generateSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/**
 * POST /api/v1/schools/[code]/programs/[id]/fees/generate { periodKey, confirm? }
 * Without `confirm: true` it only says who would get an invoice, who is skipped and why, and the total. With it, one step under the program's lock makes them (at most 2,000 at a time;
 * running it again makes nothing new). A school's administrator or a program admin; an archived or completed program refuses.
 */
export const POST = withAuth(
  validate({ body: generateSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id } = await params;
    if (body.confirm) return respond(await generateInvoices(auth, id, body.periodKey));
    return respond(await previewInvoices(auth, id, body.periodKey));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
