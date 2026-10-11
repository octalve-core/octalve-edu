import { financeFailure } from "@/lib/finance/http";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { initializePaymentSchema } from "@/lib/finance/http";
import { initializePayment, getStudentInvoice } from "@/lib/finance/service";

// POST /api/v1/schools/[code]/finance/invoices/[id]/pay
export const POST = withAuth(
  validate(
    { body: initializePaymentSchema },
    async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }, { body }) => {
      try {
        const { id } = await ctx.params;

        // Verify IDOR authorization first
        await getStudentInvoice(auth.tenant.tenantId, id, {
          userId: auth.userId,
          roles: [auth.tenant.role],
          permissions: [...auth.tenant.permissions],
        });

        const userEmail = auth.user.email || "payer@octalve.internal";
        const result = await initializePayment(auth.tenant.tenantId, id, userEmail, body.amount);
        return ok(result);
      } catch (err: unknown) {
        return financeFailure(err, "PAY");
      }
    },
  ),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.PARENT, Role.STUDENT],
  },
);
