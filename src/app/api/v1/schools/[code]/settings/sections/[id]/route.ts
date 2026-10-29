import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { updateSection } from "@/lib/results/approver-settings";
import { approverSettingsFailure, isPlausibleId, settingsWriteLimited, updateSectionBody } from "@/lib/results/approver-settings-http";
import { verifyStepUpProof } from "@/lib/school-settings/service";
import { stepUpFailure } from "@/lib/school-settings/step-up";

type Ctx = { params: Promise<{ code: string; id: string }> };

// PATCH /api/v1/schools/[code]/settings/sections/[id]  { name?, sortOrder?, archived?, stepUp } — ADMIN only, fresh re-authentication, audited (SECTION_RENAMED,
// SECTION_REORDERED, SECTION_ARCHIVED, SECTION_RESTORED), in the same transaction. An archived section can only be restored. Nothing is deleted.
export const PATCH = withAuth(
  validate({ body: updateSectionBody }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return approverSettingsFailure("NOT_FOUND", "section");
    const limited = await settingsWriteLimited(auth);
    if (limited) return limited;
    const proof = await verifyStepUpProof(auth.userId, body.stepUp);
    if (!proof.ok) return stepUpFailure(proof);
    const result = await updateSection(auth.tenant, auth.userId, id, {
      name: body.name,
      sortOrder: body.sortOrder,
      archived: body.archived,
    });
    return result.ok ? ok({ section: result.section, changed: result.changed }) : approverSettingsFailure(result.reason, result.what);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
