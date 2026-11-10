import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { personAttendance } from "@/lib/programs/attendance-service";
import { historyQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/** GET .../attendance/people/[personId]?from=&to= - one person's marks, newest first, each with the corrections made to it (who, when, from what, to what, why). */
export const GET = withAuth(
  validate({ query: historyQuery }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id, personId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(personId)) return notFound("person");
    return respond(await personAttendance(auth, id, personId, query));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
