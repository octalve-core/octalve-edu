import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { summarise } from "@/lib/programs/attendance-service";
import { summaryQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET .../attendance/summary?groupId=&from=&to= - per person over a range: each way, the percentage, a flag below the program's threshold, the lowest first. */
export const GET = withAuth(
  validate({ query: summaryQuery }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await summarise(auth, id, query));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
