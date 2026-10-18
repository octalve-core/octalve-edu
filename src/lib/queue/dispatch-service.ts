import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";
import { getNotificationDispatchQueue, type NotificationDispatchJobData } from "./definitions";

export interface EnqueueDispatchParams {
  tenantId: string;
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId?: string | null;
  templateId?: string | null;
  templateCode?: string;
  subject?: string | null;
  body: string;
  metadata?: Record<string, unknown> | null;
  priority?: number; // 1 = High, 5 = Normal, 10 = Low
}

export interface EnqueueDispatchResult {
  dispatchId: string;
  jobId?: string;
  status: NotificationDispatchStatus;
}

/**
 * Persists a NotificationDispatch row in QUEUED status and pushes a job to BullMQ.
 * Uses forTenant to respect multi-tenant RLS.
 */
export async function enqueueNotificationDispatch(params: EnqueueDispatchParams): Promise<EnqueueDispatchResult> {
  const { tenantId, channel, recipientAddress, recipientUserId, templateId, templateCode, subject, body, metadata, priority } = params;

  const verifiedTenant = trustedTenantId(tenantId);

  // 1. Create database dispatch row under tenant context
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

  // 2. Prepare queue job payload
  const jobData: NotificationDispatchJobData = {
    dispatchId: dispatch.id,
    tenantId,
    channel,
    recipientAddress,
    recipientUserId,
    subject,
    body,
    templateCode,
    metadata,
  };

  // 3. Push to BullMQ queue
  const queue = getNotificationDispatchQueue();
  const job = await queue.add(`dispatch:${channel}:${dispatch.id}`, jobData, {
    priority: priority || (channel === NotificationChannel.SMS ? 1 : 5),
  });

  return {
    dispatchId: dispatch.id,
    jobId: job.id,
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
