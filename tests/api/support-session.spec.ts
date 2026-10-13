import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
  DEFAULT_PASSWORD,
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  enableMfa,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader } from "../support/http";
import { createSession } from "@/lib/auth/session";

// The support session over real HTTP (task 0011 slice B, ADR 0017): a platform administrator opens a school they hold a LIVE grant for and from then on sees
// only what the school granted, read-only, until the earlier of the grant's end and one hour; every request is written to the school's log and the platform's;
// a revoke takes effect on the very next request. The grant itself is made through the school's own API, as its administrator.

const SAAS = { baseUrl: SAAS_URL };
let school: TestTenant;
let admin: TestUser;
let platform: TestUser;
let stranger: TestUser; // platform administrator who is NOT in the school, used for "no grant" / "other school"
const cookie: Record<string, string> = {};
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
const base = () => `/api/v1/schools/${school.code}`;
const OPEN = "/api/v1/platform/support/open";
const open = (who = "platform", over: object = {}) =>
  api(OPEN, as(who, { method: "POST", body: { code: school.code, password: DEFAULT_PASSWORD, ...over } }));
const grant = (areas: string[] = ["academics"], hours?: number) =>
  api(`${base()}/support-grants`, {
    ...as("admin"),
    method: "POST",
    body: {
      areas,
      ...(hours ? { hours } : {}),
      reason: "Ticket 77: the calendar looks wrong",
      stepUp: { type: "password", value: DEFAULT_PASSWORD },
    },
  });
const sessionFor = async (user: TestUser) => cookieHeader((await createSession(user.id)).token);
const logs = async (action: string) => ({
  school: await db.auditLog.count({ where: { tenantId: school.id, action } }),
  platform: await db.platformAuditLog.count({ where: { targetTenantId: school.id, action } }),
});

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Support Session School", campuses: ["North"] });
  [admin, platform, stranger] = await Promise.all([
    createUser({ name: "School Admin" }),
    createUser({ name: "Support Person", platformAdmin: true }),
    createUser({ name: "Other Person", platformAdmin: true }),
  ]);
  await addMembership(admin.id, school.id, Role.ADMIN);
  await enableMfa(platform.id);
  await enableMfa(stranger.id);
  for (const [who, user] of Object.entries({ admin, platform, stranger })) cookie[who] = await sessionFor(user);
});
test.beforeEach(async () => {
  await db.supportGrant.updateMany({ where: { tenantId: school.id, revokedAt: null }, data: { revokedAt: new Date() } }); // none left live from a previous test
  await db.session.updateMany({
    where: { userId: { in: [platform.id, stranger.id] } },
    data: { supportTenantId: null, supportOpenedAt: null },
  });
});
test.afterAll(async () => {
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: [platform.id, stranger.id] } } });
  await removeCreatedTenants();
});

test.describe("opening", () => {
  test("with no live grant it is one 404; a wrong password is refused first; a school's own administrator and signed-out callers cannot open", async () => {
    expect((await open()).status).toBe(404);
    await grant();
    const wrong = await open("platform", { password: "not-the-password" });
    expect([wrong.status, wrong.json.error.code]).toEqual([403, "WRONG_PASSWORD"]);
    expect((await api(OPEN, { ...SAAS, method: "POST", body: { code: school.code, password: DEFAULT_PASSWORD } })).status).toBe(401);
    expect((await open("admin")).status).toBe(403);
    expect(await db.session.count({ where: { userId: platform.id, supportTenantId: { not: null } } })).toBe(0);
  });

  test("with a live grant it opens: the reply names the areas and the end (at most an hour), and the opening is written to both logs", async () => {
    const before = await logs("SUPPORT_OPENED");
    expect((await grant(["academics", "people"], 6)).status).toBe(201);
    const res = await open();
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.areas).toEqual(["academics", "people"]);
    const ends = new Date(res.json.data.endsAt).getTime();
    expect(ends).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(ends).toBeLessThanOrEqual(Date.now() + 60 * 60_000 + 5000); // 6 hours granted, but a support view lasts an hour
    const after = await logs("SUPPORT_OPENED");
    expect([after.school - before.school, after.platform - before.platform]).toEqual([1, 1]);
  });

  test("a grant to one school is no way into another, and a person without a live grant stays out", async () => {
    await grant();
    const other = await createTenant({ name: "Not Granted School", campuses: ["Main"] });
    expect((await api(OPEN, as("platform", { method: "POST", body: { code: other.code, password: DEFAULT_PASSWORD } }))).status).toBe(404);
    expect((await open("platform", { code: "no-such-school" })).status).toBe(404);
  });
});

test.describe("inside the view", () => {
  test("read-only, granted areas only: a granted GET works; an area not granted, a write, and a route with no area are all the same 403", async () => {
    await grant(["academics"]);
    expect((await open()).status).toBe(200);
    const read = await api(`${base()}/academics/sessions`, as("platform"));
    expect(read.status, read.text).toBe(200);
    for (const [label, res] of [
      ["people not granted", await api(`${base()}/members`, as("platform"))],
      [
        "a write",
        await api(
          `${base()}/academics/sessions`,
          as("platform", { method: "POST", body: { label: "X", startDate: "2060-09-01", endDate: "2061-07-01" } }),
        ),
      ],
      ["finance (never grantable)", await api(`${base()}/finance/invoices`, as("platform"))],
      ["the school's own support-grants", await api(`${base()}/support-grants`, as("platform"))],
    ] as const) {
      expect([label, res.status, res.json?.error?.code]).toEqual([label, 403, "FORBIDDEN"]);
    }
    expect(await db.academicSession.count({ where: { tenantId: school.id, label: "X" } })).toBe(0);
  });

  test("every request that is allowed is written to the school's log and the platform's", async () => {
    await grant(["academics"]);
    await open();
    const before = await logs("SUPPORT_ACCESS");
    for (let i = 0; i < 3; i++) expect((await api(`${base()}/academics/sessions`, as("platform"))).status).toBe(200);
    const after = await logs("SUPPORT_ACCESS");
    expect([after.school - before.school, after.platform - before.platform]).toEqual([3, 3]);
    const row = await db.auditLog.findFirst({ where: { tenantId: school.id, action: "SUPPORT_ACCESS" }, orderBy: { createdAt: "desc" } });
    expect(row?.actorUserId).toBe(platform.id);
    expect(row?.afterValue).toMatchObject({ method: "GET", area: "academics" });
    expect(JSON.stringify(row?.afterValue)).toContain("/academics/sessions");
  });

  test("before it is opened, the same person cannot read the school at all (a grant alone opens nothing)", async () => {
    await grant(["academics"]);
    expect((await api(`${base()}/academics/sessions`, as("platform"))).status).toBe(403);
  });

  test("a view opened on one sign-in is not there on another sign-in of the same person", async () => {
    await grant(["academics"]);
    await open();
    const elsewhere = await sessionFor(platform);
    expect((await api(`${base()}/academics/sessions`, { ...SAAS, cookie: elsewhere })).status).toBe(403);
  });
});

test.describe("ending", () => {
  test("revoking the grant ends the view on the very next request", async () => {
    const made = await grant(["academics"]);
    await open();
    expect((await api(`${base()}/academics/sessions`, as("platform"))).status).toBe(200);
    expect(
      (await api(`${base()}/support-grants/${made.json.data.grant.id}/revoke`, { ...as("admin"), method: "POST", body: {} })).status,
    ).toBe(200);
    expect((await api(`${base()}/academics/sessions`, as("platform"))).status).toBe(403);
  });

  test("an hour after opening, the view is over even though the grant (6 hours) is not", async () => {
    await grant(["academics"], 6);
    await open();
    await db.session.updateMany({
      where: { userId: platform.id, supportTenantId: school.id },
      data: { supportOpenedAt: new Date(Date.now() - 61 * 60_000) },
    });
    expect((await api(`${base()}/academics/sessions`, as("platform"))).status).toBe(403);
  });

  test("closing ends it, is written to both logs, and is safe to repeat; the sign-in itself stays", async () => {
    await grant(["academics"]);
    await open();
    const before = await logs("SUPPORT_CLOSED");
    const close = () => api("/api/v1/platform/support/close", as("platform", { method: "POST", body: {} }));
    expect((await close()).status).toBe(200);
    expect((await close()).status).toBe(200);
    expect((await api(`${base()}/academics/sessions`, as("platform"))).status).toBe(403);
    const after = await logs("SUPPORT_CLOSED");
    expect([after.school - before.school, after.platform - before.platform]).toEqual([1, 1]);
    expect((await api("/api/v1/auth/me", as("platform"))).status).toBe(200);
  });
});

test.describe("the openable list", () => {
  test("lists the schools with a live grant (name, areas, end) and nothing else; a school administrator is refused", async () => {
    expect((await api("/api/v1/platform/support/grants", as("platform"))).json.data.grants).toEqual([]);
    await grant(["academics", "results"]);
    const res = await api("/api/v1/platform/support/grants", as("platform"));
    expect(res.status).toBe(200);
    expect(res.json.data.grants).toEqual([
      { code: school.code, name: "Support Session School", areas: ["academics", "results"], expiresAt: expect.any(String) },
    ]);
    expect(JSON.stringify(res.json)).not.toContain("Ticket 77");
    expect((await api("/api/v1/platform/support/grants", as("admin"))).status).toBe(403);
    expect((await api("/api/v1/platform/support/grants", as("stranger"))).status).toBe(200); // any platform administrator may use an unaddressed grant
  });
});
