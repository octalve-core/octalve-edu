import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { listSessions } from "@/lib/programs/attendance-service";
import { sessionsQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET .../attendance/sessions?groupId=&from=&to= - the sessions held in a range, with how many were marked each way (among the people the caller may see). */
export const GET = withAuth(
  validate({ query: sessionsQuery }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await listSessions(auth, id, query));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
