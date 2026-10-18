import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { revokeCertificate } from "@/lib/certificates/service";

// POST /api/v1/schools/[code]/certificates/[id]/revoke
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    try {
      const revoked = await revokeCertificate(auth.tenant.tenantId, id);
      return ok({ certificate: revoked, message: "Certificate successfully revoked" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to revoke certificate";
      return fail(message, 400, "BAD_REQUEST");
    }
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
