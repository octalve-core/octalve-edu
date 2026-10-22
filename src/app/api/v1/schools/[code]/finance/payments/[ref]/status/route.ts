import { financeFailure } from "@/lib/finance/http";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { confirmPaymentForRequester } from "@/lib/finance/service";

// GET /api/v1/schools/[code]/finance/payments/[ref]/status
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; ref: string }> }) => {
    try {
      const { ref } = await ctx.params;
      // Who may confirm which reference is decided in the service: the member must be allowed to see the payment's invoice (task 0023).
      const result = await confirmPaymentForRequester(auth.tenant.tenantId, ref, {
        userId: auth.userId,
        roles: [auth.tenant.role],
        permissions: [...auth.tenant.permissions],
        campusId: auth.tenant.campusId,
      });
      return ok(result);
    } catch (err: unknown) {
      return financeFailure(err, "STATUS");
    }
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.PARENT, Role.STUDENT],
  },
);
