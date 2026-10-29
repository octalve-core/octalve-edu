import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { certificateScope } from "@/lib/auth/campus-scope";
import { revokeCertificate } from "@/lib/certificates/service";

// POST /api/v1/schools/[code]/certificates/[id]/revoke
// A campus administrator revokes those of their own campus's students only.
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("certificate");
    const refused = await certificateScope(auth, id);
    if (refused) return refused;
    const revoked = await revokeCertificate(auth.tenant.tenantId, id);
    if (!revoked) return notFound("certificate");
    return ok({ certificate: revoked, message: "Certificate successfully revoked" });
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
