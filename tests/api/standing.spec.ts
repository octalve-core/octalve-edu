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

// Standing (task 0028) over real HTTP: a pupil suspended or expelled, a member of staff suspended or terminated, the switch that lets a campus administrator suspend, the lift at
// sign-in, and what the portal does. Who may (the school's administrator for everything; a campus administrator suspends and lifts in their own campus while the school allows
// it), what each action does to the records the rest of the system reads, the append-only history, the guards (nobody changes their own, the last administrator is protected,
// another campus's and another school's rows are "not found"), and two changes at the same moment.
//
// School A has two campuses, North and South. People: its administrator, a second administrator, a campus administrator of North and of South, a North teacher with a staff record,
// a South teacher, a pupil of North with a sign-in and a guardian. School B has an administrator and a pupil.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
let sessionId: string;
let armId: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const proof = (who: string) => ({ type: "password", value: people[who].password });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const pupilUrl = (id: string, code = a.code) => `${school(code)}/people/students/${id}/standing`;
const staffUrl = (id: string) => `${school()}/people/staff/${id}/standing`;
const memberUrl = (userId: string) => `${school()}/members/${userId}/standing`;
const post = (url: string, who: string, body: object) => api(url, { ...as(who), method: "POST", body });
const get = (url: string, who: string) => api(url, as(who));
const REASON = "Fighting in the corridor";
const suspend = (url: string, who: string, extra: object = {}) => post(url, who, { action: "suspend", reason: REASON, ...extra });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;

/// A pupil of `campusId`, enrolled (ACTIVE) in the running session unless `enrol` is false.
async function pupil(campusId: string | null, over: Record<string, unknown> = {}, enrol = true, tenant = a) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: tenant.id,
      campusId,
      firstName: uniq("Pupil"),
      lastName: "Standing",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("SD/"),
      ...over,
    },
  });
  if (enrol && tenant === a)
    await db.studentEnrollment.create({ data: { tenantId: a.id, studentId: record.id, sessionId, classArmId: armId, status: "ACTIVE" } });
  return record;
}
const enrolment = (studentId: string) => db.studentEnrollment.findFirstOrThrow({ where: { studentId } });
const row = (studentId: string) => db.studentRecord.findUniqueOrThrow({ where: { id: studentId } });
const events = (where: object) => db.standingEvent.findMany({ where: { tenantId: a.id, ...where }, orderBy: { createdAt: "asc" } });

/// A member of staff of `campusId`: an account with a membership and a staff record.
async function teacher(name: string, campusId: string | null, role: Role = Role.TEACHING_STAFF) {
  const user = await createUser({ name });
  people[name] = user;
  await addMembership(user.id, a.id, role, campusId);
  const record = await db.staffRecord.create({
    data: { tenantId: a.id, campusId, userId: user.id, category: "TEACHING", firstName: name, lastName: "Staff" },
  });
  cookie[name] = cookieHeader((await loginAs(user, SAAS)).token!);
  return { user, record };
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Standing School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Standing School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "admin2", "campusNorth", "campusSouth", "adminB", "pupilUser", "parent"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.admin2.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.campusSouth.id, a.id, Role.CAMPUS_ADMIN, south);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, north);
  await addMembership(people.parent.id, a.id, Role.PARENT);
  for (const who of ["admin", "admin2", "campusNorth", "campusSouth", "adminB", "pupilUser", "parent"])
    cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);

  const [now, later] = [new Date(), new Date(Date.now() + 200 * 86_400_000)];
  sessionId = (
    await db.academicSession.create({
      data: {
        tenantId: a.id,
        campusId: null,
        label: "2044",
        startDate: new Date(now.getTime() - 30 * 86_400_000),
        endDate: later,
        status: "ACTIVE",
      },
    })
  ).id;
  const group = await db.classGroup.create({ data: { tenantId: a.id, campusId: null, name: "Standing JSS 1" } });
  armId = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A" } })).id;
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("reaching the routes", () => {
  test("nobody signed out, and no teacher, parent or pupil, can read or change a standing", async () => {
    const north1 = await pupil(north);
    const { record } = await teacher("Reach Teacher", north);
    for (const who of ["Reach Teacher", "parent", "pupilUser"]) {
      for (const url of [pupilUrl(north1.id), staffUrl(record.id), memberUrl(people.admin.id), `${school()}/settings/standing`]) {
        expect((await get(url, who)).status, `${who} GET ${url}`).toBe(403);
      }
      expect((await suspend(pupilUrl(north1.id), who)).status, who).toBe(403);
      expect((await suspend(staffUrl(record.id), who)).status, who).toBe(403);
    }
    for (const url of [pupilUrl(north1.id), staffUrl(record.id)]) {
      expect([401, 403]).toContain((await api(url, SAAS)).status);
      expect([401, 403]).toContain((await api(url, { ...SAAS, method: "POST", body: { action: "suspend", reason: REASON } })).status);
    }
    expect((await row(north1.id)).standing).toBe("ACTIVE");
  });

  test("a body with a key the route does not know, no reason, a reason that is too short or too long, or an action it does not have, is refused", async () => {
    const p = await pupil(north);
    const bad: object[] = [
      { action: "suspend" },
      { action: "suspend", reason: "ab" },
      { action: "suspend", reason: "x".repeat(501) },
      { action: "suspend", reason: "A reason\u0007with a bell" },
      { action: "terminate", reason: REASON },
      { action: "suspend", reason: REASON, surprise: true },
      { action: "suspend", reason: REASON, until: "next week" },
      { action: "suspend", reason: REASON, until: 5 },
      { reason: REASON },
    ];
    for (const body of bad) expect((await post(pupilUrl(p.id), "admin", body)).status, JSON.stringify(body)).toBe(400);
    expect((await row(p.id)).standing).toBe("ACTIVE");
  });

  test("an id that is not an id, a pupil that does not exist and another school's pupil all answer 404", async () => {
    const theirs = await pupil(null, {}, false, b);
    for (const id of ["no-such-pupil", "../etc", "x".repeat(200), theirs.id]) {
      expect((await get(pupilUrl(id), "admin")).status, id).toBe(404);
      expect((await suspend(pupilUrl(id), "admin")).status, id).toBe(404);
    }
    expect((await get(pupilUrl(theirs.id, b.code), "admin")).status).toBe(403); // not a member of school B
    expect((await row(theirs.id)).standing).toBe("ACTIVE");
  });
});

test.describe("a pupil: who may, and what it does", () => {
  test("the school's administrator suspends with an end date; the record says so; the enrolment is untouched; the history names who and why", async () => {
    const p = await pupil(north);
    const res = await suspend(pupilUrl(p.id), "admin", { until: day(5) });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data).toEqual({ standing: "SUSPENDED", until: day(5) });
    expect(await row(p.id)).toMatchObject({ standing: "SUSPENDED" });
    expect((await enrolment(p.id)).status).toBe("ACTIVE");
    const seen = (await get(pupilUrl(p.id), "admin")).json.data;
    expect(seen).toMatchObject({ standing: "SUSPENDED", until: day(5) });
    expect(seen.events).toHaveLength(1);
    expect(seen.events[0]).toMatchObject({ action: "SUSPENDED", reason: REASON, endsOn: day(5), decidedBy: "admin" });
    expect(await db.auditLog.count({ where: { tenantId: a.id, targetId: p.id, action: "STUDENT_SUSPENDED" } })).toBe(1);
  });

  test("a suspension with no end date lasts until lifted; lifting clears it; lifting what is not suspended, or suspending twice, is refused", async () => {
    const p = await pupil(north);
    expect((await suspend(pupilUrl(p.id), "admin")).json.data).toEqual({ standing: "SUSPENDED", until: null });
    const again = await suspend(pupilUrl(p.id), "admin");
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("NOT_APPLICABLE");
    expect((await post(pupilUrl(p.id), "admin", { action: "lift", reason: "Learnt their lesson" })).json.data.standing).toBe("ACTIVE");
    expect((await row(p.id)).standingUntil).toBeNull();
    expect((await post(pupilUrl(p.id), "admin", { action: "lift", reason: "Nothing to lift" })).status).toBe(409);
    expect((await events({ studentId: p.id })).map((e) => e.action)).toEqual(["SUSPENDED", "LIFTED"]);
  });

  test("an end date in the past, or that is not a real day, is refused", async () => {
    const p = await pupil(north);
    for (const until of [day(-1), "2026-02-30", "2026-13-01"])
      expect((await suspend(pupilUrl(p.id), "admin", { until })).status, until).toBe(400);
    expect((await suspend(pupilUrl(p.id), "admin", { until: day(0) })).status).toBe(200); // today is allowed
  });

  test("a suspension whose last day has passed reads as in good standing, can be suspended again, and can still be cleared", async () => {
    const p = await pupil(north, { standing: "SUSPENDED", standingUntil: new Date(`${day(-2)}T00:00:00Z`) });
    expect((await suspend(pupilUrl(p.id), "admin", { until: day(3) })).status).toBe(200);
    const q = await pupil(north, { standing: "SUSPENDED", standingUntil: new Date(`${day(-2)}T00:00:00Z`) });
    expect((await post(pupilUrl(q.id), "admin", { action: "lift", reason: "Clearing the record" })).status).toBe(200);
    expect((await row(q.id)).standing).toBe("ACTIVE");
  });

  test("a campus administrator suspends and lifts in their own campus; never expels or reinstates; never another campus's pupil, nor one with no campus", async () => {
    const [mine, theirs, wide] = [await pupil(north), await pupil(south), await pupil(null)];
    expect((await suspend(pupilUrl(mine.id), "campusNorth")).status).toBe(200);
    expect((await post(pupilUrl(mine.id), "campusNorth", { action: "lift", reason: "Back to class" })).status).toBe(200);
    for (const action of ["expel", "reinstate"]) {
      const res = await post(pupilUrl(mine.id), "campusNorth", { action, reason: REASON });
      expect(res.status, action).toBe(403);
    }
    expect((await suspend(pupilUrl(theirs.id), "campusNorth")).status).toBe(404);
    expect((await get(pupilUrl(theirs.id), "campusNorth")).status).toBe(404);
    expect([403, 404]).toContain((await suspend(pupilUrl(wide.id), "campusNorth")).status);
    expect((await row(theirs.id)).standing).toBe("ACTIVE");
    expect((await row(wide.id)).standing).toBe("ACTIVE");
    expect((await events({ studentId: mine.id })).map((e) => e.action)).toEqual(["SUSPENDED", "LIFTED"]);
  });

  test("expelling takes the pupil off the roll; reinstating puts them back in the running session", async () => {
    const p = await pupil(north);
    const res = await post(pupilUrl(p.id), "admin", { action: "expel", reason: "Repeated serious misconduct" });
    expect(res.status, res.text).toBe(200);
    expect(await row(p.id)).toMatchObject({ standing: "EXPELLED", standingUntil: null });
    expect((await enrolment(p.id)).status).toBe("EXPELLED");
    expect((await post(pupilUrl(p.id), "admin", { action: "expel", reason: REASON })).status).toBe(409);
    expect((await suspend(pupilUrl(p.id), "admin")).status).toBe(409);
    expect((await post(pupilUrl(p.id), "admin", { action: "lift", reason: REASON })).status).toBe(409); // the expelled are reinstated, not lifted
    expect((await post(pupilUrl(p.id), "admin", { action: "reinstate", reason: "The appeal was upheld" })).status).toBe(200);
    expect(await row(p.id)).toMatchObject({ standing: "ACTIVE" });
    expect((await enrolment(p.id)).status).toBe("ACTIVE");
  });

  test("a suspended pupil can be expelled (their suspension ends with it); the history says every step, newest first", async () => {
    const p = await pupil(north);
    await suspend(pupilUrl(p.id), "admin", { until: day(4) });
    await post(pupilUrl(p.id), "admin", { action: "expel", reason: "Expelled after the hearing" });
    expect(await row(p.id)).toMatchObject({ standing: "EXPELLED", standingUntil: null });
    await post(pupilUrl(p.id), "admin", { action: "reinstate", reason: "Reinstated on appeal" });
    const history = (await get(pupilUrl(p.id), "admin")).json.data.events as { action: string }[];
    expect(history.map((e) => e.action)).toEqual(["REINSTATED", "EXPELLED", "SUSPENDED"]);
  });

  test("an archived pupil's standing cannot change until they are restored", async () => {
    const p = await pupil(north, { archivedAt: new Date() }, false);
    const res = await suspend(pupilUrl(p.id), "admin");
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("ARCHIVED");
  });

  test("two suspensions at the same moment: one wins, the other is told it already applies", async () => {
    const p = await pupil(north);
    const results = await Promise.all([suspend(pupilUrl(p.id), "admin"), suspend(pupilUrl(p.id), "admin2")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await events({ studentId: p.id })).toHaveLength(1);
  });
});

test.describe("the school's setting: may a campus administrator suspend", () => {
  const set = (who: string, body: object) => api(`${school()}/settings/standing`, { ...as(who), method: "PATCH", body });

  test("the school turns it off: campus administrators are refused, the school's administrator is not; removing the value turns it back on", async () => {
    const p = await pupil(north);
    const before = await db.auditLog.count({ where: { tenantId: a.id, action: "STANDING_SETTING_CHANGED" } });
    expect((await set("admin", { scope: "SCHOOL", enabled: false })).status).toBe(400); // the fresh proof is required
    const off = await set("admin", { scope: "SCHOOL", enabled: false, stepUp: proof("admin") });
    expect(off.status, off.text).toBe(200);
    expect(off.json.data.school).toEqual({ stored: false, effective: false });
    const refused = await suspend(pupilUrl(p.id), "campusNorth");
    expect(refused.status).toBe(403);
    expect(refused.json.error.message).toMatch(/taken that from campus administrators/);
    expect((await suspend(pupilUrl(p.id), "admin")).status).toBe(200);
    await post(pupilUrl(p.id), "admin", { action: "lift", reason: REASON });
    expect((await set("admin", { scope: "SCHOOL", enabled: null, stepUp: proof("admin") })).status).toBe(200);
    expect((await suspend(pupilUrl(p.id), "campusNorth")).status).toBe(200);
    expect((await db.auditLog.count({ where: { tenantId: a.id, action: "STANDING_SETTING_CHANGED" } })) - before).toBe(2);
  });

  test("a campus can turn it off for itself only; another campus is unaffected; a campus can't turn it on over the school; saving the same value writes nothing", async () => {
    const [mine, other] = [await pupil(north), await pupil(south)];
    const changes = () => db.auditLog.count({ where: { tenantId: a.id, action: "STANDING_SETTING_CHANGED" } });
    const before = await changes(); // the audit log is append-only, so entries of the earlier tests stay: count only what this test adds
    expect((await set("campusNorth", { scope: "CAMPUS", campusId: north, enabled: false })).status).toBe(200);
    expect((await set("campusNorth", { scope: "CAMPUS", campusId: north, enabled: false })).status).toBe(200);
    expect((await changes()) - before).toBe(1);
    expect((await suspend(pupilUrl(mine.id), "campusNorth")).status).toBe(403);
    expect((await suspend(pupilUrl(other.id), "campusSouth")).status).toBe(200);
    expect((await set("campusNorth", { scope: "CAMPUS", campusId: south, enabled: false })).status).toBe(404);
    expect((await set("campusNorth", { scope: "CAMPUS", campusId: north, enabled: null })).status).toBe(200);
    expect((await suspend(pupilUrl(mine.id), "campusNorth")).status).toBe(200);
    await set("admin", { scope: "SCHOOL", enabled: false, stepUp: proof("admin") });
    const widen = await set("admin", { scope: "CAMPUS", campusId: north, enabled: true });
    expect(widen.status).toBe(400);
    expect(widen.json.error.message).toMatch(/only turn this off/);
  });

  test("who may change what, and a body that is not a switch is refused", async () => {
    expect((await set("campusNorth", { scope: "SCHOOL", enabled: false, stepUp: proof("campusNorth") })).status).toBe(403);
    await teacher("Setting Teacher", north);
    expect((await set("Setting Teacher", { scope: "CAMPUS", campusId: north, enabled: false })).status).toBe(403);
    const bad: object[] = [
      { scope: "SCHOOL", campusId: north, enabled: false, stepUp: proof("admin") },
      { scope: "CAMPUS", enabled: false },
      { scope: "EVERYONE", enabled: false },
      { scope: "SCHOOL", enabled: "no", stepUp: proof("admin") },
      { scope: "SCHOOL", enabled: false, stepUp: proof("admin"), surprise: 1 },
    ];
    for (const body of bad) expect((await set("admin", body)).status, JSON.stringify(body)).toBe(400);
    const wrong = await set("admin", { scope: "SCHOOL", enabled: false, stepUp: { type: "password", value: "not-the-password-1A!" } });
    expect(wrong.status).toBe(403);
    const view = (await get(`${school()}/settings/standing`, "campusNorth")).json.data;
    expect(view.canEditSchool).toBe(false);
    expect(view.campuses.map((c: { name: string }) => c.name)).toEqual(["North"]);
    expect(await db.tenantSetting.count({ where: { tenantId: a.id } })).toBe(0);
  });

  test("another school's administrator reaches nothing of this school's", async () => {
    const res = await api(`${school()}/settings/standing`, { ...SAAS, cookie: cookie.adminB });
    expect([403, 404]).toContain(res.status);
  });
});

test.describe("a member of staff", () => {
  test("a campus administrator suspends a teacher: the membership is deactivated, the record says so, and Reactivate is not the way back", async () => {
    const { user, record } = await teacher("Suspend Teacher", north);
    const res = await suspend(staffUrl(record.id), "campusNorth", { until: day(6) });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.standing).toBe("SUSPENDED");
    const member = await db.tenantMembership.findFirstOrThrow({ where: { tenantId: a.id, userId: user.id } });
    expect(member).toMatchObject({ standing: "SUSPENDED" });
    expect(member.deactivatedAt).not.toBeNull();
    expect(await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ standing: "SUSPENDED" });
    // the person has lost the authority at once: the next request is refused
    expect((await get(`${school()}/people/students`, "Suspend Teacher")).status).toBe(403);
    const seen = (await get(staffUrl(record.id), "campusNorth")).json.data;
    expect(seen).toMatchObject({ standing: "SUSPENDED", until: day(6) });
    expect(seen.events[0]).toMatchObject({ action: "SUSPENDED", reason: REASON, decidedBy: "campusNorth" });
    expect((await post(staffUrl(record.id), "campusNorth", { action: "lift", reason: "Allowed back" })).status).toBe(200);
    const back = await db.tenantMembership.findFirstOrThrow({ where: { tenantId: a.id, userId: user.id } });
    expect(back).toMatchObject({ standing: "ACTIVE", deactivatedAt: null });
  });

  test("a campus administrator can't terminate, touch an administrator, themselves, another campus's staff or someone with no campus", async () => {
    const { record } = await teacher("Guard Teacher", north);
    const southern = await teacher("South Teacher", south);
    expect((await post(staffUrl(record.id), "campusNorth", { action: "terminate", reason: REASON })).status).toBe(403);
    expect((await suspend(staffUrl(southern.record.id), "campusNorth")).status).toBe(404);
    expect((await suspend(memberUrl(people.admin.id), "campusNorth")).status).toBe(404); // the school's administrator has no campus: not theirs
    const self = await suspend(memberUrl(people.campusNorth.id), "campusNorth");
    expect([403, 404, 409]).toContain(self.status);
    const selfAdmin = await suspend(memberUrl(people.admin.id), "admin");
    expect(selfAdmin.status).toBe(409);
    expect(selfAdmin.json.error.code).toBe("SELF");
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } })).standing).toBe("ACTIVE");
  });

  test("the school's administrator terminates: the record is archived, a plain restore is not the way back, reinstating gives everything back", async () => {
    const { user, record } = await teacher("Terminate Teacher", north);
    const res = await post(staffUrl(record.id), "admin", { action: "terminate", reason: "Gross misconduct, confirmed" });
    expect(res.status, res.text).toBe(200);
    const stored = await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(stored).toMatchObject({ standing: "TERMINATED" });
    expect(stored.archivedAt).not.toBeNull();
    expect((await db.tenantMembership.findFirstOrThrow({ where: { tenantId: a.id, userId: user.id } })).deactivatedAt).not.toBeNull();
    expect((await suspend(staffUrl(record.id), "admin")).status).toBe(409);
    expect((await post(staffUrl(record.id), "admin", { action: "reinstate", reason: "Cleared on review" })).status).toBe(200);
    const back = await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(back).toMatchObject({ standing: "ACTIVE", archivedAt: null });
    expect((await db.tenantMembership.findFirstOrThrow({ where: { tenantId: a.id, userId: user.id } })).deactivatedAt).toBeNull();
    expect((await events({ staffRecordId: record.id })).map((e) => e.action)).toEqual(["TERMINATED", "REINSTATED"]);
  });

  test("a staff record with no sign-in is suspended and terminated through the staff route", async () => {
    const record = await db.staffRecord.create({
      data: { tenantId: a.id, campusId: north, category: "NON_TEACHING", firstName: "Guard", lastName: "Gate" },
    });
    expect((await suspend(staffUrl(record.id), "admin")).status).toBe(200);
    expect(await db.staffRecord.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ standing: "SUSPENDED" });
    expect((await post(staffUrl(record.id), "admin", { action: "terminate", reason: "Position ended" })).status).toBe(200);
    expect((await events({ staffRecordId: record.id })).map((e) => e.action)).toEqual(["SUSPENDED", "TERMINATED"]);
  });

  test("the school's last active administrator can't be suspended or terminated; two administrators who suspend each other at the same moment leave one", async () => {
    const lone = await createTenant({ name: "Lone Admin School" });
    const [first, second] = [await createUser({ name: "first" }), await createUser({ name: "second" })];
    await addMembership(first.id, lone.id, Role.ADMIN);
    await addMembership(second.id, lone.id, Role.ADMIN);
    const [c1, c2] = [cookieHeader((await loginAs(first, SAAS)).token!), cookieHeader((await loginAs(second, SAAS)).token!)];
    const body = { action: "suspend", reason: REASON };
    const url = (userId: string) => `/api/v1/schools/${lone.code}/members/${userId}/standing`;
    const race = await Promise.all([
      api(url(second.id), { ...SAAS, cookie: c1, method: "POST", body }),
      api(url(first.id), { ...SAAS, cookie: c2, method: "POST", body }),
    ]);
    const statuses = race.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    const active = await db.tenantMembership.count({ where: { tenantId: lone.id, role: Role.ADMIN, deactivatedAt: null } });
    expect(active).toBe(1);
  });

  test("a suspension that has ended lifts itself at the person's next sign-in, with a history row written by the school's records; a running one does not", async () => {
    const ended = await teacher("Ended Teacher", north);
    const running = await teacher("Running Teacher", north);
    for (const [who, until] of [
      [ended, day(-2)],
      [running, day(3)],
    ] as const) {
      await db.tenantMembership.updateMany({
        where: { tenantId: a.id, userId: who.user.id },
        data: { standing: "SUSPENDED", standingUntil: new Date(`${until}T00:00:00Z`), deactivatedAt: new Date() },
      });
      await db.staffRecord.update({
        where: { id: who.record.id },
        data: { standing: "SUSPENDED", standingUntil: new Date(`${until}T00:00:00Z`) },
      });
    }
    expect((await loginAs(ended.user, SAAS)).status).toBe(200);
    expect(await db.tenantMembership.findFirstOrThrow({ where: { tenantId: a.id, userId: ended.user.id } })).toMatchObject({
      standing: "ACTIVE",
      standingUntil: null,
      deactivatedAt: null,
    });
    expect((await db.staffRecord.findUniqueOrThrow({ where: { id: ended.record.id } })).standing).toBe("ACTIVE");
    const lifted = await events({ memberUserId: ended.user.id });
    expect(lifted).toHaveLength(1);
    expect(lifted[0]).toMatchObject({ action: "LIFTED", decidedByUserId: "system" });
    expect((await loginAs(running.user, SAAS)).status).toBe(200);
    expect(await db.tenantMembership.findFirstOrThrow({ where: { tenantId: a.id, userId: running.user.id } })).toMatchObject({
      standing: "SUSPENDED",
    });
    expect(await events({ memberUserId: running.user.id })).toHaveLength(0);
  });
});

test.describe("the portal", () => {
  // One pupil record belongs to the pupil's account (a person has one record per school): the first test makes it, each later one gets it back in good standing.
  const link = async (campusId: string | null = north) => {
    const existing = await db.studentRecord.findFirst({ where: { tenantId: a.id, userId: people.pupilUser.id } });
    if (!existing) return pupil(campusId, { userId: people.pupilUser.id });
    return db.studentRecord.update({ where: { id: existing.id }, data: { standing: "ACTIVE", standingUntil: null, campusId } });
  };
  const startSet = () => api(`${school()}/portal/forms/practice-sets/no-such-set/start`, { ...as("pupilUser"), method: "POST", body: {} });
  const options = () => api(`${school()}/portal/practice/options`, as("pupilUser"));

  test("a suspended pupil can read but can't take a quiz, practise or hand in work; when the suspension ends everything is back with nobody doing anything", async () => {
    const p = await link();
    expect((await options()).status).toBe(200);
    expect((await suspend(pupilUrl(p.id), "admin", { until: day(2) })).status).toBe(200);
    const barred = await startSet();
    expect(barred.status).toBe(403);
    expect(barred.json.error.code).toBe("SUSPENDED");
    expect(barred.json.error.message).not.toContain(REASON);
    const practise = await api(`${school()}/portal/practice/sessions`, {
      ...as("pupilUser"),
      method: "POST",
      body: { subject: "Maths", topic: "Fractions", size: 5 },
    });
    expect(practise.status).toBe(403);
    expect((await options()).status).toBe(200);
    // the last day passes with nobody lifting it
    await db.studentRecord.update({ where: { id: p.id }, data: { standingUntil: new Date(`${day(-1)}T00:00:00Z`) } });
    const free = await startSet();
    expect(free.status).not.toBe(403);
    expect(free.json?.error?.code).not.toBe("SUSPENDED");
  });

  test("an expelled pupil has no record to the portal and is never told why; a guardian's view of that child is closed too; reinstating gives it back", async () => {
    const p = await link();
    expect((await post(pupilUrl(p.id), "admin", { action: "expel", reason: "Expelled after the hearing" })).status).toBe(200);
    // The pupil's session ended with the expulsion (they have no other place to go: sign-in is refused too, see "sign-in" below), so what they held is answered "signed out".
    const res = await options();
    expect([401, 403, 404]).toContain(res.status);
    expect(res.text).not.toMatch(/expel|suspend|standing/i);
    expect([401, 404]).toContain((await startSet()).status);
    expect((await post(pupilUrl(p.id), "admin", { action: "reinstate", reason: "Reinstated on appeal" })).status).toBe(200);
    cookie.pupilUser = cookieHeader((await loginAs(people.pupilUser, SAAS)).token!);
    expect((await options()).status).toBe(200);
  });
});

test.describe("sign-in", () => {
  /// A pupil with an account of their own, a record in North and a session they already hold.
  async function expellable() {
    const user = await createUser({ name: uniq("Expellable ") });
    await addMembership(user.id, a.id, Role.STUDENT, north);
    const record = await pupil(north, { userId: user.id });
    const held = cookieHeader((await loginAs(user, SAAS)).token!);
    return { user, record, held };
  }
  const expel = (id: string) => post(pupilUrl(id), "admin", { action: "expel", reason: "Expelled after the hearing" });
  const wrongPassword = (email: string) =>
    api("/api/v1/auth/login", { ...SAAS, method: "POST", body: { email, password: "not-the-password" } });

  test("an expelled pupil cannot sign in, gets the very answer of a wrong password, and the session they held ends; reinstating gives sign-in back", async () => {
    const { user, record, held } = await expellable();
    expect((await api("/api/v1/auth/me", { ...SAAS, cookie: held })).status).toBe(200);
    expect((await expel(record.id)).status).toBe(200);

    const refused = await loginAs(user, SAAS);
    const wrong = await wrongPassword(user.email);
    expect(refused.status).toBe(401);
    expect(refused.token).toBeNull();
    expect(refused.json.error).toEqual(wrong.json.error); // the same code and the same sentence: nothing says the account exists or why
    expect(refused.text).not.toMatch(/expel|suspend|standing/i);
    expect((await api("/api/v1/auth/me", { ...SAAS, cookie: held })).status).toBe(401); // the session they held is gone

    expect((await post(pupilUrl(record.id), "admin", { action: "reinstate", reason: "Reinstated on appeal" })).status).toBe(200);
    expect((await loginAs(user, SAAS)).status).toBe(200);
  });

  test("a suspended pupil can still sign in; a pupil expelled in one school who is a guardian or an administrator of another can too", async () => {
    const { user, record } = await expellable();
    expect((await suspend(pupilUrl(record.id), "admin")).status).toBe(200);
    expect((await loginAs(user, SAAS)).status).toBe(200);
    await post(pupilUrl(record.id), "admin", { action: "lift", reason: REASON });

    expect((await expel(record.id)).status).toBe(200);
    expect((await loginAs(user, SAAS)).status).toBe(401);
    await addMembership(user.id, b.id, Role.PARENT, null); // somewhere else they are a guardian
    expect((await loginAs(user, SAAS)).status).toBe(200);
  });
});
