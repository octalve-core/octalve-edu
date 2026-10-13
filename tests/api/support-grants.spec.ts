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
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A school's support grants over real HTTP (task 0011 slice A, ADR 0017): only a school ADMIN creates (with step-up) and revokes; areas, duration and reason
// are validated; each is audited in the school's own log; nobody else - campus administrator, teacher, parent, a platform administrator - may touch them.

const SAAS = { baseUrl: SAAS_URL };
let school: TestTenant;
const users: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
const route = () => `/api/v1/schools/${school.code}/support-grants`;
const stepUp = { type: "password", value: DEFAULT_PASSWORD };
const create = (who: string, body: object = {}) =>
  api(route(), as(who, { method: "POST", body: { areas: ["people"], reason: "Ticket 4821: the timetable looks wrong", stepUp, ...body } }));

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Support Grant School", campuses: ["North"] });
  const make = async (key: string, role: Role | null, campus = false) => {
    users[key] = await createUser({ name: key });
    if (role) await addMembership(users[key].id, school.id, role, campus ? school.campuses[0].id : null);
  };
  await make("admin", Role.ADMIN);
  await make("campusAdmin", Role.CAMPUS_ADMIN, true);
  await make("teacher", Role.TEACHING_STAFF, true);
  await make("parent", Role.PARENT);
  users.platform = await createUser({ name: "platform", platformAdmin: true });
  for (const [key, user] of Object.entries(users)) {
    const res = await loginAs(user, SAAS);
    expect(res.status, key).toBe(200);
    cookie[key] = cookieHeader(res.token!);
  }
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("who may use them", () => {
  test("signed out is 401; only a school administrator may list, create or revoke - a campus administrator, a teacher, a parent and a platform administrator get 403", async () => {
    expect((await api(route(), { ...SAAS })).status).toBe(401);
    const made = await create("admin");
    expect(made.status, made.text).toBe(201);
    const id = made.json.data.grant.id as string;
    for (const who of ["campusAdmin", "teacher", "parent", "platform"]) {
      expect((await api(route(), as(who))).status, `${who} list`).toBe(403);
      expect((await create(who)).status, `${who} create`).toBe(403);
      expect((await api(`${route()}/${id}/revoke`, as(who, { method: "POST", body: {} }))).status, `${who} revoke`).toBe(403);
    }
    expect(await db.supportGrant.count({ where: { tenantId: school.id, revokedAt: { not: null } } })).toBe(0);
  });

  test("creating needs the step-up proof: none or a wrong password changes nothing", async () => {
    const before = await db.supportGrant.count({ where: { tenantId: school.id } });
    const wrong = await create("admin", { stepUp: { type: "password", value: "not-the-password" } });
    expect([wrong.status, wrong.json.error.code]).toEqual([403, "WRONG_PASSWORD"]);
    const none = await api(route(), as("admin", { method: "POST", body: { areas: ["people"], reason: "x" } }));
    expect(none.status).toBe(400);
    expect(await db.supportGrant.count({ where: { tenantId: school.id } })).toBe(before);
  });
});

test.describe("creating, listing, revoking", () => {
  test("a grant defaults to 4 hours, is open to any platform administrator, is listed as live, and is audited; revoking ends it and is audited", async () => {
    const res = await create("admin", { areas: ["academics", "attendance"] });
    expect(res.status, res.text).toBe(201);
    const grant = res.json.data.grant;
    expect(grant).toMatchObject({ areas: ["academics", "attendance"], status: "LIVE" });
    const hours = (new Date(grant.expiresAt).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(3.9);
    expect(hours).toBeLessThan(4.1);
    const row = await db.supportGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect([row.granteeUserId, row.createdById]).toEqual([null, users.admin.id]);
    expect(await db.auditLog.count({ where: { tenantId: school.id, action: "SUPPORT_GRANT_CREATED", targetId: grant.id } })).toBe(1);

    const list = await api(route(), as("admin"));
    expect((list.json.data.grants as { id: string; status: string }[]).find((g) => g.id === grant.id)?.status).toBe("LIVE");

    const revoked = await api(`${route()}/${grant.id}/revoke`, as("admin", { method: "POST", body: {} }));
    expect(revoked.status, revoked.text).toBe(200);
    expect(revoked.json.data.grant.status).toBe("REVOKED");
    expect(await db.auditLog.count({ where: { tenantId: school.id, action: "SUPPORT_GRANT_REVOKED", targetId: grant.id } })).toBe(1);
    expect((await api(`${route()}/${grant.id}/revoke`, as("admin", { method: "POST", body: {} }))).status).toBe(404); // already revoked: nothing to revoke
    expect((await api(`${route()}/no-such-grant/revoke`, as("admin", { method: "POST", body: {} }))).status).toBe(404);
  });

  test("hours: 1 to 24 whole hours; areas: only the grantable ones, at least one, no repeats; a reason is required", async () => {
    const refused: object[] = [
      { hours: 25 },
      { hours: 0 },
      { hours: 1.5 },
      { areas: [] },
      { areas: ["finance"] },
      { areas: ["people", "nonsense"] },
      { areas: ["people", "people"] },
      { reason: "" },
      { reason: "   " },
      { reason: "x".repeat(301) },
      { granteeUserId: users.platform.id }, // a named grantee is not part of this version
    ];
    for (const bad of refused) expect((await create("admin", bad)).status, JSON.stringify(bad)).toBe(400);
    const ok = await create("admin", { areas: ["settings", "academics", "people", "attendance", "results"], hours: 24 });
    expect(ok.status, ok.text).toBe(201);
  });

  test("a school never sees another school's grants", async () => {
    const other = await createTenant({ name: "Other Support School" });
    await db.supportGrant.create({
      data: { tenantId: other.id, areas: ["people"], reason: "theirs", expiresAt: new Date(Date.now() + 3600_000) },
    });
    const list = await api(route(), as("admin"));
    expect((list.json.data.grants as { reason: string }[]).some((g) => g.reason === "theirs")).toBe(false);
  });
});
