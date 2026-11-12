import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { createAssessment, listAssessments } from "@/lib/programs/assessment-service";
import { createAssessmentSchema } from "@/lib/programs/assessment-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/assessments - the assessments the caller may see (a draft only an administrator; a teacher the ones for their groups), with the program's grade bands and whether assessments are on. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, { params }: Ctx) => respond(await listAssessments(auth, (await params).id)),
  {
    tenant: true,
    roles: PROGRAM_ROLES,
  },
);

/**
 * POST /api/v1/schools/[code]/programs/[id]/assessments { title, kind?, date, maxScore, passMark?, weight?, required?, groupIds? }
 * Makes a draft assessment for the whole program (no groups) or for chosen groups. A school's administrator or a program admin; 409 `ASSESSMENTS_OFF`, `TOO_MANY` (200).
 */
export const POST = withAuth(
  validate({ body: createAssessmentSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) =>
    respond(await createAssessment(auth, (await params).id, body), 201),
  ),
  { tenant: true, roles: PROGRAM_ROLES },
);
