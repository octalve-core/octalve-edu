import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { judgeCampus } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { failureResponse, isPlausibleId, removeReviewerBody, requireFreshProof } from "@/lib/question-bank/http";
import { removeReviewer } from "@/lib/question-bank/reviewers-service";

type Ctx = { params: Promise<{ code: string; id: string }> };

// DELETE /api/v1/schools/[code]/question-bank/reviewers/[id]  { stepUp } — the school's administrator removes any reviewer of the school; a campus administrator only their own
// campus's (another campus's is "no such reviewer"; a school-wide one they may see but not remove is a 403). Fresh re-authentication, audited. Nothing else changes: decisions
// the person already made stay as they are.
export const DELETE = withAuth(
  validate({ body: removeReviewerBody }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return fail("No such reviewer.", 404, "NOT_FOUND");
    const campusOf = await auth.tenant.run(async (tx) => {
      const row = await tx.questionBankReviewer.findFirst({ where: { id, tenantId: auth.tenant.tenantId }, select: { campusId: true } });
      return row ? row.campusId : undefined;
    });
    const refused = judgeCampus(auth, campusOf, "reviewer");
    if (refused) return refused;
    const proof = await requireFreshProof(auth, body.stepUp);
    if (!proof.ok) return proof.response;
    const result = await removeReviewer(auth.tenant, {
      actorUserId: auth.userId,
      actorRole: auth.tenant.role,
      actorCampusId: auth.tenant.campusId,
      stepUpVerifiedAt: proof.verifiedAt,
      id,
    });
    return result.ok ? ok({ removed: true }) : failureResponse(result);
  }),
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);
