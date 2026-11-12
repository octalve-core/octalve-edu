import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { getStaffReportHistory } from "@/lib/question-bank/reports-service";

// The reports the signed-in member of staff filed, with where each stands and the reviewer's outcome. Only their own: the filter is the caller's id, there is no parameter to widen it.
// (The reviewers' list, `GET /reports`, is a different thing: it shows every report, with the reporter masked.)
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    const reports = await auth.tenant.run(async (tx) => getStaffReportHistory(tx, { tenantId: auth.tenant.tenantId, userId: auth.userId }));
    return ok({ reports });
  },
  { tenant: true, roles: BANK_STAFF_ROLES, area: "academics" },
);
