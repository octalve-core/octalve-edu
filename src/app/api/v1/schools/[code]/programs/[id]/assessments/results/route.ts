import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { programResults } from "@/lib/programs/assessment-service";
import { resultsQuery } from "@/lib/programs/assessment-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/assessments/results?groupId= - each person's results across the PUBLISHED assessments that apply to them, with the weighted average and grade. Only people the caller may see. */
export const GET = withAuth(
  validate({ query: resultsQuery }, async (_req, auth: TenantAuthContext, { params }: Ctx, { query }) =>
    respond(await programResults(auth, (await params).id, query)),
  ),
  { tenant: true, roles: PROGRAM_ROLES },
);
