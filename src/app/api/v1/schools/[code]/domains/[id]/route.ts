import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { deleteCustomDomain } from "@/lib/domains/service";

// DELETE /api/v1/schools/[code]/domains/[id]
export const DELETE = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    try {
      await deleteCustomDomain(auth.tenant.tenantId, id);
      return ok({ success: true, message: "Custom domain removed" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete domain";
      return fail(message, 400, "BAD_REQUEST");
    }
  },
  {
    tenant: true,
    roles: [Role.ADMIN],
  },
);
