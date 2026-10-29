import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { createSection, listSections } from "@/lib/results/approver-settings";
import { approverSettingsFailure, createSectionBody, settingsWriteLimited } from "@/lib/results/approver-settings-http";
import { verifyStepUpProof } from "@/lib/school-settings/service";
import { stepUpFailure } from "@/lib/school-settings/step-up";

// GET /api/v1/schools/[code]/settings/sections — ADMIN only (ADR 0018). The sections (archived ones marked and last) with their class groups, the class groups that are in no
// section, and the campuses. The settings area of a support view may read it.
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok(await listSections(auth.tenant)), {
  tenant: true,
  area: "settings",
  roles: [Role.ADMIN],
});

// POST /api/v1/schools/[code]/settings/sections  { name, campusId?, sortOrder?, stepUp } — ADMIN only, with the same fresh re-authentication as the school's other settings,
// audited (SECTION_CREATED) in the same transaction.
export const POST = withAuth(
  validate({ body: createSectionBody }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    const limited = await settingsWriteLimited(auth);
    if (limited) return limited;
    const proof = await verifyStepUpProof(auth.userId, body.stepUp);
    if (!proof.ok) return stepUpFailure(proof);
    const result = await createSection(auth.tenant, auth.userId, {
      name: body.name,
      campusId: body.campusId ?? null,
      sortOrder: body.sortOrder,
    });
    return result.ok ? ok({ section: result.section }) : approverSettingsFailure(result.reason, result.what);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
