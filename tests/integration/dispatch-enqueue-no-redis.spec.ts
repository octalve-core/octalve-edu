import "../support/env";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { enqueueNotificationDispatch } from "@/lib/queue/dispatch-service";

// Task 0057: queuing a message writes its row and nothing else. It used to push a BullMQ job to Redis as well, and where no Redis is reachable (a Vercel deployment with no REDIS_URL, or a
// Redis that is down) that push throws ("Connection is closed", after ECONNREFUSED) once the rows are already written: the broadcast fails half done. The database row is the queue now, so
// there is nothing to reach. This test points Redis at a port nothing listens on, so the old code throws here (seen on the unfixed code, 98 ms). The deadline below is only a guard against
// a push that waits instead of failing, as it would against a host that drops the packets.

let school: TestTenant;
let previous: string | undefined;

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "No Redis School" });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test("queuing a message returns at once, with the row QUEUED, when no Redis can be reached", async () => {
  test.setTimeout(30_000);
  previous = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://127.0.0.1:1";
  try {
    const started = Date.now();
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("enqueueNotificationDispatch did not return within 8 seconds (it is waiting for Redis)")), 8_000),
    );
    const result = await Promise.race([
      enqueueNotificationDispatch({
        tenantId: school.id,
        channel: NotificationChannel.SMS,
        recipientAddress: "+2348011112222",
        body: "No Redis needed",
      }),
      deadline,
    ]);
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(result.status).toBe(NotificationDispatchStatus.QUEUED);
    expect(result.jobId).toBeUndefined();
    const row = await db.notificationDispatch.findUniqueOrThrow({ where: { id: result.dispatchId } });
    expect([row.status, row.attempts, row.body]).toEqual([NotificationDispatchStatus.QUEUED, 0, "No Redis needed"]);
  } finally {
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  }
});
