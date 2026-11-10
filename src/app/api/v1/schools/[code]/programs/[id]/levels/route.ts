import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { setLevelLabels } from "@/lib/programs/structure-service";
import { levelsSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** PUT /api/v1/schools/[code]/programs/[id]/levels { labels: string[] } - the program's own names for its levels (1 to 4). The school's administrator or a program admin. */
export const PUT = withAuth(
  validate({ body: levelsSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await setLevelLabels(auth, id, body.labels));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
