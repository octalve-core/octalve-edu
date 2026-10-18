import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { updateAssignmentSchema } from "@/lib/lms/validation";
import { getAssignment, updateAssignment, archiveAssignment } from "@/lib/lms/service";

// GET /api/v1/schools/[code]/lms/assignments/[id]
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    const assignment = await getAssignment(auth.tenant.tenantId, id);
    if (!assignment) {
      return fail("Assignment not found", 404, "NOT_FOUND");
    }
    return ok(assignment);
  },
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT],
  },
);

// PATCH /api/v1/schools/[code]/lms/assignments/[id]
export const PATCH = withAuth(
  validate(
    { body: updateAssignmentSchema },
    async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }, { body }) => {
      const { id } = await ctx.params;
      const updated = await updateAssignment(auth.tenant.tenantId, id, body);
      return ok(updated);
    },
  ),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);

// DELETE /api/v1/schools/[code]/lms/assignments/[id]
export const DELETE = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    const archived = await archiveAssignment(auth.tenant.tenantId, id);
    return ok(archived);
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
