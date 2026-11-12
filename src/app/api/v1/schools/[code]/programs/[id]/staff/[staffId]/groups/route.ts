import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { setStaffGroups } from "@/lib/programs/staff-service";
import { staffGroupsSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ code: string; id: string; staffId: string }> };

/** PUT .../staff/[staffId]/groups { groupIds } - the groups a teacher or a recorder takes attendance for (replaces the set; an assignment covers the groups inside it). 409 NO_GROUPS_FOR_ROLE for a supervisor or a program admin. */
export const PUT = withAuth(
  validate({ body: staffGroupsSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id, staffId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(staffId)) return notFound("program");
    return respond(await setStaffGroups(auth, id, staffId, body.groupIds));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
