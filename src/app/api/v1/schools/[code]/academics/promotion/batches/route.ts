import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PROMOTION_ROLES, callerOf } from "@/lib/promotion/http";
import { listPromotionBatches } from "@/lib/promotion/service";

// GET /api/v1/schools/[code]/academics/promotion/batches                                                                                                   (task 0031)
// The history of rolls the caller may see, newest first (at most 200): an administrator all, a campus administrator those of their own campus.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) =>
    ok({ batches: await auth.tenant.run((tx) => listPromotionBatches(tx, auth.tenant.tenantId, callerOf(auth))) }),
  { tenant: true, area: "academics", roles: PROMOTION_ROLES },
);
