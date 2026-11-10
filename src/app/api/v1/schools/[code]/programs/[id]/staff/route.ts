import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { nameProgramStaff } from "@/lib/programs/staff-service";
import { nameStaffSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** POST /api/v1/schools/[code]/programs/[id]/staff { userId, role? } - names a member of staff to a role: ADMIN (the default; the school's administrator only), SUPERVISOR, TEACHER or RECORDER (the school's administrator or a program admin). */
export const POST = withAuth(
  validate({ body: nameStaffSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await nameProgramStaff(auth, id, body), 201);
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
