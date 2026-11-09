import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { candidates } from "@/lib/programs/people-service";
import { candidatesQuery } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET .../people/candidates?kind=STUDENT|STAFF|GUARDIAN&q - the school's records the caller may add (at most 25, 2 letters or more). */
export const GET = withAuth(
  validate({ query: candidatesQuery }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await candidates(auth, id, query));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
