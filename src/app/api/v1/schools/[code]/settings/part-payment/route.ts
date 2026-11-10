import { Permission, Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { policyView, setPolicy } from "@/lib/finance/part-payment-service";
import { partPaymentSettingSchema } from "@/lib/finance/part-payment-validation";
import { requireFreshProof } from "@/lib/question-bank/http";

/**
 * GET /api/v1/schools/[code]/settings/part-payment
 * The part-payment rule (task 0029): what the school stored and, per campus, what is stored and the sentence that applies. The school's administrator sees every campus; a campus
 * administrator (or a bursar) reads the school's rule and their own campus's. Nobody else reaches it.
 */
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok(await policyView(auth.tenant)), {
  tenant: true,
  roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  permissions: [Permission.CAN_MANAGE_FINANCE],
});

/**
 * PATCH /api/v1/schools/[code]/settings/part-payment
 * { scope: "SCHOOL" | "CAMPUS", campusId?, policy: { allowed, minimum: { kind: "NONE" | "AMOUNT" | "PERCENT", value? } } | null, reason?, stepUp? }
 * The rule is fee configuration, so the school's administrator only (ADR 0016); a campus administrator reads it and cannot change it. The school's own rule needs a fresh
 * re-authentication (`stepUp`); a campus's rule, which can only be TIGHTER than the school's, does not. `policy: null` removes the stored value (back to: part payments allowed,
 * any amount). Every change is audited in the same transaction.
 */
export const PATCH = withAuth(
  validate({ body: partPaymentSettingSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    if (auth.tenant.role !== Role.ADMIN) return fail("Only a school administrator can change the payment rules.", 403, "FORBIDDEN");
    if (body.scope === "SCHOOL") {
      const proof = await requireFreshProof(auth, body.stepUp!);
      if (!proof.ok) return proof.response;
    }
    const result = await setPolicy(auth.tenant, {
      actorUserId: auth.userId,
      scope: body.scope,
      campusId: body.campusId ?? null,
      policy: body.policy,
      reason: body.reason ?? null,
    });
    return result.ok ? ok(result.data) : fail(result.message, result.status, result.code);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
