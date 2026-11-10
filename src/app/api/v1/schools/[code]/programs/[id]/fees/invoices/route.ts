import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { ok } from "@/lib/api/envelope";
import { listInvoices } from "@/lib/programs/fees-service";
import { invoicesQuery } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/fees/invoices?status&groupId&campusId&periodKey&q&page - the invoices the caller may see (a campus administrator only those through their own campuses), 50 to a page. */
export const GET = withAuth(
  validate({ query: invoicesQuery }, async (_req, auth: TenantAuthContext, { params }: Ctx, { query }) => {
    const result = await listInvoices(auth, (await params).id, query);
    return result.ok
      ? ok(
          { invoices: result.data.invoices },
          { total: result.data.total, page: result.data.page, pageSize: result.data.pageSize, hasNext: result.data.hasNext },
        )
      : respond(result);
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
