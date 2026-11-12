import { Worker, type Job, type WorkerOptions } from "bullmq";
import { QUEUE_NAMES, type NotificationDispatchJobData } from "./definitions";
import { getQueueRedisOptions } from "./redis";
import { processDispatchLifecycle } from "./dispatch-lifecycle";
import type { DispatchHandler } from "./dispatch-lifecycle";

// The lifecycle itself moved to ./dispatch-lifecycle (task 0057); it is re-exported from here, where it has always been imported from.
export { processDispatchLifecycle, sanitizeErrorMessage } from "./dispatch-lifecycle";
export type { DispatchHandler, DispatchHandlerResult } from "./dispatch-lifecycle";

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
