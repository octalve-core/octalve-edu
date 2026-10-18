import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { createBroadcastSchema } from "@/lib/communication/http";
import { createBroadcast } from "@/lib/communication/service";

// POST /api/v1/schools/[code]/communication/broadcast
export const POST = withAuth(
  validate({ body: createBroadcastSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    try {
      const result = await createBroadcast(auth.tenant.tenantId, auth.userId, body);
      return ok(result, {}, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Broadcast failed";
      return fail(message, 400);
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
