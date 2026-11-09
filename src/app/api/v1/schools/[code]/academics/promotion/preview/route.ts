import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PROMOTION_ROLES, callerOf, promotionCall } from "@/lib/promotion/http";
import { previewPromotion } from "@/lib/promotion/service";
import { promotionPreviewQuerySchema } from "@/lib/promotion/validation";

// GET /api/v1/schools/[code]/academics/promotion/preview?sourceSessionId=&targetSessionId=&sourceClassGroupId=&passMark=            (task 0031)
// A dry run for one class: the roll, each pupil's term averages, what the rule advises and where they would go. Writes nothing. An administrator, or a campus administrator for a class
// of their own campus (another campus's class is the same 404 as an unknown one; a class of the whole school is the school administrator's, 403).
export const GET = withAuth(
  validate({ query: promotionPreviewQuerySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) =>
    promotionCall(async () =>
      ok({ preview: await auth.tenant.run((tx) => previewPromotion(tx, auth.tenant.tenantId, callerOf(auth), query)) }),
    ),
  ),
  { tenant: true, area: "academics", roles: PROMOTION_ROLES },
);
