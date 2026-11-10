import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { candidatesFor } from "@/lib/programs/staff-service";
import { staffCandidatesQuery } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET .../staff/candidates?role= - who could be named to a role (the active staff whose campus fits the program, who do not hold it yet). ADMIN: the school's administrator only. The other roles: the school's administrator or a program admin. */
export const GET = withAuth(
  validate({ query: staffCandidatesQuery }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await candidatesFor(auth, id, query.role));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
