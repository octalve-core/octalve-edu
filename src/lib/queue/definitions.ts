import { Queue, type QueueOptions, type JobsOptions } from "bullmq";
import { NotificationChannel } from "@prisma/client";
import { getQueueRedisOptions } from "./redis";

export const QUEUE_NAMES = {
  NOTIFICATION_DISPATCH: "notification-dispatch-queue",
  BULK_BROADCAST: "bulk-broadcast-queue",
} as const;

export interface NotificationDispatchJobData {
  dispatchId: string;
  tenantId: string;
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId?: string | null;
  subject?: string | null;
  body: string;
  templateCode?: string;
  metadata?: Record<string, unknown> | null;
}

export interface BulkBroadcastJobData {
  broadcastId: string;
  tenantId: string;
  campusId?: string | null;
  classArmId?: string | null;
  recipientRole?: string | null;
  channel: NotificationChannel;
  templateCode?: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export const DEFAULT_DISPATCH_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
  },
  removeOnFail: {
    count: 5000,
  },
};

let notificationDispatchQueue: Queue<NotificationDispatchJobData> | null = null;
let bulkBroadcastQueue: Queue<BulkBroadcastJobData> | null = null;

export function getNotificationDispatchQueue(options?: Partial<QueueOptions>): Queue<NotificationDispatchJobData> {
  if (!notificationDispatchQueue) {
    notificationDispatchQueue = new Queue<NotificationDispatchJobData>(QUEUE_NAMES.NOTIFICATION_DISPATCH, {
      connection: getQueueRedisOptions(),
      defaultJobOptions: DEFAULT_DISPATCH_JOB_OPTIONS,
      ...options,
    });
  }
  return notificationDispatchQueue;
}

export function getBulkBroadcastQueue(options?: Partial<QueueOptions>): Queue<BulkBroadcastJobData> {
  if (!bulkBroadcastQueue) {
    bulkBroadcastQueue = new Queue<BulkBroadcastJobData>(QUEUE_NAMES.BULK_BROADCAST, {
      connection: getQueueRedisOptions(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
      ...options,
    });
  }
  return bulkBroadcastQueue;
}

export async function closeQueues(): Promise<void> {
  if (notificationDispatchQueue) {
    await notificationDispatchQueue.close();
    notificationDispatchQueue = null;
  }
  if (bulkBroadcastQueue) {
    await bulkBroadcastQueue.close();
    bulkBroadcastQueue = null;
  }
}
