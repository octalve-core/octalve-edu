import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { updateGroup } from "@/lib/programs/structure-service";
import { updateGroupSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string; groupId: string }> };

/** PATCH /api/v1/schools/[code]/programs/[id]/groups/[groupId] { name } | { move: "up" | "down" } | { archived: boolean } - exactly one of the three. The school's administrator or a program admin. */
export const PATCH = withAuth(
  validate({ body: updateGroupSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id, groupId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(groupId)) return notFound("group");
    return respond(await updateGroup(auth, id, groupId, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
