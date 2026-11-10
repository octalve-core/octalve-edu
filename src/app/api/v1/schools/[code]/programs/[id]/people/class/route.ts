import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { addClass } from "@/lib/programs/people-service";
import { addClassSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** POST .../people/class { classArmId, groupId, confirm } - without confirm: who would be added and who skipped; with it: one audited step that adds them. */
export const POST = withAuth(
  validate({ body: addClassSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await addClass(auth, id, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
