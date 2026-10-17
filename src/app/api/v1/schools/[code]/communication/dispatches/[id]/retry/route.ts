import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { retryDispatch } from "@/lib/communication/service";

type Ctx = { params: Promise<{ code: string; id: string }> };

// POST /api/v1/schools/[code]/communication/dispatches/[id]/retry
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    const success = await retryDispatch(auth.tenant.tenantId, id);
    if (!success) {
      return fail("Dispatch not found or not in FAILED status", 400);
    }
    return ok({ retried: true, dispatchId: id });
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
