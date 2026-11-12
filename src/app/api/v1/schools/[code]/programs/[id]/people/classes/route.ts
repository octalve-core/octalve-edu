import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { classOptions } from "@/lib/programs/people-service";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET .../people/classes - the classes whose pupils the caller may add as a whole. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await classOptions(auth, id));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);
