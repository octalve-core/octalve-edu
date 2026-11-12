import { NotificationDispatchStatus } from "@prisma/client";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";
import { countDueRows, drainDispatchQueue } from "./dispatch-drain";
import type { DispatchHandler } from "./dispatch-lifecycle";

// Sending one school's waiting messages a batch at a time, for the Communication screen (task 0058). The screen asks "send the next batch" until nothing is due, and when it opens it asks how
// many are due, to carry on with a broadcast that was cut off by a closed tab or a lost connection. This is the cron's drain (dispatch-drain.ts: the claim, the back-off, the lease, the audit
// rows, RLS) limited to ONE school and ten rows; the browser names no one, the server picks the rows. Two screens at once are safe: a row is claimed by one call only.

export const BATCH_SIZE = 10;

export interface BatchResult {
  /// Rows this call took and handled.
  claimed: number;
  sent: number;
  /// Dead-lettered this call (the last attempt failed).
  failed: number;
  /// Failed this time and will be tried again after their back-off (the next call of the scheduler, or of a screen, takes them).
  retrying: number;
  /// Messages of this school still due now.
  remaining: number;
  /// The reason of the most recent failure of this call, in words, without the address it was sent to.
  firstError: string | null;
}

const withoutAddress = (reason: string, address: string): string => (address ? reason.split(address).join("the recipient") : reason);

/// `handler` is what sends a message (the default is the real one; tests give a fake).
export async function sendNextBatch(tenantId: string, options: { limit?: number; handler?: DispatchHandler } = {}): Promise<BatchResult> {
  const limit = options.limit ?? BATCH_SIZE;
  const started = new Date();
  const report = await drainDispatchQueue({
    tenantIds: [tenantId],
    maxRows: limit,
    perTenant: limit,
    ...(options.handler ? { handler: options.handler } : {}),
  });
  const remaining = await countDueRows(tenantId);

  let firstError: string | null = null;
  if (report.failed + report.retrying > 0) {
    const row = await forTenant(trustedTenantId(tenantId)).transaction((tx) =>
      tx.notificationDispatch.findFirst({
        where: {
          tenantId,
          status: { in: [NotificationDispatchStatus.RETRYING, NotificationDispatchStatus.FAILED] },
          updatedAt: { gte: started },
          lastError: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        select: { lastError: true, recipientAddress: true },
      }),
    );
    firstError = row?.lastError ? withoutAddress(row.lastError, row.recipientAddress) : null;
  }
  return { claimed: report.claimed, sent: report.sent, failed: report.failed, retrying: report.retrying, remaining, firstError };
}

export { countDueRows };
