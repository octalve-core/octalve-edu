import "../support/env";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { drainDispatchQueue } from "@/lib/queue/dispatch-drain";
import type { DispatchHandler } from "@/lib/queue/dispatch-worker";

// Task 0057 (option A of task 0054): the database row IS the queue, and `drainDispatchQueue` takes the due rows school by school and runs the existing dispatch lifecycle on each. These
// run on the real database with a fake sender, so that what is checked is the queue's behaviour: what is taken, in what order, by whom, how often, and what is left alone. The lifecycle
// itself (the states, the audit rows, the sanitised errors) is tested in communication-queue.spec.ts.

const MIN = 60 * 1000;
let a: TestTenant;
let b: TestTenant;
const both = () => [a.id, b.id];

type Seed = { channel?: NotificationChannel; status?: NotificationDispatchStatus; attempts?: number; updatedAt?: Date; recipient?: string };
let counter = 0;
/// Rows are made one after the other, so that their createdAt order is the order they were made in.
async function queue(school: TestTenant, n: number, seed: Seed = {}): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    counter += 1;
    const row = await db.notificationDispatch.create({
      data: {
        tenantId: school.id,
        channel: seed.channel ?? NotificationChannel.SMS,
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
}
const rowOf = (id: string) => db.notificationDispatch.findUniqueOrThrow({ where: { id } });
const audit = async (id: string) =>
  (await db.notificationAuditLog.findMany({ where: { dispatchId: id }, orderBy: { createdAt: "asc" }, select: { event: true } })).map(
    (e) => e.event,
  );
const sends: DispatchHandler = async (job) => ({ success: true, externalId: `X-${job.dispatchId}` });
const fails =
  (error: string): DispatchHandler =>
  async () => ({ success: false, error });
const drain = (options: Parameters<typeof drainDispatchQueue>[0] = {}) =>
  drainDispatchQueue({ tenantIds: both(), handler: sends, ...options });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Drain School A" });
  b = await createTenant({ name: "Drain School B" });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.notificationDispatch.deleteMany({ where: { tenantId: { in: both() } } });
  await db.tenant.updateMany({ where: { id: { in: both() } }, data: { suspendedAt: null } });
});

test.describe("what a run takes and does", () => {
  test("every due row of every school is sent, with its audit row, and the sender is given the row's own details", async () => {
    const [a1, a2] = await queue(a, 2);
    const [b1] = await queue(b, 1, { channel: NotificationChannel.EMAIL, recipient: "parent@example.test" });
    const seen: Array<{ id: string; tenantId: string; channel: string; to: string; body: string }> = [];
    const handler: DispatchHandler = async (job) => {
      seen.push({ id: job.dispatchId, tenantId: job.tenantId, channel: job.channel, to: job.recipientAddress, body: job.body });
      return { success: true, externalId: "X" };
    };
    const report = await drain({ handler });
    expect(report).toMatchObject({ schools: 2, claimed: 3, sent: 3, retrying: 0, failed: 0, cut: false });
    for (const id of [a1!, a2!, b1!]) {
      const row = await rowOf(id);
      expect(row.status).toBe(NotificationDispatchStatus.SENT);
      expect(row.sentAt).not.toBeNull();
      expect(row.attempts).toBe(1);
      expect(await audit(id)).toEqual(["DISPATCH_SENT"]);
    }
    const forB = seen.find((s) => s.id === b1);
    expect(forB).toMatchObject({ tenantId: b.id, channel: "EMAIL", to: "parent@example.test" });
    expect(seen.find((s) => s.id === a1)?.tenantId).toBe(a.id);
  });

  test("a second run finds nothing to do", async () => {
    await queue(a, 2);
    await drain();
    expect(await drain()).toMatchObject({ claimed: 0, sent: 0 });
  });

  test("a failed send is retried after its back-off, then dead-lettered at the third attempt, and never touched again", async () => {
    const [id] = await queue(a, 1);
    const t0 = Date.now();
    const bad = fails("Termii rejected the request: key=abc123SECRET");

    // attempt 1: fails, becomes RETRYING, and the error that is kept has no credential in it
    expect(await drain({ handler: bad })).toMatchObject({ claimed: 1, sent: 0, retrying: 1, failed: 0 });
    let row = await rowOf(id!);
    expect(row.status).toBe(NotificationDispatchStatus.RETRYING);
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("key=[REDACTED]");
    expect(row.lastError).not.toContain("abc123SECRET");

    // 30 seconds later: not due yet (the back-off is a minute)
    expect(await drain({ handler: bad, now: () => new Date(t0 + 30 * 1000) })).toMatchObject({ claimed: 0 });
    expect((await rowOf(id!)).attempts).toBe(1);

    // well after the minute (90 s of a clock the run is told; the row was written some moments after t0, so 61 s could fall short on a slow machine): attempt 2, still failing
    expect(await drain({ handler: bad, now: () => new Date(t0 + 90 * 1000) })).toMatchObject({ claimed: 1, retrying: 1, failed: 0 });
    row = await rowOf(id!);
    expect([row.status, row.attempts]).toEqual([NotificationDispatchStatus.RETRYING, 2]);

    // the second wait is two minutes, not one: 90 s after the second failure is too soon (the query alone would let it through, since it only knows the first minute)
    const failedAt = row.updatedAt.getTime();
    expect(await drain({ handler: bad, now: () => new Date(failedAt + 90 * 1000) })).toMatchObject({ claimed: 0 });
    expect((await rowOf(id!)).attempts).toBe(2);

    // after the longer wait: the third and last attempt, which dead-letters
    expect(await drain({ handler: bad, now: () => new Date(t0 + 10 * MIN) })).toMatchObject({ claimed: 1, retrying: 0, failed: 1 });
    row = await rowOf(id!);
    expect([row.status, row.attempts]).toEqual([NotificationDispatchStatus.FAILED, 3]);
    expect(await audit(id!)).toEqual(["DISPATCH_RETRYING", "DISPATCH_RETRYING", "DISPATCH_FAILED"]);

    // and a failed message is not taken again, whatever the clock says
    expect(await drain({ handler: sends, now: () => new Date(t0 + 365 * 24 * 60 * MIN) })).toMatchObject({ claimed: 0 });
    expect((await rowOf(id!)).status).toBe(NotificationDispatchStatus.FAILED);
  });

  test("a retry that succeeds is SENT, with the attempts it took", async () => {
    const [id] = await queue(a, 1);
    await drain({ handler: fails("temporary") });
    expect(await drain({ handler: sends, now: () => new Date(Date.now() + 2 * MIN) })).toMatchObject({ sent: 1 });
    const row = await rowOf(id!);
    expect([row.status, row.attempts, row.lastError]).toEqual([NotificationDispatchStatus.SENT, 2, null]);
    expect(await audit(id!)).toEqual(["DISPATCH_RETRYING", "DISPATCH_SENT"]);
  });

  test("a sender that throws is a failed attempt, not a crash of the run, and the next row is still sent", async () => {
    const [first, second] = await queue(a, 2);
    const handler: DispatchHandler = async (job) => {
      if (job.dispatchId === first) throw new Error("socket hang up");
      return { success: true };
    };
    expect(await drain({ handler })).toMatchObject({ claimed: 2, sent: 1, retrying: 1 });
    expect((await rowOf(first!)).status).toBe(NotificationDispatchStatus.RETRYING);
    expect((await rowOf(second!)).status).toBe(NotificationDispatchStatus.SENT);
  });
});

test.describe("rows that another run may hold", () => {
  test("a PROCESSING row is left alone while its run may still be working, and taken back after the lease", async () => {
    const [fresh] = await queue(a, 1, {
      status: NotificationDispatchStatus.PROCESSING,
      attempts: 1,
      updatedAt: new Date(Date.now() - 1 * MIN),
    });
    const [stale] = await queue(a, 1, {
      status: NotificationDispatchStatus.PROCESSING,
      attempts: 1,
      updatedAt: new Date(Date.now() - 11 * MIN),
    });
    expect(await drain()).toMatchObject({ claimed: 1, sent: 1 });
    expect((await rowOf(fresh!)).status).toBe(NotificationDispatchStatus.PROCESSING);
    const taken = await rowOf(stale!);
    expect([taken.status, taken.attempts]).toEqual([NotificationDispatchStatus.SENT, 2]);
  });

  test("a row whose runs keep dying is abandoned as FAILED at the attempts limit, not sent again for ever", async () => {
    let called = 0;
    const handler: DispatchHandler = async () => {
      called += 1;
      return { success: true };
    };
    const [id] = await queue(a, 1, {
      status: NotificationDispatchStatus.PROCESSING,
      attempts: 3,
      updatedAt: new Date(Date.now() - 11 * MIN),
    });
    expect(await drain({ handler })).toMatchObject({ claimed: 1, sent: 0, failed: 1, abandoned: 1 });
    expect(called).toBe(0);
    const row = await rowOf(id!);
    expect(row.status).toBe(NotificationDispatchStatus.FAILED);
    expect(row.lastError).toMatch(/did not finish/i);
    expect(await audit(id!)).toEqual(["DISPATCH_FAILED"]);
  });

  test("two runs at the same time send each row once", async () => {
    const ids = [...(await queue(a, 3)), ...(await queue(b, 3))];
    const calls: string[] = [];
    const slow: DispatchHandler = async (job) => {
      calls.push(job.dispatchId);
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { success: true };
    };
    const [r1, r2] = await Promise.all([drain({ handler: slow }), drain({ handler: slow })]);
    expect(calls).toHaveLength(6);
    expect(new Set(calls)).toEqual(new Set(ids));
    expect(r1.sent + r2.sent).toBe(6);
    expect(r1.claimed + r2.claimed).toBe(6);
  });
});

test.describe("schools", () => {
  test("a suspended school's messages are left alone, and sent once it is not suspended", async () => {
    const [mine] = await queue(a, 1);
    const [theirs] = await queue(b, 1);
    await db.tenant.update({ where: { id: b.id }, data: { suspendedAt: new Date() } });
    expect(await drain()).toMatchObject({ schools: 1, sent: 1 });
    expect((await rowOf(mine!)).status).toBe(NotificationDispatchStatus.SENT);
    expect((await rowOf(theirs!)).status).toBe(NotificationDispatchStatus.QUEUED);
    await db.tenant.update({ where: { id: b.id }, data: { suspendedAt: null } });
    expect(await drain()).toMatchObject({ sent: 1 });
    expect((await rowOf(theirs!)).status).toBe(NotificationDispatchStatus.SENT);
  });

  test("only the schools asked for are visited", async () => {
    await queue(a, 1);
    const [theirs] = await queue(b, 1);
    expect(await drain({ tenantIds: [a.id] })).toMatchObject({ schools: 1, sent: 1 });
    expect((await rowOf(theirs!)).status).toBe(NotificationDispatchStatus.QUEUED);
  });
});

test.describe("what one run will do", () => {
  test("at most maxRows messages, the oldest first, and the run says it was cut", async () => {
    const ids = await queue(a, 5);
    const report = await drain({ tenantIds: [a.id], maxRows: 2 });
    expect(report).toMatchObject({ claimed: 2, sent: 2, cut: true });
    const statuses = await Promise.all(ids.map(async (id) => (await rowOf(id)).status));
    expect(statuses).toEqual([
      NotificationDispatchStatus.SENT,
      NotificationDispatchStatus.SENT,
      NotificationDispatchStatus.QUEUED,
      NotificationDispatchStatus.QUEUED,
      NotificationDispatchStatus.QUEUED,
    ]);
  });

  test("one school cannot take a whole run: each school gets its turn, perTenant rows at a time", async () => {
    await queue(a, 3);
    await queue(b, 3);
    expect(await drain({ perTenant: 1 })).toMatchObject({ schools: 2, claimed: 2, sent: 2 });
    expect(await db.notificationDispatch.count({ where: { tenantId: a.id, status: NotificationDispatchStatus.SENT } })).toBe(1);
    expect(await db.notificationDispatch.count({ where: { tenantId: b.id, status: NotificationDispatchStatus.SENT } })).toBe(1);
  });

  test("no new row is taken once the time budget is spent, and what was not taken stays QUEUED", async () => {
    const ids = await queue(a, 3);
    const report = await drain({ budgetMs: 0 });
    expect(report).toMatchObject({ claimed: 0, sent: 0, cut: true });
    for (const id of ids) expect((await rowOf(id)).status).toBe(NotificationDispatchStatus.QUEUED);
  });

  test("an empty queue is a quick, quiet run", async () => {
    expect(await drain()).toMatchObject({ claimed: 0, sent: 0, retrying: 0, failed: 0, abandoned: 0, errors: 0, cut: false });
  });
});
