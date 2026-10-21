import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { archiveLearningMaterial } from "@/lib/lms/service";

// DELETE /api/v1/schools/[code]/lms/materials/[id]
export const DELETE = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    const archived = await archiveLearningMaterial(auth.tenant.tenantId, id);
    if (!archived) return fail("Material not found", 404, "NOT_FOUND");
    return ok(archived);
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
