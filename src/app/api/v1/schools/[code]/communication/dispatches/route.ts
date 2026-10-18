import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { queryDispatchesSchema } from "@/lib/communication/http";
import { listDispatches } from "@/lib/communication/service";

// GET /api/v1/schools/[code]/communication/dispatches
export const GET = withAuth(
  validate({ query: queryDispatchesSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const result = await listDispatches(auth.tenant.tenantId, query);
    return ok(result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
