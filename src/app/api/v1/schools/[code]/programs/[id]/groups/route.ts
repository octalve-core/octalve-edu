import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { createGroup } from "@/lib/programs/structure-service";
import { createGroupSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** POST /api/v1/schools/[code]/programs/[id]/groups { parentId?, name } - a group at the top, or inside another group. The school's administrator or a program admin. */
export const POST = withAuth(
  validate({ body: createGroupSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await createGroup(auth, id, body), 201);
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
