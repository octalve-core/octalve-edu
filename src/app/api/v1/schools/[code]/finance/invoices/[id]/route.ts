import { financeFailure } from "@/lib/finance/http";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { getStudentInvoice } from "@/lib/finance/service";

// GET /api/v1/schools/[code]/finance/invoices/[id]
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    try {
      const { id } = await ctx.params;
      const invoice = await getStudentInvoice(auth.tenant.tenantId, id, {
        userId: auth.userId,
        roles: [auth.tenant.role],
        permissions: [...auth.tenant.permissions],
        campusId: auth.tenant.campusId,
      });
      return ok({ invoice });
    } catch (err: unknown) {
      return financeFailure(err, "INVOICE");
    }
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.PARENT, Role.STUDENT],
  },
);
