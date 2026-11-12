import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";

export interface EnqueueDispatchParams {
  tenantId: string;
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId?: string | null;
  templateId?: string | null;
  /// Not stored and not used by the cron drain (the row carries the rendered subject and body); kept so that callers and a future queue worker (option B of task 0054) need not change.
  templateCode?: string;
  subject?: string | null;
  body: string;
  metadata?: Record<string, unknown> | null;
  /// Not used: rows are taken oldest first. Kept for the same reason as `templateCode`.
  priority?: number; // 1 = High, 5 = Normal, 10 = Low
}

export interface EnqueueDispatchResult {
  dispatchId: string;
  /// Always undefined now: there is no queue job, the row is the queue (task 0057). Kept so that callers need not change.
  jobId?: string;
  status: NotificationDispatchStatus;
}

/**
 * Persists a NotificationDispatch row in QUEUED status, and nothing else: the row IS the queue (task 0057). A scheduler calls GET /api/v1/cron/dispatch-notifications, which takes the due rows and
 * sends them (lib/queue/dispatch-drain.ts). It used to push a BullMQ job to Redis as well; nothing took that job off, and where no Redis was reachable the push threw AFTER the row was written, so a
 * broadcast failed half-way with some messages queued. The BullMQ definitions and the worker stay in the tree for option B (a worker host); this function does not use them.
 * Uses forTenant to respect multi-tenant RLS.
 */
export async function enqueueNotificationDispatch(params: EnqueueDispatchParams): Promise<EnqueueDispatchResult> {
  const { tenantId, channel, recipientAddress, recipientUserId, templateId, subject, body, metadata } = params;

  const verifiedTenant = trustedTenantId(tenantId);

  // Create the dispatch row under tenant context
  const dispatch = await forTenant(verifiedTenant).transaction(async (tx) => {
    return tx.notificationDispatch.create({
      data: {
        tenantId,
        channel,
        recipientAddress,
        recipientUserId: recipientUserId || null,
        templateId: templateId || null,
        subject: subject || null,
        body,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        status: NotificationDispatchStatus.QUEUED,
      },
    });
  });

  return {
    dispatchId: dispatch.id,
    status: dispatch.status,
  };
}

/**
 * Batch enqueues multiple dispatches for campaign or group notifications.
 */
export async function enqueueBulkNotificationDispatches(dispatches: EnqueueDispatchParams[]): Promise<EnqueueDispatchResult[]> {
  const results: EnqueueDispatchResult[] = [];
  for (const item of dispatches) {
    const res = await enqueueNotificationDispatch(item);
    results.push(res);
  }
  return results;
}
