import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { createCampus, ownCampusOnly } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { addReviewerBody, failureResponse, isPlausibleId, requireFreshProof } from "@/lib/question-bank/http";
import { addReviewer, listReviewers } from "@/lib/question-bank/reviewers-service";

// The question bank's reviewers (task 0024 slice B). School and campus administrators only; NO `area`, so no support view reaches it (parity note section 5).
// GET ?campusId=  A campus's reviewers plus the school-wide ones (flagged `inherited`); with no campus, every reviewer of the school (the school administrator's view). A campus
//                 administrator sees their own campus's view only.
// POST            { campusId (null = every campus), userId, scope, subjectLabel?, isExamApprover?, stepUp } Fresh re-authentication, audited in the same transaction. A campus
//                 administrator assigns for their own campus; the school's administrator for any campus or the whole school.
export const GET = withAuth(
  async (req, auth: TenantAuthContext) => {
    const asked = new URL(req.url).searchParams.get("campusId");
    if (asked !== null && !isPlausibleId(asked)) return fail("No such campus.", 404, "NOT_FOUND");
    const refused = ownCampusOnly(auth, asked ?? undefined);
    if (refused) return refused;
    // a campus administrator who names no campus is shown their own
    const campusId = asked ?? (auth.tenant.role === "CAMPUS_ADMIN" ? auth.tenant.campusId : null);
    if (campusId !== null) {
      const known = await auth.tenant.run((tx) => tx.campus.findFirst({ where: { id: campusId, tenantId: auth.tenant.tenantId }, select: { id: true } }));
      if (!known) return fail("No such campus.", 404, "NOT_FOUND");
    }
    return ok({ reviewers: await listReviewers(auth.tenant, campusId) });
  },
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);

export const POST = withAuth(
  validate({ body: addReviewerBody }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    if (!isPlausibleId(body.userId)) return fail("That is not a valid id.", 400, "VALIDATION");
    const where = createCampus(auth, body.campusId);
    if (where instanceof Response) return where;
    const proof = await requireFreshProof(auth, body.stepUp);
    if (!proof.ok) return proof.response;
    const result = await addReviewer(auth.tenant, {
      actorUserId: auth.userId,
      actorRole: auth.tenant.role,
      actorCampusId: auth.tenant.campusId,
      stepUpVerifiedAt: proof.verifiedAt,
      campusId: where.campusId,
      userId: body.userId,
      scope: body.scope,
      subjectLabel: body.subjectLabel ?? null,
      isExamApprover: body.isExamApprover ?? false,
    });
    return result.ok ? ok({ reviewer: result.reviewer }, {}, 201) : failureResponse(result);
  }),
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);
