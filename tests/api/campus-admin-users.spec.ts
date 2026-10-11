import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
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

// A campus administrator and USERS over real HTTP (plan C1-C4, ADR 0016, slice B4): they list, invite, change, deactivate and reactivate the members
// of THEIR campus - staff, students, parents on that campus - and nothing at or above their own level. They cannot make an ADMIN or a CAMPUS_ADMIN,
// move anyone to another campus or to the whole school, or grant a permission. Another campus's member is the same 404 as an unknown id; an
// administrator-level member of their own campus is a 403. The ADMIN side of the same rules: a CAMPUS_ADMIN needs a campus, and the last-ADMIN rule
// counts ADMINs only (campus administrators do not keep a school alive).

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let admin: TestUser; // ADMIN
let campusAdmin: TestUser; // CAMPUS_ADMIN of North
let peer: TestUser; // another CAMPUS_ADMIN of North
const cookie: Record<string, string> = {};
let north: string;
let south: string;

const base = () => `/api/v1/schools/${a.code}`;
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
async function member(role: Role, campusId: string | null) {
  const user = await createUser({ name: uniq("Member ") });
  await addMembership(user.id, a.id, role, campusId);
  return user;
}
const mem = (userId: string) => `${base()}/members/${userId}`;
const patch = (who: string, userId: string, body: object) => api(mem(userId), as(who, { method: "PATCH", body }));
const roleOf = async (userId: string) =>
  (await db.tenantMembership.findUniqueOrThrow({ where: { userId_tenantId: { userId, tenantId: a.id } } })).role;
const inviteBody = (over: Record<string, unknown> = {}) => ({ email: `${uniq("inv")}@example.test`, role: "TEACHING_STAFF", ...over });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Campus Users School", campuses: ["North", "South"] });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  [admin, campusAdmin, peer] = await Promise.all(["Ada Admin", "Cam Campusadmin", "Pia Peer"].map((name) => createUser({ name })));
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(campusAdmin.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(peer.id, a.id, Role.CAMPUS_ADMIN, north);
  for (const [who, user] of Object.entries({ admin, campusAdmin })) cookie[who] = await cookieFor(user);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("the school administrator's side of the new role", () => {
  test("a campus administrator must have a campus: inviting one without a campus is refused, and so is clearing the campus of one", async () => {
    expect((await api(`${base()}/invitations`, as("admin", { method: "POST", body: inviteBody({ role: "CAMPUS_ADMIN" }) }))).status).toBe(
      400,
    );
    expect(
      (await api(`${base()}/invitations`, as("admin", { method: "POST", body: inviteBody({ role: "CAMPUS_ADMIN", campusId: null }) })))
        .status,
    ).toBe(400);
    const ok = await api(
      `${base()}/invitations`,
      as("admin", { method: "POST", body: inviteBody({ role: "CAMPUS_ADMIN", campusId: south }) }),
    );
    expect(ok.status).toBe(201);
    expect(ok.json.data.invitation.role).toBe("CAMPUS_ADMIN");

    const someone = await member(Role.TEACHING_STAFF, null);
    expect((await patch("admin", someone.id, { role: "CAMPUS_ADMIN" })).status).toBe(400); // no campus to be the administrator of
    expect((await patch("admin", someone.id, { role: "CAMPUS_ADMIN", campusId: north })).status).toBe(200);
    expect(await roleOf(someone.id)).toBe("CAMPUS_ADMIN");
    expect((await patch("admin", someone.id, { campusId: null })).status).toBe(400); // the database CHECK would otherwise answer with a 500
    expect((await patch("admin", someone.id, { permissions: ["CAN_MANAGE_FINANCE"] })).status).toBe(400); // permissions are for staff roles only
    expect((await patch("admin", someone.id, { role: "TEACHING_STAFF", campusId: null })).status).toBe(200); // demoting clears the need for a campus
  });

  test("campus administrators do not count towards 'the last administrator': two ADMINs demoting each other at once leave exactly one, even with a campus administrator beside them", async () => {
    const lone = await createTenant({ name: "Two Admin School", campuses: ["Only"] });
    const [one, two, deputy] = await Promise.all(["Ona One", "Tei Two", "Dee Deputy"].map((name) => createUser({ name })));
    await addMembership(one.id, lone.id, Role.ADMIN);
    await addMembership(two.id, lone.id, Role.ADMIN);
    await addMembership(deputy.id, lone.id, Role.CAMPUS_ADMIN, lone.campuses[0].id);
    const [c1, c2] = [await cookieFor(one), await cookieFor(two)];
    const demote = (cookie: string, id: string) =>
      api(`/api/v1/schools/${lone.code}/members/${id}`, { ...SAAS, cookie, method: "PATCH", body: { role: "TEACHING_STAFF" } });
    const results = await Promise.all([demote(c1, two.id), demote(c2, one.id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await db.tenantMembership.count({ where: { tenantId: lone.id, role: "ADMIN", deactivatedAt: null } })).toBe(1);
  });
});

test.describe("members", () => {
  test("the list holds the campus administrator's own campus and nothing else: not another campus, not the school's administrators, not people with no campus", async () => {
    const [mine, theirs, wide, boss] = [
      await member(Role.TEACHING_STAFF, north),
      await member(Role.TEACHING_STAFF, south),
      await member(Role.PARENT, null),
      admin,
    ];
    const res = await api(`${base()}/members?limit=100`, as("campusAdmin"));
    expect(res.status).toBe(200);
    const ids = (res.json.data.members as { userId: string }[]).map((m) => m.userId);
    expect(ids).toEqual(expect.arrayContaining([mine.id, campusAdmin.id, peer.id]));
    for (const other of [theirs, wide, boss]) expect(ids).not.toContain(other.id);
    // naming another campus in the filter is a 403, not an empty answer that hides the rule
    expect((await api(`${base()}/members?campusId=${south}`, as("campusAdmin"))).status).toBe(403);
    expect((await api(`${base()}/members?campusId=${north}`, as("campusAdmin"))).status).toBe(200);
    const all = ((await api(`${base()}/members?limit=100`, as("admin"))).json.data.members as { userId: string }[]).map((m) => m.userId);
    expect(all).toEqual(expect.arrayContaining([mine.id, theirs.id, wide.id, boss.id])); // an ADMIN is unchanged
  });

  test("change a member: a role below administrator works; another campus is the same 404; an administrator-level member, an administrator-level role, another campus as the target, and permissions are 403", async () => {
    const [mine, theirs] = [await member(Role.TEACHING_STAFF, north), await member(Role.TEACHING_STAFF, south)];
    expect((await patch("campusAdmin", mine.id, { role: "NON_TEACHING_STAFF" })).status).toBe(200);
    expect(await roleOf(mine.id)).toBe("NON_TEACHING_STAFF");

    const unknown = await patch("campusAdmin", "no-such-member", { role: "STUDENT" });
    expect(unknown.status).toBe(404);
    const other = await patch("campusAdmin", theirs.id, { role: "STUDENT" });
    expect([other.status, other.json.error.code]).toEqual([404, unknown.json.error.code]);
    expect(await roleOf(theirs.id)).toBe("TEACHING_STAFF");

    for (const body of [
      { role: "ADMIN" },
      { role: "CAMPUS_ADMIN" },
      { campusId: south },
      { campusId: null },
      { permissions: ["CAN_MANAGE_FINANCE"] },
    ]) {
      const res = await patch("campusAdmin", mine.id, body);
      expect([res.status, JSON.stringify(body)], JSON.stringify(body)).toEqual([403, JSON.stringify(body)]);
    }
    expect(await roleOf(mine.id)).toBe("NON_TEACHING_STAFF");
    expect(
      (await db.tenantMembership.findUniqueOrThrow({ where: { userId_tenantId: { userId: mine.id, tenantId: a.id } } })).campusId,
    ).toBe(north);

    expect((await patch("campusAdmin", peer.id, { role: "TEACHING_STAFF" })).status).toBe(403); // a colleague at their own level
    expect(await roleOf(peer.id)).toBe("CAMPUS_ADMIN");
    expect((await patch("campusAdmin", admin.id, { role: "TEACHING_STAFF" })).status).toBe(404); // an ADMIN has no campus: not theirs to see
    expect((await patch("campusAdmin", campusAdmin.id, { role: "STUDENT" })).status).toBe(409); // nobody changes themselves
  });

  test("deactivate and reactivate: own campus works; another campus is the same 404; an administrator-level member is 403", async () => {
    const [mine, theirs] = [await member(Role.TEACHING_STAFF, north), await member(Role.TEACHING_STAFF, south)];
    const act = (verb: string, id: string) => api(`${mem(id)}/${verb}`, as("campusAdmin", { method: "POST" }));
    expect((await act("deactivate", mine.id)).status).toBe(200);
    expect((await act("reactivate", mine.id)).status).toBe(200);
    const unknown = await act("deactivate", "no-such-member");
    expect(unknown.status).toBe(404);
    for (const verb of ["deactivate", "reactivate"]) {
      const res = await act(verb, theirs.id);
      expect([res.status, res.json.error.code, verb]).toEqual([404, unknown.json.error.code, verb]);
      expect([(await act(verb, peer.id)).status, verb]).toEqual([403, verb]);
      expect([(await act(verb, admin.id)).status, verb]).toEqual([404, verb]);
    }
    expect(
      (await db.tenantMembership.findUniqueOrThrow({ where: { userId_tenantId: { userId: theirs.id, tenantId: a.id } } })).deactivatedAt,
    ).toBeNull();
  });
});

test.describe("invitations", () => {
  const invite = (body: object) => api(`${base()}/invitations`, as("campusAdmin", { method: "POST", body }));

  test("an invitation defaults to the campus administrator's campus; another campus, none, or an administrator-level role is a 403", async () => {
    const made = await invite(inviteBody());
    expect(made.status).toBe(201);
    expect(made.json.data.invitation.campusId).toBe(north);
    expect((await invite(inviteBody({ campusId: north, role: "PARENT" }))).status).toBe(201);
    for (const over of [
      { campusId: south },
      { campusId: null },
      { role: "ADMIN" },
      { role: "CAMPUS_ADMIN" },
      { role: "CAMPUS_ADMIN", campusId: north },
    ]) {
      const res = await invite(inviteBody(over));
      expect([res.status, JSON.stringify(over)], JSON.stringify(over)).toEqual([403, JSON.stringify(over)]);
    }
    // nothing the campus administrator tried was written (the ADMIN's own invitations in other tests are not counted)
    expect(
      await db.invitation.count({
        where: {
          tenantId: a.id,
          invitedById: campusAdmin.id,
          OR: [{ role: { in: ["ADMIN", "CAMPUS_ADMIN"] } }, { campusId: { not: north } }],
        },
      }),
    ).toBe(0);
  });

  test("list, resend and revoke: the campus administrator's own campus's open invitations only; another campus's is the same 404; an administrator-level one is 403", async () => {
    const mk = (campusId: string | null, role: Role = Role.TEACHING_STAFF) =>
      db.invitation.create({
        data: {
          tenantId: a.id,
          email: `${uniq("seed")}@example.test`,
          role,
          campusId,
          tokenHash: uniq("hash"),
          invitedById: admin.id,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    const [mine, theirs, wide, adminLevel] = [await mk(north), await mk(south), await mk(null), await mk(north, Role.CAMPUS_ADMIN)];
    const list = await api(`${base()}/invitations?limit=100`, as("campusAdmin"));
    expect(list.status).toBe(200);
    const ids = (list.json.data.invitations as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(mine.id);
    for (const other of [theirs, wide]) expect(ids).not.toContain(other.id);

    const resend = (id: string) => api(`${base()}/invitations/${id}/resend`, as("campusAdmin", { method: "POST" }));
    const revoke = (id: string) => api(`${base()}/invitations/${id}`, as("campusAdmin", { method: "DELETE" }));
    const unknown = await revoke("no-such-invitation");
    expect(unknown.status).toBe(404);
    for (const act of [resend, revoke]) {
      for (const row of [theirs, wide]) {
        const res = await act(row.id);
        expect([res.status, res.json.error.code]).toEqual([404, unknown.json.error.code]);
      }
      expect((await act(adminLevel.id)).status).toBe(403);
    }
    expect((await resend(mine.id)).status).toBe(200);
    expect((await revoke(mine.id)).status).toBe(200);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: theirs.id } })).revokedAt).toBeNull();
    expect((await db.invitation.findUniqueOrThrow({ where: { id: adminLevel.id } })).revokedAt).toBeNull();
  });
});

test.describe("what stays with the school administrator", () => {
  test("campuses and school settings are refused to a campus administrator", async () => {
    expect((await api(`${base()}/campuses`, as("campusAdmin", { method: "POST", body: { name: uniq("Hacked ") } }))).status).toBe(403);
    expect((await api(`${base()}/settings`, as("campusAdmin"))).status).toBe(403);
    expect((await api(`${base()}/settings`, as("campusAdmin", { method: "PATCH", body: { name: "Hacked" } }))).status).toBe(403);
    // they can see which campus is theirs (the list of campuses is "your own" for everyone but an ADMIN)
    const mine = await api(`${base()}/campuses`, as("campusAdmin"));
    expect(mine.status).toBe(200);
    expect((mine.json.data.campuses as { id: string }[]).map((c) => c.id)).toEqual([north]);
  });
});
