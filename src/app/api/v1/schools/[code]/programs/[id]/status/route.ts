import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { changeStatus } from "@/lib/programs/service";
import { statusSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** POST /api/v1/schools/[code]/programs/[id]/status { action: "activate" | "archive" | "restore" } - activate or archive: the school's administrator or a program admin; restore: the school's administrator. */
export const POST = withAuth(
  validate({ body: statusSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await changeStatus(auth, id, body.action));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
