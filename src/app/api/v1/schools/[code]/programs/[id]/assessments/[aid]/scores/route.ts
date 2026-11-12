import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { fail } from "@/lib/api/envelope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { saveScores } from "@/lib/programs/assessment-service";
import { saveScoresSchema } from "@/lib/programs/assessment-validation";

type Ctx = { params: Promise<{ code: string; id: string; aid: string }> };
const PER_WINDOW = 240;

/**
 * PUT /api/v1/schools/[code]/programs/[id]/assessments/[aid]/scores { reason?, entries: [{ participantId, score | code, comment?, version? }] }
 * Saves scores: every entry or none (at most 500). A teacher or a recorder: the people in their groups, while the assessment is open; an administrator: anyone, also after marking and
 * publishing (a published change needs a reason). 409 `CHANGED` for a stale version, `NOT_ON_SHEET`, `NOT_MARKABLE` (suspended), `NOT_OPEN`, `NOT_YET`; 400 `INVALID_SCORE`, `REASON_REQUIRED`; rate limited.
 */
export const PUT = withAuth(
  validate({ body: saveScoresSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    if (!(await reserveAttempt(`scores:${auth.tenant.tenantId}:${auth.userId}`, PER_WINDOW)))
      return fail("Too many saves. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const { id, aid } = await params;
    return respond(await saveScores(auth, id, aid, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
