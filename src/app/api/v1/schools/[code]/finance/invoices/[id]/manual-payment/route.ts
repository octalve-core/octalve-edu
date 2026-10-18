import { financeFailure } from "@/lib/finance/http";
import { Permission, Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { invoiceScope } from "@/lib/auth/campus-scope";
import { recordManualPaymentSchema } from "@/lib/finance/http";
import { recordManualPayment } from "@/lib/finance/service";

// POST /api/v1/schools/[code]/finance/invoices/[id]/manual-payment
export const POST = withAuth(
  validate(
    { body: recordManualPaymentSchema },
    async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }, { body }) => {
      try {
        const { code, id } = await ctx.params;
        // A campus administrator records money only against their own campus's students' invoices (404 for any other). A bursar who holds
        // CAN_MANAGE_FINANCE is school-wide and unchanged.
        if (auth.tenant.role === "CAMPUS_ADMIN") {
          const outOfScope = await invoiceScope(auth, id);
          if (outOfScope) return outOfScope;
        }
        const res = await recordManualPayment(
          auth.tenant.tenantId,
          code,
          id,
          {
            amount: body.amount,
            channel: body.channel,
            receiptNo: body.receiptNo,
            note: body.note,
          },
          auth.userId,
        );
        return ok(res, {}, 201);
      } catch (err: unknown) {
        return financeFailure(err, "MANUAL_PAYMENT");
      }
    },
  ),
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN], permissions: [Permission.CAN_MANAGE_FINANCE] },
);
