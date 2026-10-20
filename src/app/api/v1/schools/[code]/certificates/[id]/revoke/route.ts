import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { revokeCertificate } from "@/lib/certificates/service";

// POST /api/v1/schools/[code]/certificates/[id]/revoke
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("certificate");
    const revoked = await revokeCertificate(auth.tenant.tenantId, id);
    if (!revoked) return notFound("certificate");
    return ok({ certificate: revoked, message: "Certificate successfully revoked" });
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
