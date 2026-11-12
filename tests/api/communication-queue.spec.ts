import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { NotificationChannel, NotificationDispatchStatus, Role } from "@prisma/client";
import {
  addMembership,
  createTenant,
  createUser,
  db,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0058: the two routes of the batch sender. `GET .../communication/queue` says how many messages are due; `POST .../communication/queue/next` sends the next batch and says how many are
// left. Who may call them (an administrator or campus administrator of that school), what they answer (counts and a reason, never an address), and that another school's messages are not touched.
// The server under test is production-shaped, so a send there fails closed for want of a provider key (task 0054): the message is RETRYING with the reason.

let a: TestTenant;
let b: TestTenant;
let adminA: TestUser;
let campusAdminA: TestUser;
let teacherA: TestUser;
let adminB: TestUser;
const cookie: Record<string, string> = {};
const cookieFor = async (user: TestUser) => cookieHeader((await loginAs(user, { baseUrl: SAAS_URL })).token!);
const url = (school: TestTenant, path: string) => `/api/v1/schools/${school.code}/communication/queue${path}`;
const queue = async (school: TestTenant, n: number) => {
  for (let i = 0; i < n; i++) {
    await db.notificationDispatch.create({
      data: {
        tenantId: school.id,
        channel: NotificationChannel.SMS,
        recipientAddress: `+23480${String(31234500 + i)}`,
        body: `Queued ${i}`,
        status: NotificationDispatchStatus.QUEUED,
      },
    });
  }
};

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Queue Academy A", campuses: ["Main Campus"] });
  b = await createTenant({ name: "Queue School B" });
  adminA = await createUser();
  campusAdminA = await createUser();
  teacherA = await createUser();
  adminB = await createUser();
  await addMembership(adminA.id, a.id, Role.ADMIN);
  await addMembership(campusAdminA.id, a.id, Role.CAMPUS_ADMIN, a.campuses[0].id);
  await addMembership(teacherA.id, a.id, Role.TEACHING_STAFF);
  await addMembership(adminB.id, b.id, Role.ADMIN);
  cookie.adminA = await cookieFor(adminA);
  cookie.campusAdminA = await cookieFor(campusAdminA);
  cookie.teacherA = await cookieFor(teacherA);
  cookie.adminB = await cookieFor(adminB);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.notificationDispatch.deleteMany({ where: { tenantId: { in: [a.id, b.id] } } });
});

test.describe("who may call them", () => {
  test("an administrator and a campus administrator of the school may; a teacher, an anonymous caller and another school's administrator may not", async () => {
    await queue(a, 3);
    expect((await api(url(a, ""), { baseUrl: SAAS_URL, cookie: cookie.adminA })).json.data).toEqual({ pending: 3 });
    expect((await api(url(a, ""), { baseUrl: SAAS_URL, cookie: cookie.campusAdminA })).json.data).toEqual({ pending: 3 });
    expect((await api(url(a, ""), { baseUrl: SAAS_URL })).status).toBe(401);
    expect((await api(url(a, ""), { baseUrl: SAAS_URL, cookie: cookie.teacherA })).status).toBe(403);
    expect((await api(url(a, ""), { baseUrl: SAAS_URL, cookie: cookie.adminB })).status).toBeGreaterThanOrEqual(403);

    expect((await api(url(a, "/next"), { baseUrl: SAAS_URL, method: "POST" })).status).toBe(401);
    expect((await api(url(a, "/next"), { baseUrl: SAAS_URL, method: "POST", cookie: cookie.teacherA })).status).toBe(403);
    expect((await api(url(a, "/next"), { baseUrl: SAAS_URL, method: "POST", cookie: cookie.adminB })).status).toBeGreaterThanOrEqual(403);
    // nothing was taken by any refused call
    expect(await db.notificationDispatch.count({ where: { tenantId: a.id, status: NotificationDispatchStatus.QUEUED } })).toBe(3);
  });
});

test.describe("what they do", () => {
  test("next sends a batch of ten and says how many are left; with no provider key the messages fail closed, with the reason and without the number", async () => {
    await queue(a, 12);
    const res = await api(url(a, "/next"), { baseUrl: SAAS_URL, method: "POST", cookie: cookie.adminA });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ claimed: 10, sent: 0, failed: 0, retrying: 10, remaining: 2 });
    expect(res.json.data.firstError).toContain("TERMII_API_KEY");
    expect(res.text).not.toContain("+23480");
    // the ten that failed are waiting out their back-off: they are not due, so only the two that were never tried are counted
    expect((await api(url(a, ""), { baseUrl: SAAS_URL, cookie: cookie.adminA })).json.data).toEqual({ pending: 2 });
    expect((await api(url(a, "/next"), { baseUrl: SAAS_URL, method: "POST", cookie: cookie.campusAdminA })).json.data).toMatchObject({
      claimed: 2,
      remaining: 0,
    });
  });

  test("another school's waiting messages are not counted and not sent", async () => {
    await queue(b, 2);
    expect((await api(url(a, ""), { baseUrl: SAAS_URL, cookie: cookie.adminA })).json.data).toEqual({ pending: 0 });
    expect((await api(url(a, "/next"), { baseUrl: SAAS_URL, method: "POST", cookie: cookie.adminA })).json.data).toMatchObject({
      claimed: 0,
      remaining: 0,
    });
    expect(await db.notificationDispatch.count({ where: { tenantId: b.id, status: NotificationDispatchStatus.QUEUED } })).toBe(2);
  });
});
