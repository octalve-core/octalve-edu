import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { feesReport } from "@/lib/programs/fees-service";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/fees/report - collected, outstanding and the collection rate overall, per campus and per group, and the people who owe, among the invoices the caller may see. */
export const GET = withAuth(async (_req, auth: TenantAuthContext, { params }: Ctx) => respond(await feesReport(auth, (await params).id)), {
  tenant: true,
  roles: PROGRAM_ROLES,
});
