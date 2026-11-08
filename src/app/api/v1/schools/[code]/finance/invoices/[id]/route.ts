import { financeFailure } from "@/lib/finance/http";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { getStudentInvoice } from "@/lib/finance/service";
import { partPaymentFor } from "@/lib/finance/part-payment-service";
import { forTenant } from "@/lib/tenant/for-tenant";

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
      // What a screen says about paying this invoice in parts (task 0029): the same rule the payment paths enforce.
      const partPayment = await forTenant(auth.tenant.tenantId).transaction((tx) => partPaymentFor(tx, auth.tenant.tenantId, invoice));
      return ok({ invoice, partPayment });
    } catch (err: unknown) {
      return financeFailure(err, "INVOICE");
    }
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.PARENT, Role.STUDENT],
  },
);
