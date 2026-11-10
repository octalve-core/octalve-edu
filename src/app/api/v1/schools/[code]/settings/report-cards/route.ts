import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { requireFreshProof } from "@/lib/question-bank/http";
import { switchSettingSchema } from "@/lib/settings/switch-schema";
import { reportCardsOpenSwitch } from "@/lib/results/report-card-gate";

/**
 * GET /api/v1/schools/[code]/settings/report-cards
 * Are report cards released to pupils and parents whatever is owed (`results.reportCardsOpen`, on unless the school turns it off)? The school's value and, per campus, what is stored and what
 * applies. The school's administrator sees every campus; a campus administrator their own, to read and to hold cards for.
 */
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok(await reportCardsOpenSwitch.view(auth.tenant)), {
  tenant: true,
  roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
});

/**
 * PATCH /api/v1/schools/[code]/settings/report-cards { scope: "SCHOOL" | "CAMPUS", campusId?, enabled: boolean | null, reason?, stepUp? }
 * Turning the switch OFF holds report cards back from a pupil or parent while school fees are owed (task 0037). The school's value: the school's administrator, with a fresh re-authentication. A
 * campus's value: the school's administrator or that campus's administrator, with none, and a campus can only turn it OFF (it holds more, it never releases what the school holds).
 * `enabled: null` removes the stored value (back to the default, on). Every change is audited. State-changing, so it declares no support `area`.
 */
export const PATCH = withAuth(
  validate({ body: switchSettingSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    if (body.scope === "SCHOOL") {
      if (auth.tenant.role !== Role.ADMIN) return fail("Only a school administrator can change the school's setting.", 403, "FORBIDDEN");
      const proof = await requireFreshProof(auth, body.stepUp!);
      if (!proof.ok) return proof.response;
    }
    const result = await reportCardsOpenSwitch.set(auth.tenant, {
      actorUserId: auth.userId,
      scope: body.scope,
      campusId: body.campusId ?? null,
      enabled: body.enabled,
      reason: body.reason ?? null,
    });
    return result.ok ? ok(result.data) : fail(result.message, result.status, result.code);
  }),
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);
