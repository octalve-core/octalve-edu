import "../support/env";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { TEST_CRON_SECRET } from "../support/env";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api } from "../support/http";

// Task 0057, through the real route: a scheduler (Vercel Cron) calls GET /api/v1/cron/dispatch-notifications with `Authorization: Bearer <CRON_SECRET>`, and the queued messages that are due
// are sent. The queue's own behaviour is tested in tests/integration/dispatch-drain.spec.ts, and the secret check in tests/unit/cron-auth.spec.ts (including "no secret configured"; the
// servers under test all hold one). What this checks is the route: that it refuses everyone without the secret, that with it the real dispatcher is wired in and fails CLOSED when no
// sender key is set, and that its answer says how many and nothing about whom.

const PATH = "/api/v1/cron/dispatch-notifications";
const bearer = (secret = TEST_CRON_SECRET) => ({ authorization: `Bearer ${secret}` });
// a valid Nigerian number: the sender checks the number BEFORE it checks for a key, and a bad number would fail for that reason instead
const PHONE = "+2348031234567";
const BODY = "Your child was absent today (a private message body)";

let school: TestTenant;

const queueOne = () =>
  db.notificationDispatch.create({
    data: {
      tenantId: school.id,
      channel: NotificationChannel.SMS,
      recipientAddress: PHONE,
      body: BODY,
      status: NotificationDispatchStatus.QUEUED,
    },
  });

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Cron Route School" });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("who may call it", () => {
  test("no Authorization header is 401 and nothing is sent", async () => {
    const row = await queueOne();
    const res = await api(PATH);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/bearer/i);
    expect((await db.notificationDispatch.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(NotificationDispatchStatus.QUEUED);
  });

  test("a wrong secret, the secret without its scheme, and another scheme are all 401", async () => {
    const row = await queueOne();
    for (const headers of [
      bearer("not-the-secret-0123456789"),
      { authorization: TEST_CRON_SECRET },
      { authorization: `Basic ${TEST_CRON_SECRET}` },
    ]) {
      expect((await api(PATH, { headers })).status).toBe(401);
    }
    expect((await db.notificationDispatch.findUniqueOrThrow({ where: { id: row.id } })).attempts).toBe(0);
  });

  test("it is a GET only", async () => {
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      expect((await api(PATH, { method, headers: bearer() })).status, method).toBe(405);
    }
  });

  test("a signed-in browser has no way round it: no cookie is a credential here", async () => {
    const res = await api(PATH, { cookie: "octalve_session=anything" });
    expect(res.status).toBe(401);
  });
});

test.describe("what it does with the secret", () => {
  test("it runs the queue with the real dispatcher, which fails CLOSED with no sender key: the message is RETRYING with the reason, and the answer is counts only", async () => {
    const row = await queueOne();
    const res = await api(PATH, { headers: bearer() });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = res.json as { ok: boolean; report: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(Number(body.report.claimed)).toBeGreaterThanOrEqual(1);
    expect(Number(body.report.retrying)).toBeGreaterThanOrEqual(1);

    const after = await db.notificationDispatch.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe(NotificationDispatchStatus.RETRYING);
    expect(after.attempts).toBe(1);
    expect(after.sentAt).toBeNull();
    expect(after.lastError).toContain("TERMII_API_KEY");

    // the answer says how many, never to whom, what, or why
    expect(res.text).not.toContain(PHONE);
    expect(res.text).not.toContain("absent today");
    expect(res.text).not.toContain("TERMII");
  });

  test("calling it again straight away does not send the same message again (its back-off has not passed)", async () => {
    const row = await queueOne();
    await api(PATH, { headers: bearer() });
    const once = await db.notificationDispatch.findUniqueOrThrow({ where: { id: row.id } });
    await api(PATH, { headers: bearer() });
    const twice = await db.notificationDispatch.findUniqueOrThrow({ where: { id: row.id } });
    expect([once.attempts, twice.attempts]).toEqual([1, 1]);
  });
});
