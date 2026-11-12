import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { countDueRows } from "@/lib/queue/dispatch-batch";

// GET /api/v1/schools/[code]/communication/queue
// How many messages of the school are due to be sent now (task 0058). The Communication screen asks when it opens, to carry on with a broadcast that was cut off.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    try {
      return ok({ pending: await countDueRows(auth.tenant.tenantId) });
    } catch (err: unknown) {
      console.error("[COMMUNICATION_QUEUE_COUNT_ERROR]", err instanceof Error ? err.message : "unknown error");
      return fail("Unable to read the message queue", 500);
    }
  },
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);
