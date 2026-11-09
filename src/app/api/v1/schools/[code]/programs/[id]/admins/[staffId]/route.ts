import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { endProgramStaff } from "@/lib/programs/staff-service";

type Ctx = { params: Promise<{ code: string; id: string; staffId: string }> };

/** DELETE /api/v1/schools/[code]/programs/[id]/admins/[staffId] - ends a program admin's place (kept as history). A program admin's place is ended by the school's administrator only. */
export const DELETE = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id, staffId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(staffId)) return notFound("program");
    return respond(await endProgramStaff(auth, id, staffId));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);
