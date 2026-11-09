import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PROMOTION_ROLES, callerOf, promotionCall } from "@/lib/promotion/http";
import { executePromotion } from "@/lib/promotion/service";
import { executePromotionSchema } from "@/lib/promotion/validation";

// POST /api/v1/schools/[code]/academics/promotion/execute { sourceSessionId, targetSessionId, sourceClassGroupId, targetClassGroupId?, passMark?, overrides?, notes? }   (task 0031)
// Rolls one class into the next session: each pupil on the roll is promoted, repeats, graduates or leaves, and the batch is recorded for good. Safe to repeat (a second run finds the pupils
// already dealt with and records none). Same people as the preview; every refusal is decided before anything is written.
export const POST = withAuth(
  validate({ body: executePromotionSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) =>
    promotionCall(async () =>
      ok({ batch: await auth.tenant.run((tx) => executePromotion(tx, auth.tenant.tenantId, callerOf(auth), body)) }, {}, 201),
    ),
  ),
  { tenant: true, roles: PROMOTION_ROLES } // no `area`: a platform support view is read-only, so it cannot roll a class,
);
