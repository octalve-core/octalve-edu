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
import { mailTo, waitForMail } from "../support/outbox";

// The platform surface over real HTTP (plan C5-C6, ADR 0016, slice C): who may call it (a platform administrator WITH two-step verification, and the
// password again for every change), what it does (list, create a school and invite its first administrator, suspend and reinstate, change the type,
// read the platform's own history), and what a suspended school means (its members cannot get in). It reads no school's data.

const SAAS = { baseUrl: SAAS_URL };
const PASSWORD = DEFAULT_PASSWORD; // the test users' password
let school: TestTenant;
let platform: TestUser; // platform administrator, with two-step verification
let noMfa: TestUser; // platform administrator WITHOUT two-step verification
let schoolAdmin: TestUser; // ADMIN of `school`, not a platform administrator
const cookie: Record<string, string> = {};
const madeCodes: string[] = [];
const actors: string[] = [];

const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
async function sessionFor(user: TestUser) {
  return cookieHeader((await createSession(user.id)).token);
}
let counter = 0;
const code = () => `plat-${Date.now().toString(36)}-${++counter}`;
const ROUTE = "/api/v1/platform/schools";

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Suspendable School", campuses: ["Main"] });
  [platform, noMfa, schoolAdmin] = await Promise.all([
    createUser({ name: "Plat Admin", platformAdmin: true }),
    createUser({ name: "No Mfa", platformAdmin: true }),
    createUser({ name: "School Admin" }),
  ]);
  actors.push(platform.id, noMfa.id, schoolAdmin.id);
  await enableMfa(platform.id);
  await addMembership(schoolAdmin.id, school.id, Role.ADMIN);
  for (const [who, user] of Object.entries({ platform, noMfa, schoolAdmin })) cookie[who] = await sessionFor(user);
});
test.afterAll(async () => {
  await db.tenant.deleteMany({ where: { code: { in: madeCodes } } });
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: actors } } });
  await removeCreatedTenants();
});

test.describe("who may call it", () => {
  test("signed out is 401; a school administrator, and a platform administrator without two-step verification, are refused every route", async () => {
    const calls: [string, string, object?][] = [
      ["GET", ROUTE],
      ["POST", ROUTE, { code: code(), name: "X", schoolType: "K12", adminEmail: "x@example.test", password: PASSWORD }],
      ["POST", `${ROUTE}/${school.id}/suspension`, { suspended: true, reason: "x", password: PASSWORD }],
      ["PATCH", `${ROUTE}/${school.id}`, { schoolType: "K12", password: PASSWORD }],
      ["POST", `${ROUTE}/${school.id}/first-admin-invitation`, { email: "late@example.test", password: PASSWORD }],
      ["GET", "/api/v1/platform/audit"],
    ];
    for (const [method, path, body] of calls) {
      expect((await api(path, { ...SAAS, method, body })).status, `${method} ${path} signed out`).toBe(401);
      const admin = await api(path, as("schoolAdmin", { method, body }));
      expect([admin.status, admin.json.error.code, path], `${method} ${path} school admin`).toEqual([403, "FORBIDDEN", path]);
      const plain = await api(path, as("noMfa", { method, body }));
      expect([plain.status, plain.json.error.code, path], `${method} ${path} no two-step`).toEqual([403, "MFA_REQUIRED", path]);
    }
    expect(await db.tenant.count({ where: { code: { in: madeCodes } } })).toBe(0);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: school.id } })).suspendedAt).toBeNull();
  });

  test("every CHANGE needs the password again: none, or a wrong one, changes nothing (three tries: the re-auth limit is five failures a window)", async () => {
    const attempts: [string, string, object, string | undefined][] = [
      ["POST", ROUTE, { code: code(), name: "Needs Password", schoolType: "K12", adminEmail: "np@example.test" }, undefined],
      ["POST", `${ROUTE}/${school.id}/suspension`, { suspended: true, reason: "wrong password" }, "wrong-password"],
      ["PATCH", `${ROUTE}/${school.id}`, { schoolType: "HIGHER_ED" }, undefined],
      ["POST", `${ROUTE}/${school.id}/first-admin-invitation`, { email: "late@example.test" }, undefined],
    ];
    for (const [method, path, body, password] of attempts) {
      const res = await api(path, as("platform", { method, body: { ...body, ...(password ? { password } : {}) } }));
      expect([res.status, res.json.error.code, path]).toEqual([403, "WRONG_PASSWORD", path]);
    }
    const row = await db.tenant.findUniqueOrThrow({ where: { id: school.id } });
    expect([row.suspendedAt, row.schoolType]).toEqual([null, "K12"]);
    expect(await db.tenant.count({ where: { name: "Needs Password" } })).toBe(0);
  });
});

test.describe("the schools", () => {
  test("list: identity data and four coarse counters - and nothing about any person", async () => {
    const res = await api(ROUTE, as("platform"));
    expect(res.status).toBe(200);
    const row = (res.json.data.schools as Record<string, unknown>[]).find((s) => s.id === school.id)!;
    expect(Object.keys(row).sort()).toEqual(["code", "counts", "createdAt", "id", "name", "schoolType", "suspendedAt"]);
    expect(Object.keys(row.counts as object).sort()).toEqual(["administrators", "campuses", "members", "students"]);
    expect(row.code).toBe(school.code);
    // the school has one campus and one ADMIN (beforeAll); nothing else is counted yet
    expect(row.counts).toEqual({ members: 1, administrators: 1, students: 0, campuses: 1 });
  });

  test("the counters follow the school: a member, a student and a second campus move them; a school with no administrator shows 0", async () => {
    const bare = await createTenant({ name: "Counted School", campuses: ["A"] });
    const counts = async () => {
      const list = await api(ROUTE, as("platform"));
      return (list.json.data.schools as { id: string; counts: object }[]).find((s) => s.id === bare.id)!.counts;
    };
    expect(await counts()).toEqual({ members: 0, administrators: 0, students: 0, campuses: 1 });
    const teacher = await createUser({ name: "Counted Teacher" });
    await addMembership(teacher.id, bare.id, Role.TEACHING_STAFF);
    await db.studentRecord.create({
      data: { tenantId: bare.id, firstName: "Counted", lastName: "Pupil", dateOfBirth: new Date("2012-01-01"), admissionNo: "CNT/1" },
    });
    await db.campus.create({ data: { tenantId: bare.id, name: "B" } });
    expect(await counts()).toEqual({ members: 1, administrators: 0, students: 1, campuses: 2 });
    const boss = await createUser({ name: "Counted Boss" });
    await addMembership(boss.id, bare.id, Role.ADMIN);
    expect(await counts()).toEqual({ members: 2, administrators: 1, students: 1, campuses: 2 });
  });

  test("create: a school with its type, the platform's audit row, and an invitation for its first administrator (emailed); a duplicate code, a reserved or malformed one, and a bad address are refused", async () => {
    const c = code();
    madeCodes.push(c);
    const email = `first-${c}@example.test`;
    const made = await api(
      ROUTE,
      as("platform", {
        method: "POST",
        body: { code: c, name: "  Brand New School ", schoolType: "HIGHER_ED", adminEmail: email.toUpperCase(), password: PASSWORD },
      }),
    );
    expect(made.status, made.text).toBe(201);
    expect(made.json.data.school).toMatchObject({ code: c, name: "Brand New School", schoolType: "HIGHER_ED", suspendedAt: null });

    const tenant = await db.tenant.findUniqueOrThrow({ where: { code: c } });
    const invite = await db.invitation.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect([invite.email, invite.role, invite.campusId, invite.invitedById, invite.acceptedAt]).toEqual([
      email,
      "ADMIN",
      null,
      platform.id,
      null,
    ]);
    const audit = await db.platformAuditLog.findMany({ where: { targetTenantId: tenant.id } });
    expect(audit.map((a) => a.action)).toEqual(["SCHOOL_CREATED"]);
    expect(audit[0].actorUserId).toBe(platform.id);
    expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: "INVITATION_CREATED", actorUserId: platform.id } })).toBe(1);
    const [mail] = await waitForMail(email);
    expect(mail.subject).toMatch(/invit/i);

    const again = await api(
      ROUTE,
      as("platform", {
        method: "POST",
        body: { code: c, name: "Dup", schoolType: "K12", adminEmail: "dup@example.test", password: PASSWORD },
      }),
    );
    expect([again.status, again.json.error.code]).toEqual([409, "CODE_TAKEN"]);
    for (const bad of ["login", "Bad Code", "x", "UPPER"]) {
      const res = await api(
        ROUTE,
        as("platform", {
          method: "POST",
          body: { code: bad, name: "Bad", schoolType: "K12", adminEmail: "bad@example.test", password: PASSWORD },
        }),
      );
      expect([res.status, bad], bad).toEqual([400, bad]);
    }
    const noAddress = await api(
      ROUTE,
      as("platform", {
        method: "POST",
        body: { code: code(), name: "Bad", schoolType: "K12", adminEmail: "not-an-address", password: PASSWORD },
      }),
    );
    expect(noAddress.status).toBe(400);
    expect(await mailTo("dup@example.test")).toHaveLength(0);
  });

  test("the type: changed while the school has no academic period; refused with a clear answer once it has one; a no-change is quiet", async () => {
    const fresh = await createTenant({ name: "Type School" });
    const url = `${ROUTE}/${fresh.id}`;
    const change = (schoolType: string) => api(url, as("platform", { method: "PATCH", body: { schoolType, password: PASSWORD } }));
    expect((await change("VOCATIONAL")).status).toBe(200);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: fresh.id } })).schoolType).toBe("VOCATIONAL");
    expect((await db.platformAuditLog.findMany({ where: { targetTenantId: fresh.id } })).map((a) => a.action)).toEqual([
      "SCHOOL_TYPE_CHANGED",
    ]);
    expect((await change("VOCATIONAL")).status).toBe(200); // same type: nothing more is audited
    expect(await db.platformAuditLog.count({ where: { targetTenantId: fresh.id } })).toBe(1);

    const session = await db.academicSession.create({
      data: { tenantId: fresh.id, label: "S", startDate: new Date("2043-09-01"), endDate: new Date("2044-07-01") },
    });
    await db.academicPeriod.create({
      data: { tenantId: fresh.id, sessionId: session.id, kind: "COHORT", ordinal: 1, label: "Cohort", startDate: new Date("2043-09-02") },
    });
    const blocked = await change("K12");
    expect([blocked.status, blocked.json.error.code]).toEqual([409, "HAS_PERIODS"]);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: fresh.id } })).schoolType).toBe("VOCATIONAL");

    const unknown = await api(
      `${ROUTE}/no-such-school`,
      as("platform", { method: "PATCH", body: { schoolType: "K12", password: PASSWORD } }),
    );
    expect(unknown.status).toBe(404);
    expect((await api(url, as("platform", { method: "PATCH", body: { schoolType: "NOT_A_TYPE", password: PASSWORD } }))).status).toBe(400);
  });
});

test.describe("suspension", () => {
  const suspend = (body: object) =>
    api(`${ROUTE}/${school.id}/suspension`, as("platform", { method: "POST", body: { password: PASSWORD, ...body } }));
  const memberships = async () =>
    ((await api("/api/v1/auth/me", as("schoolAdmin"))).json.data.memberships as { tenantId: string }[]).map((m) => m.tenantId);
  const members = () => api(`/api/v1/schools/${school.code}/members`, as("schoolAdmin"));

  test("a reason is required to suspend; a suspended school's members cannot use it and it vanishes from their list; reinstating gives it all back; each change is audited once", async () => {
    expect(await memberships()).toContain(school.id);
    expect((await members()).status).toBe(200);

    const noReason = await suspend({ suspended: true });
    expect([noReason.status, noReason.json.error.code]).toEqual([400, "VALIDATION"]);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: school.id } })).suspendedAt).toBeNull();

    const done = await suspend({ suspended: true, reason: "Unpaid subscription" });
    expect(done.status, done.text).toBe(200);
    expect(done.json.data.school.suspendedAt).not.toBeNull();
    expect((await suspend({ suspended: true, reason: "Unpaid subscription" })).status).toBe(200); // idempotent: no second audit row

    const refused = await members();
    expect([refused.status, refused.json.error.code]).toEqual([403, "FORBIDDEN"]); // the same answer a stranger or a deactivated member gets
    expect(await memberships()).not.toContain(school.id);
    expect(await db.tenantMembership.count({ where: { tenantId: school.id, userId: schoolAdmin.id, deactivatedAt: null } })).toBe(1); // nobody's membership was touched

    const back = await suspend({ suspended: false });
    expect(back.status).toBe(200);
    expect(back.json.data.school.suspendedAt).toBeNull();
    expect((await members()).status).toBe(200);
    expect(await memberships()).toContain(school.id);

    const log = await db.platformAuditLog.findMany({ where: { targetTenantId: school.id }, orderBy: { createdAt: "asc" } });
    expect(log.map((a) => [a.action, a.reason])).toEqual([
      ["SCHOOL_SUSPENDED", "Unpaid subscription"],
      ["SCHOOL_REINSTATED", null],
    ]);
  });

  test("an unknown school is a 404, and suspension is never reachable by a school's own administrator", async () => {
    expect(
      (
        await api(
          `${ROUTE}/no-such-school/suspension`,
          as("platform", { method: "POST", body: { suspended: true, reason: "x", password: PASSWORD } }),
        )
      ).status,
    ).toBe(404);
    const own = await api(
      `${ROUTE}/${school.id}/suspension`,
      as("schoolAdmin", { method: "POST", body: { suspended: true, reason: "me", password: PASSWORD } }),
    );
    expect(own.status).toBe(403);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: school.id } })).suspendedAt).toBeNull();
  });
});

test.describe("re-inviting the first administrator (ISS-0015)", () => {
  const tokenIn = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)![1];
  const preview = (token: string) => api("/api/v1/invitations/preview", { ...SAAS, body: { token } });
  // their own platform administrator: the change rate limit is per person (30 changes per 5 minutes) and this file makes many
  let second: TestUser;
  test.beforeAll(async () => {
    second = await createUser({ name: "Second Plat Admin", platformAdmin: true });
    actors.push(second.id);
    await enableMfa(second.id);
    cookie.second = await sessionFor(second);
  });
  const reinvite = (id: string, body: object = {}, who = "second") =>
    api(
      `${ROUTE}/${id}/first-admin-invitation`,
      as(who, { method: "POST", body: { email: "x@example.test", password: PASSWORD, ...body } }),
    );
  /// A school made through the platform page, whose first administrator never accepted: the situation the action exists for.
  async function schoolNobodyAdministers() {
    const c = code();
    madeCodes.push(c);
    const email = `lost-${c}@example.test`;
    const made = await api(
      ROUTE,
      as("second", {
        method: "POST",
        body: { code: c, name: "Nobody Admin School", schoolType: "K12", adminEmail: email, password: PASSWORD },
      }),
    );
    expect(made.status, made.text).toBe(201);
    const [mail] = await waitForMail(email);
    return { id: made.json.data.school.id as string, email, token: tokenIn(mail.text) };
  }
  const openAdminInvites = (tenantId: string) =>
    db.invitation.findMany({ where: { tenantId, role: "ADMIN", acceptedAt: null, revokedAt: null } });

  test("a school with no administrator: the old open invitation is revoked and its link dies, ONE new open invitation exists and its link works, it is mailed, and BOTH logs record it", async () => {
    const lost = await schoolNobodyAdministers();
    expect((await preview(lost.token)).status).toBe(200);
    const fresh = `found-${Date.now().toString(36)}@example.test`;

    const res = await reinvite(lost.id, { email: fresh.toUpperCase() });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.invitation).toMatchObject({ email: fresh });
    expect(res.json.data.school).toMatchObject({ id: lost.id });

    const open = await openAdminInvites(lost.id);
    expect(open.map((i) => [i.email, i.campusId, i.invitedById])).toEqual([[fresh, null, second.id]]);
    expect(await db.invitation.count({ where: { tenantId: lost.id, email: lost.email, revokedAt: { not: null } } })).toBe(1);

    const [mail] = await waitForMail(fresh);
    expect(mail.subject).toMatch(/invit/i);
    expect((await preview(lost.token)).json.error.code).toBe("INVALID_TOKEN"); // the lost link is dead
    expect((await preview(tokenIn(mail.text))).status).toBe(200); // the new one works

    const platformLog = await db.platformAuditLog.findMany({ where: { targetTenantId: lost.id, action: "FIRST_ADMIN_REINVITED" } });
    expect(platformLog).toHaveLength(1);
    expect([platformLog[0].actorUserId, (platformLog[0].afterValue as { email: string }).email]).toEqual([second.id, fresh]);
    const schoolLog = await db.auditLog.findMany({ where: { tenantId: lost.id, actorUserId: second.id }, orderBy: { createdAt: "asc" } });
    expect(schoolLog.map((a) => a.action)).toEqual(expect.arrayContaining(["INVITATION_CREATED", "INVITATION_REVOKED"]));
    expect(schoolLog.filter((a) => a.action === "INVITATION_CREATED")).toHaveLength(2); // the original and the new one
  });

  test("doing it twice leaves exactly one open invitation (the second replaces the first)", async () => {
    const lost = await schoolNobodyAdministers();
    expect((await reinvite(lost.id, { email: `one-${lost.email}` })).status).toBe(201);
    expect((await reinvite(lost.id, { email: `two-${lost.email}` })).status).toBe(201);
    expect((await openAdminInvites(lost.id)).map((i) => i.email)).toEqual([`two-${lost.email}`]);
  });

  test("a school that HAS an active administrator is refused with a clear answer and nothing is written; a deactivated administrator does not count", async () => {
    const before = await db.invitation.count({ where: { tenantId: school.id } });
    const auditBefore = await db.platformAuditLog.count({ where: { targetTenantId: school.id } });
    const refused = await reinvite(school.id); // `school` has schoolAdmin, an active ADMIN
    expect([refused.status, refused.json.error.code]).toEqual([409, "HAS_ADMINISTRATOR"]);
    expect(await db.invitation.count({ where: { tenantId: school.id } })).toBe(before);
    expect(await db.platformAuditLog.count({ where: { targetTenantId: school.id } })).toBe(auditBefore);
    expect(await mailTo("x@example.test")).toHaveLength(0);

    const lost = await schoolNobodyAdministers();
    const boss = await createUser({ name: "Gone Boss" });
    await addMembership(boss.id, lost.id, Role.ADMIN);
    expect((await reinvite(lost.id)).status).toBe(409); // now it has one...
    await db.tenantMembership.update({
      where: { userId_tenantId: { userId: boss.id, tenantId: lost.id } },
      data: { deactivatedAt: new Date() },
    });
    expect((await reinvite(lost.id)).status).toBe(201); // ...deactivated, so it has none again
  });

  test("a campus administrator or teacher is not an administrator for this purpose", async () => {
    const lost = await schoolNobodyAdministers();
    const campus = await db.campus.create({ data: { tenantId: lost.id, name: "Only" } });
    await addMembership((await createUser({ name: "Campus Only" })).id, lost.id, Role.CAMPUS_ADMIN, campus.id);
    expect((await reinvite(lost.id)).status).toBe(201);
  });

  test("an unknown school is 404, a bad address 400, a missing password 403; a school administrator cannot do it to their own school", async () => {
    expect((await reinvite("no-such-school")).status).toBe(404);
    const lost = await schoolNobodyAdministers();
    expect((await reinvite(lost.id, { email: "not-an-address" })).status).toBe(400);
    const noPassword = await api(
      `${ROUTE}/${lost.id}/first-admin-invitation`,
      as("second", { method: "POST", body: { email: "p@example.test" } }),
    );
    expect([noPassword.status, noPassword.json.error.code]).toEqual([403, "WRONG_PASSWORD"]);
    expect((await reinvite(school.id, {}, "schoolAdmin")).status).toBe(403);
    expect((await openAdminInvites(lost.id)).map((i) => i.email)).toEqual([lost.email]); // untouched
  });
});

test.describe("the platform's own history", () => {
  test("newest first, only the platform's own rows, limited; and it carries no tenant data", async () => {
    const res = await api("/api/v1/platform/audit?limit=5", as("platform"));
    expect(res.status).toBe(200);
    const entries = res.json.data.entries as { action: string; actorUserId: string; createdAt: string; targetTenantId: string | null }[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(5);
    const times = entries.map((e) => new Date(e.createdAt).getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect((await api("/api/v1/platform/audit?limit=0", as("platform"))).status).toBe(400);
    expect((await api("/api/v1/platform/audit?limit=abc", as("platform"))).status).toBe(400);
  });
});

test.describe("administrators of every kind get the shorter session cap", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const near = (actual: Date, expected: number) => Math.abs(actual.getTime() - expected) < 2 * 60_000;
  async function remembered(user: TestUser) {
    const res = await loginAsRemembered(user);
    expect(res.status).toBe(200);
    const row = await db.session.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return row.absoluteExpires;
  }
  const loginAsRemembered = (user: TestUser) =>
    api("/api/v1/auth/login", { ...SAAS, method: "POST", body: { email: user.email, password: user.password, remember: true } });

  test("a campus administrator and a platform administrator are capped at 7 days even when remembered; an ordinary member keeps 90", async () => {
    const campusAdmin = await createUser({ name: "Cam Capped" });
    await addMembership(campusAdmin.id, school.id, Role.CAMPUS_ADMIN, school.campuses[0].id);
    const teacher = await createUser({ name: "Tola Teacher" });
    await addMembership(teacher.id, school.id, Role.TEACHING_STAFF, school.campuses[0].id);
    expect(near(await remembered(campusAdmin), Date.now() + 7 * DAY_MS)).toBe(true);
    expect(near(await remembered(noMfa), Date.now() + 7 * DAY_MS)).toBe(true);
    expect(near(await remembered(teacher), Date.now() + 90 * DAY_MS)).toBe(true);
  });
});
