import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { verifyCustomDomain } from "@/lib/domains/service";

// POST /api/v1/schools/[code]/domains/[id]/verify
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    try {
      const verified = await verifyCustomDomain(auth.tenant.tenantId, id);
      return ok({ customDomain: verified, message: "Custom domain verified successfully" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Verification check failed";
      return fail(message, 400, "BAD_REQUEST");
    }
  },
  {
    tenant: true,
    roles: [Role.ADMIN],
  },
);
