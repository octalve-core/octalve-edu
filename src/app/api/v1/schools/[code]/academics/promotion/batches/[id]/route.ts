import { fail, ok } from "@/lib/api/envelope";
import { isPlausibleId } from "@/lib/academics/http";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PROMOTION_ROLES, callerOf } from "@/lib/promotion/http";
import { getPromotionBatch } from "@/lib/promotion/service";

type Ctx = { params: Promise<{ code: string; id: string }> };

// GET /api/v1/schools/[code]/academics/promotion/batches/[id]                                                                                              (task 0031)
// One roll with the decision taken for each pupil and the one the rule advised. A batch that is not there, is another school's, or is outside the caller's campus is the same 404.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return fail("No such promotion.", 404, "NOT_FOUND");
    const found = await auth.tenant.run((tx) => getPromotionBatch(tx, auth.tenant.tenantId, callerOf(auth), id));
    return found ? ok(found) : fail("No such promotion.", 404, "NOT_FOUND");
  },
  { tenant: true, area: "academics", roles: PROMOTION_ROLES },
);
