import Redis, { type RedisOptions as IoredisOptions } from "ioredis";
import { type ConnectionOptions } from "bullmq";

/**
 * Returns connection options for BullMQ queues and workers.
 * BullMQ requires maxRetriesPerRequest: null when passing an ioredis instance or options.
 */
export function getQueueRedisOptions(customUrl?: string): ConnectionOptions {
  const url = customUrl || process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const parsed = new URL(url);

  return {
    host: parsed.hostname || "127.0.0.1",
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname && parsed.pathname.length > 1 ? parseInt(parsed.pathname.slice(1), 10) : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

let sharedRedisClient: Redis | null = null;

/**
 * Creates or reuses a shared Redis client configured for BullMQ.
 */
export function getQueueRedisClient(customUrl?: string): Redis {
  if (sharedRedisClient && !customUrl) {
    return sharedRedisClient;
  }

  const options = getQueueRedisOptions(customUrl);
  const client = new Redis(options as unknown as IoredisOptions);
  client.on("error", (err) => {
    // Prevent unhandled error event crashes
    if (process.env.NODE_ENV !== "test") {
      console.error("[Queue Redis Error]:", err?.message || err);
    }
  });

  if (!customUrl) {
    sharedRedisClient = client;
  }

  return client;
}

/**
 * Closes shared Redis client (useful in test teardown).
 */
export async function closeQueueRedisClient(): Promise<void> {
  if (sharedRedisClient) {
    await sharedRedisClient.quit().catch(() => sharedRedisClient?.disconnect());
    sharedRedisClient = null;
  }
}
