import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { editPerson, getPerson } from "@/lib/programs/people-service";
import { editPersonSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/** GET .../people/[personId] - one person and the history of their place. 404 for a person the caller may not see. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id, personId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(personId)) return notFound("person");
    return respond(await getPerson(auth, id, personId));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);

/** PATCH .../people/[personId] - the details of a person typed in (a linked person's details are the school's record: 409). */
export const PATCH = withAuth(
  validate({ body: editPersonSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id, personId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(personId)) return notFound("person");
    return respond(await editPerson(auth, id, personId, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
