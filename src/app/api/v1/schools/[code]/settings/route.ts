import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { updateSettingsSchema } from "@/lib/school-settings/http";
import { getSchoolSettingsDetail, mutateSchoolSettings, verifyStepUpProof } from "@/lib/school-settings/service";
import { stepUpFailure } from "@/lib/school-settings/step-up";

// GET /api/v1/schools/[code]/settings
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    try {
      const data = await getSchoolSettingsDetail(auth.tenant.tenantId, auth.userId);
      return ok(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load school settings";
      return fail(message, 500);
    }
  },
  { tenant: true, area: "settings", roles: [Role.ADMIN] },
);

// PATCH /api/v1/schools/[code]/settings
export const PATCH = withAuth(
  validate({ body: updateSettingsSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    // 1. Verify step-up re-authentication proof (PRD §14, plan §1.3)
    const stepUp = await verifyStepUpProof(auth.userId, body.stepUp);
    if (!stepUp.ok) return stepUpFailure(stepUp);

    // 2. Apply settings changes atomically with immutable audit logging
    try {
      const { settings, deltas } = await mutateSchoolSettings(auth.tenant.tenantId, auth.userId, body.changes, stepUp.verifiedAt);

      return ok({ settings, deltas });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update school settings";
      return fail(message, 400);
    }
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
