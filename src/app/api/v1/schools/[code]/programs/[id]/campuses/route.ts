import { Role } from "@prisma/client";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { respond } from "@/lib/programs/http";
import { linkCampus } from "@/lib/programs/service";
import { linkCampusSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** POST /api/v1/schools/[code]/programs/[id]/campuses { campusId } - the program also runs in this campus. The school's administrator only. */
export const POST = withAuth(
  validate({ body: linkCampusSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await linkCampus(auth, id, body.campusId), 201);
  }),
  { tenant: true, roles: [Role.ADMIN] },
);
