import { Role } from "@prisma/client";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { respond } from "@/lib/programs/http";
import { unlinkCampus } from "@/lib/programs/service";

type Ctx = { params: Promise<{ code: string; id: string; campusId: string }> };

/** DELETE /api/v1/schools/[code]/programs/[id]/campuses/[campusId] - the program stops running in this campus. The school's administrator only; never the last one. */
export const DELETE = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id, campusId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(campusId)) return notFound("program");
    return respond(await unlinkCampus(auth, id, campusId));
  },
  { tenant: true, roles: [Role.ADMIN] },
);
