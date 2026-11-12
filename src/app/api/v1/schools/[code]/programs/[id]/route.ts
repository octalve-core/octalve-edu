import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { getProgram, updateProgram } from "@/lib/programs/service";
import { updateProgramSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id] - one program with its campuses, level names, groups, admins and (for those who manage it) the latest audit. 404 for a program the caller has no place in. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await getProgram(auth, id));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);

/** PATCH /api/v1/schools/[code]/programs/[id] { name?, description?, startsOn?, endsOn? } - the school's administrator or a program admin, while the program is a draft or active. */
export const PATCH = withAuth(
  validate({ body: updateProgramSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await updateProgram(auth, id, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
