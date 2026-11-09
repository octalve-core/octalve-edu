import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { movePerson } from "@/lib/programs/people-service";
import { movePersonSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/** POST .../people/[personId]/move { groupId } - to another live group of the same program. */
export const POST = withAuth(
  validate({ body: movePersonSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id, personId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(personId)) return notFound("person");
    return respond(await movePerson(auth, id, personId, body.groupId));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
