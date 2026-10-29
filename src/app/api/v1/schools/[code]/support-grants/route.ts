import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { stepUpProofSchema } from "@/lib/school-settings/http";
import { verifyStepUpProof } from "@/lib/school-settings/service";
import { SUPPORT_AREAS, SUPPORT_GRANT_DEFAULT_HOURS, SUPPORT_GRANT_MAX_HOURS } from "@/lib/support/areas";
import { createGrant, findPlatformAdminByEmail, listGrants } from "@/lib/support/grants";

// /api/v1/schools/[code]/support-grants                                                       (task 0011 slice A, ADR 0017)
//   GET   the school's grants, newest first (live, expired, revoked)
//   POST  grant support access: which areas, how many hours (1-24, default 4), why, optional grantee email; needs the step-up proof.
// SCHOOL ADMIN only - not a campus administrator, not a platform administrator. Audited in the school's own log. Finance is not a grantable area.
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok({ grants: await listGrants(auth.tenant) }), {
  tenant: true,
  roles: [Role.ADMIN],
});

const body = z.strictObject({
  areas: z
    .array(z.enum(SUPPORT_AREAS, { error: "Choose from the listed areas." }), { error: "Choose at least one area." })
    .min(1, "Choose at least one area.")
    .refine((areas) => new Set(areas).size === areas.length, "Each area once."),
  hours: z
    .number()
    .int("Whole hours only.")
    .min(1, "At least 1 hour.")
    .max(SUPPORT_GRANT_MAX_HOURS, `At most ${SUPPORT_GRANT_MAX_HOURS} hours.`)
    .default(SUPPORT_GRANT_DEFAULT_HOURS),
  reason: z.string({ error: "Say why." }).trim().min(1, "Say why.").max(300, "Use at most 300 characters."),
  granteeEmail: z.string().trim().email("Enter a valid email address.").optional(),
  stepUp: stepUpProofSchema,
});

export const POST = withAuth(
  validate({ body }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body: input }) => {
    const proof = await verifyStepUpProof(auth.userId, input.stepUp);
    if (!proof.ok) {
      if (proof.reason === "RATE_LIMITED") return fail("Too many verification attempts. Please wait a few minutes.", 429, "RATE_LIMITED");
      if (proof.reason === "INVALID_MFA_CODE") return fail("That code isn't right.", 403, "INVALID_MFA_CODE");
      return fail("That password isn't right.", 403, "WRONG_PASSWORD");
    }

    let granteeUserId: string | null = null;
    if (input.granteeEmail) {
      granteeUserId = await findPlatformAdminByEmail(input.granteeEmail);
      if (!granteeUserId) return fail("That email does not belong to a platform administrator.", 400, "INVALID_GRANTEE");
    }

    const grant = await createGrant(auth.tenant, auth.userId, {
      areas: input.areas,
      hours: input.hours,
      reason: input.reason,
      granteeUserId,
    });
    return ok({ grant }, {}, 201);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
