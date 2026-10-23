import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { setApproverScopes } from "@/lib/results/approver-settings";
import { approverSettingsFailure, isPlausibleId, setScopesBody, settingsWriteLimited } from "@/lib/results/approver-settings-http";
import { verifyStepUpProof } from "@/lib/school-settings/service";
import { stepUpFailure } from "@/lib/school-settings/step-up";

type Ctx = { params: Promise<{ code: string; userId: string }> };

// PUT /api/v1/schools/[code]/settings/approvers/[userId]/scopes  { scopes: [{ kind: "GENERAL" } | { kind: "SECTION", sectionId } | { kind: "CLASS", classGroupId }], stepUp }
// — ADMIN only, fresh re-authentication, audited (RESULT_APPROVAL_SCOPE_CHANGED with the set before and after), in the same transaction. Replaces the person's whole set; an
// empty list means they approve nothing. The person must hold the permission; a section or class group must be this school's, live, and in the person's campus.
export const PUT = withAuth(
  validate({ body: setScopesBody }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { userId } = await ctx.params;
    if (!isPlausibleId(userId)) return approverSettingsFailure("NOT_FOUND", "person");
    const limited = await settingsWriteLimited(auth);
    if (limited) return limited;
    const proof = await verifyStepUpProof(auth.userId, body.stepUp);
    if (!proof.ok) return stepUpFailure(proof);
    const result = await setApproverScopes(auth.tenant, auth.userId, userId, body.scopes);
    return result.ok ? ok({ scopes: result.scopes, changed: result.changed }) : approverSettingsFailure(result.reason, result.what);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
