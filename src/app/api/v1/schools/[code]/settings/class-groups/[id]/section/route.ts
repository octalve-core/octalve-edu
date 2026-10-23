import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { placeClassGroup } from "@/lib/results/approver-settings";
import { approverSettingsFailure, isPlausibleId, placeClassGroupBody, settingsWriteLimited } from "@/lib/results/approver-settings-http";
import { verifyStepUpProof } from "@/lib/school-settings/service";
import { stepUpFailure } from "@/lib/school-settings/step-up";

type Ctx = { params: Promise<{ code: string; id: string }> };

// PUT /api/v1/schools/[code]/settings/class-groups/[id]/section  { sectionId | null, stepUp } — ADMIN only, fresh re-authentication, audited
// (CLASS_GROUP_SECTION_CHANGED). Puts the class group in a live section of the same campus, or takes it out with null. A class group is in at most one section.
export const PUT = withAuth(
  validate({ body: placeClassGroupBody }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return approverSettingsFailure("NOT_FOUND", "class group");
    const limited = await settingsWriteLimited(auth);
    if (limited) return limited;
    const proof = await verifyStepUpProof(auth.userId, body.stepUp);
    if (!proof.ok) return stepUpFailure(proof);
    const result = await placeClassGroup(auth.tenant, auth.userId, id, body.sectionId);
    return result.ok ? ok({ classGroup: result.classGroup, changed: result.changed }) : approverSettingsFailure(result.reason, result.what);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
