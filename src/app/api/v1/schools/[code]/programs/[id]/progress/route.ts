import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { getOverview } from "@/lib/programs/progress-service";
import { peopleQuery } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/**
 * GET /api/v1/schools/[code]/programs/[id]/progress?q=&groupId=&page=
 * The people whose progress record the caller may see (a school's administrator and a program admin all; a supervisor all; a teacher or a recorder those in their groups; a campus administrator
 * those through their own campus), with each one's last entry and how many are waiting to be verified; the program's template, settings, and what the caller may do. Reading never
 * creates anything and stays open when progress records are switched off: what was recorded stays readable.
 */
export const GET = withAuth(
  validate({ query: peopleQuery }, async (_req, auth: TenantAuthContext, { params }: Ctx, { query }) =>
    respond(await getOverview(auth, (await params).id, query)),
  ),
  { tenant: true, roles: PROGRAM_ROLES },
);
