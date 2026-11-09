import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { requireFreshProof } from "@/lib/question-bank/http";
import { switchSettingSchema } from "@/lib/settings/switch-schema";
import { assessmentsSwitch } from "@/lib/programs/settings-service";

/**
 * GET /api/v1/schools/[code]/settings/programs-assessments
 * Is assessments in programs switched on for the school and its campuses (`programs.assessments.enabled`)? The school's value and, per campus, what is stored and what applies. The school's administrator
 * sees every campus; a campus administrator their own, to read and to turn off.
 */
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok(await assessmentsSwitch.view(auth.tenant)), {
  tenant: true,
  roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
});

/**
 * PATCH /api/v1/schools/[code]/settings/programs-assessments { scope: "SCHOOL" | "CAMPUS", campusId?, enabled: boolean | null, reason?, stepUp? }
 * The school's value: the school's administrator, with a fresh re-authentication. A campus's value: the school's administrator or that campus's administrator, with none, and a
 * campus can only turn it OFF (it narrows the school's value, never widens it). `enabled: null` removes the stored value (back to the default, on). Every change is audited.
 * The campus of a campus administrator is checked in the switch (`ceiling-switch.ts`, `set`): any other campus answers 404.
 */
export const PATCH = withAuth(
  validate({ body: switchSettingSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    if (body.scope === "SCHOOL") {
      if (auth.tenant.role !== Role.ADMIN) return fail("Only a school administrator can change the school's setting.", 403, "FORBIDDEN");
      const proof = await requireFreshProof(auth, body.stepUp!);
      if (!proof.ok) return proof.response;
    }
    const result = await assessmentsSwitch.set(auth.tenant, {
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
