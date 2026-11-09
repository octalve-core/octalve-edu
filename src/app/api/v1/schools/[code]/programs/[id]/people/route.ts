import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { addPerson, listPeople } from "@/lib/programs/people-service";
import { addPersonSchema, listPeopleQuery } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/people?q&groupId&campusId&kind&state&page - the people the caller may see, 50 a page, newest joiners first. A campus administrator sees only the people through their own campus. */
export const GET = withAuth(
  validate({ query: listPeopleQuery }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await listPeople(auth, id, query));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);

/** POST /api/v1/schools/[code]/programs/[id]/people - adds a pupil, a member of staff or a guardian (by linking the record) or an adult or a child (typed in), into a live group. */
export const POST = withAuth(
  validate({ body: addPersonSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await addPerson(auth, id, body), 201);
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
