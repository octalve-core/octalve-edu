import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { sendNextBatch } from "@/lib/queue/dispatch-batch";

// POST /api/v1/schools/[code]/communication/queue/next
// Sends the next batch (up to 10) of the school's due messages and says how many are left (task 0058). The server picks the rows; the answer is counts and the reason of the latest failure,
// never an address or a message. Safe from two screens at once: a row is claimed by one call only (dispatch-drain.ts).
export const POST = withAuth(
  async (_req, auth: TenantAuthContext) => {
    try {
      return ok(await sendNextBatch(auth.tenant.tenantId));
    } catch (err: unknown) {
      console.error("[COMMUNICATION_QUEUE_NEXT_ERROR]", err instanceof Error ? err.message : "unknown error");
      return fail("Unable to send the next messages", 500);
    }
  },
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);
