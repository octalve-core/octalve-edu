import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { assessmentAction, getAssessment, updateAssessment } from "@/lib/programs/assessment-service";
import { assessmentActionSchema, updateAssessmentSchema } from "@/lib/programs/assessment-validation";

type Ctx = { params: Promise<{ code: string; id: string; aid: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/assessments/[aid] - the assessment and its sheet: who is on it (once each), their score or code, the grade, what the caller may do (`rights`), and the counts. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, { params }: Ctx) => {
    const { id, aid } = await params;
    return respond(await getAssessment(auth, id, aid));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);

/** PATCH /api/v1/schools/[code]/programs/[id]/assessments/[aid] - change the details: a draft anything, an open one only its title, kind, pass mark, weight and `required` (409 `LOCKED_FIELD`). A school's administrator or a program admin. */
export const PATCH = withAuth(
  validate({ body: updateAssessmentSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, aid } = await params;
    return respond(await updateAssessment(auth, id, aid, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);

/**
 * POST /api/v1/schools/[code]/programs/[id]/assessments/[aid] { action: "open" | "mark" | "reopen" | "publish" | "archive" }
 * An administrator any of them; a supervisor only "mark". Marking needs every expected score in (409 `INCOMPLETE`); 409 `NOT_APPLICABLE` when the action does not fit the status.
 */
export const POST = withAuth(
  validate({ body: assessmentActionSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, aid } = await params;
    return respond(await assessmentAction(auth, id, aid, body.action));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
