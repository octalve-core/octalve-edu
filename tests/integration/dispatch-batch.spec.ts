import "../support/env";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { BATCH_SIZE, countDueRows, sendNextBatch } from "@/lib/queue/dispatch-batch";
import type { DispatchHandler } from "@/lib/queue/dispatch-lifecycle";

// Task 0058: one school's waiting messages a batch at a time, for the Communication screen. The drain itself (claim, back-off, lease) is tested in dispatch-drain.spec.ts; this checks what the
// screen's two calls say: how many are due, and what one batch did, with a fake sender.

let a: TestTenant;
let b: TestTenant;
let counter = 0;
const queue = async (
  school: TestTenant,
  n: number,
  seed: { status?: NotificationDispatchStatus; attempts?: number; updatedAt?: Date; recipient?: string } = {},
) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    counter += 1;
    const row = await db.notificationDispatch.create({
      data: {
        tenantId: school.id,
        channel: NotificationChannel.SMS,
        recipientAddress: seed.recipient ?? `+23480${String(counter).padStart(8, "0")}`,
        body: `Message ${counter}`,
        status: seed.status ?? NotificationDispatchStatus.QUEUED,
        attempts: seed.attempts ?? 0,
        ...(seed.updatedAt ? { updatedAt: seed.updatedAt } : {}),
      },
    });
    ids.push(row.id);
  }
  return ids;
};
const sends: DispatchHandler = async (job) => ({ success: true, externalId: `X-${job.dispatchId}` });
const fails =
  (reason: (to: string) => string): DispatchHandler =>
  async (job) => ({ success: false, error: reason(job.recipientAddress) });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Batch School A" });
  b = await createTenant({ name: "Batch School B" });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.notificationDispatch.deleteMany({ where: { tenantId: { in: [a.id, b.id] } } });
});

test("a batch takes ten, sends them, and says how many are still due", async () => {
  await queue(a, 25);
  expect(await countDueRows(a.id)).toBe(25);
  const res = await sendNextBatch(a.id, { handler: sends });
  expect(res).toMatchObject({ claimed: BATCH_SIZE, sent: BATCH_SIZE, failed: 0, retrying: 0, remaining: 15, firstError: null });
  expect((await sendNextBatch(a.id, { handler: sends })).remaining).toBe(5);
  expect(await sendNextBatch(a.id, { handler: sends })).toMatchObject({ claimed: 5, sent: 5, remaining: 0 });
  expect(await sendNextBatch(a.id, { handler: sends })).toMatchObject({ claimed: 0, remaining: 0 });
  expect(await db.notificationDispatch.count({ where: { tenantId: a.id, status: NotificationDispatchStatus.SENT } })).toBe(25);
});

test("only this school's messages are counted and sent", async () => {
  await queue(a, 2);
  const [theirs] = await queue(b, 3);
  expect(await countDueRows(a.id)).toBe(2);
  expect(await sendNextBatch(a.id, { handler: sends })).toMatchObject({ claimed: 2, remaining: 0 });
  expect((await db.notificationDispatch.findUniqueOrThrow({ where: { id: theirs! } })).status).toBe(NotificationDispatchStatus.QUEUED);
  expect(await countDueRows(b.id)).toBe(3);
});

test("a message that failed and is waiting out its back-off is not due, so the screen is not left waiting for it", async () => {
  await queue(a, 1, { status: NotificationDispatchStatus.RETRYING, attempts: 1, updatedAt: new Date() });
  expect(await countDueRows(a.id)).toBe(0);
  const [old] = await queue(a, 1, {
    status: NotificationDispatchStatus.RETRYING,
    attempts: 1,
    updatedAt: new Date(Date.now() - 5 * 60 * 1000),
  });
  expect(await countDueRows(a.id)).toBe(1);
  expect(await sendNextBatch(a.id, { handler: sends })).toMatchObject({ claimed: 1, sent: 1, remaining: 0 });
  expect((await db.notificationDispatch.findUniqueOrThrow({ where: { id: old! } })).status).toBe(NotificationDispatchStatus.SENT);
});

test("a failure is counted as will-be-tried-again, with a reason that does not quote the address", async () => {
  await queue(a, 1, { recipient: "+2348031234567" });
  await queue(a, 2);
  const res = await sendNextBatch(a.id, { handler: fails((to) => `Provider rejected ${to}`) });
  expect(res).toMatchObject({ claimed: 3, sent: 0, failed: 0, retrying: 3, remaining: 0 });
  expect(res.firstError).toContain("Provider rejected");
  expect(res.firstError).not.toContain("+23480");
  expect(res.firstError).toContain("the recipient");
});
