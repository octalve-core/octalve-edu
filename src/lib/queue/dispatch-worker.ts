import { Worker, type Job, type WorkerOptions } from "bullmq";
import { NotificationDispatchStatus } from "@prisma/client";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";
import { QUEUE_NAMES, type NotificationDispatchJobData } from "./definitions";
import { getQueueRedisOptions } from "./redis";

export interface DispatchHandlerResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export type DispatchHandler = (jobData: NotificationDispatchJobData) => Promise<DispatchHandlerResult>;

/**
 * Strips stack traces, credentials, and internal details from error messages.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) return "Unknown delivery failure";
  const raw = error instanceof Error ? error.message : String(error);

  // Redact potential API keys or tokens
  const redacted = raw
    .replace(/(key|token|secret|password|auth)[:=]\s*['"]?[a-zA-Z0-9_\-\.]+['"]?/gi, "$1=[REDACTED]")
    .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");

  // Truncate to safe length
  return redacted.length > 500 ? redacted.slice(0, 497) + "..." : redacted;
}

/**
 * Handles database record transitions and audit logs for a dispatch job under tenant RLS.
 */
export async function processDispatchLifecycle(
  jobData: NotificationDispatchJobData,
  handler: DispatchHandler,
  jobAttemptsMade: number,
  maxAttempts: number,
): Promise<DispatchHandlerResult> {
  const { dispatchId, tenantId, channel, recipientAddress } = jobData;
  const verifiedTenant = trustedTenantId(tenantId);

  // 1. Mark as PROCESSING and increment attempts
  await forTenant(verifiedTenant).transaction(async (tx) => {
    await tx.notificationDispatch.updateMany({
      where: { id: dispatchId, tenantId },
      data: {
        status: NotificationDispatchStatus.PROCESSING,
        attempts: jobAttemptsMade + 1,
      },
    });
  });

  try {
    const result = await handler(jobData);

    if (result.success) {
      // 2. Mark as SENT
      await forTenant(verifiedTenant).transaction(async (tx) => {
        await tx.notificationDispatch.updateMany({
          where: { id: dispatchId, tenantId },
          data: {
            status: NotificationDispatchStatus.SENT,
            sentAt: new Date(),
            lastError: null,
          },
        });

        await tx.notificationAuditLog.create({
          data: {
            tenantId,
            dispatchId,
            event: "DISPATCH_SENT",
            channel,
            recipient: recipientAddress,
            details: {
              externalId: result.externalId,
              attempts: jobAttemptsMade + 1,
            },
          },
        });
      });

      return result;
    } else {
      throw new Error(result.error || "Dispatch failed");
    }
  } catch (err) {
    const isFinalAttempt = jobAttemptsMade + 1 >= maxAttempts;
    const sanitized = sanitizeErrorMessage(err);

    await forTenant(verifiedTenant).transaction(async (tx) => {
      if (isFinalAttempt) {
        // Dead-letter: Mark FAILED
        await tx.notificationDispatch.updateMany({
          where: { id: dispatchId, tenantId },
          data: {
            status: NotificationDispatchStatus.FAILED,
            lastError: sanitized,
          },
        });

        await tx.notificationAuditLog.create({
          data: {
            tenantId,
            dispatchId,
            event: "DISPATCH_FAILED",
            channel,
            recipient: recipientAddress,
            details: {
              attempts: jobAttemptsMade + 1,
              error: sanitized,
            },
          },
        });
      } else {
        // Retrying
        await tx.notificationDispatch.updateMany({
          where: { id: dispatchId, tenantId },
          data: {
            status: NotificationDispatchStatus.RETRYING,
            lastError: sanitized,
          },
        });

        await tx.notificationAuditLog.create({
          data: {
            tenantId,
            dispatchId,
            event: "DISPATCH_RETRYING",
            channel,
            recipient: recipientAddress,
            details: {
              attempt: jobAttemptsMade + 1,
              maxAttempts,
              error: sanitized,
            },
          },
        });
      }
    });

    throw new Error(sanitized);
  }
}

/**
 * Creates and starts a BullMQ worker for the notification dispatch queue.
 */
export function createNotificationDispatchWorker(
  handler: DispatchHandler,
  options?: Partial<WorkerOptions>,
): Worker<NotificationDispatchJobData> {
  const worker = new Worker<NotificationDispatchJobData>(
    QUEUE_NAMES.NOTIFICATION_DISPATCH,
    async (job: Job<NotificationDispatchJobData>) => {
      const maxAttempts = job.opts.attempts || 3;
      return processDispatchLifecycle(job.data, handler, job.attemptsMade, maxAttempts);
    },
    {
      connection: getQueueRedisOptions(),
      concurrency: 5,
      ...options,
    },
  );

  return worker;
}
