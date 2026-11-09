import { Role } from "@prisma/client";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { respond } from "@/lib/programs/http";
import { adminCandidates, nameProgramAdmin } from "@/lib/programs/staff-service";
import { nameAdminSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/admins - the staff who could be named a program admin (the school's own staff list: the school's administrator only). */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await adminCandidates(auth, id));
  },
  { tenant: true, roles: [Role.ADMIN] },
);

/** POST /api/v1/schools/[code]/programs/[id]/admins { userId } - names a program admin. The school's administrator only, so nobody can promote themselves. */
export const POST = withAuth(
  validate({ body: nameAdminSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await nameProgramAdmin(auth, id, body.userId), 201);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
