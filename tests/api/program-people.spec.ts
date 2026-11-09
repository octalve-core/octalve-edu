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

// Programs, slice P2 (task 0027): the people of a program over real HTTP. Who may add and see whom (the school's administrator and a program admin: everyone; a campus administrator: the
// people through their own campus), each kind of person, one place per person, the state of a place read from the school's own records (both ways), the standing of a person typed in,
// the namesake guard, adding a class, the guards around the tree and the campuses, and what the database refuses by itself.
//
// School A has two campuses, North and South. School B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
let sessionId: string;
let armNorth: string;
let programId: string;
let top: string;
let inner: string;
let second: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const programsUrl = (code = a.code) => `${school(code)}/programs`;
const peopleUrl = (id = programId, code = a.code) => `${programsUrl(code)}/${id}/people`;
const get = (url: string, who: string) => api(url, as(who));
const send = (url: string, who: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) =>
  api(url, { ...as(who), method, ...(body ? { body } : {}) });
const post = (url: string, who: string, body: object) => send(url, who, "POST", body);
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const REASON = "A good enough reason";

async function pupil(campusId: string | null, over: Record<string, unknown> = {}, enrol = false) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Pupil"),
      lastName: "Program",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("PR/"),
      ...over,
    },
  });
  if (enrol)
    await db.studentEnrollment.create({
      data: { tenantId: a.id, studentId: record.id, sessionId, classArmId: armNorth, status: "ACTIVE" },
    });
  return record;
}
const staffRecord = (campusId: string | null, over: Record<string, unknown> = {}) =>
  db.staffRecord.create({
    data: { tenantId: a.id, campusId, category: "TEACHING", firstName: uniq("Staff"), lastName: "Program", ...over },
  });
const guardianRecord = (over: Record<string, unknown> = {}) =>
  db.guardianRecord.create({ data: { tenantId: a.id, firstName: uniq("Guardian"), lastName: "Program", phone: "08031112222", ...over } });

const addPupil = (record: { id: string }, who = "admin", groupId = inner) =>
  post(peopleUrl(), who, { kind: "STUDENT", studentId: record.id, groupId });
const list = async (who = "admin", query = "") =>
  (await get(`${peopleUrl()}${query}`, who)).json.data as { people: PersonRow[]; total: number };
type PersonRow = {
  id: string;
  name: string;
  kind: string;
  state: string;
  campusId: string | null;
  groupPath: string;
  status: string;
  can: { suspend: boolean; remove: boolean };
};
const find = async (id: string, who = "admin") => (await list(who)).people.find((p) => p.id === id);
const idOf = (res: { json: { data: { id: string } } }) => res.json.data.id;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "People School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other People School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusNorth", "campusSouth", "progAdmin", "teacher", "pupilUser", "guardianUser", "adminB"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.campusSouth.id, a.id, Role.CAMPUS_ADMIN, south);
  await addMembership(people.progAdmin.id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF, north);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, north);
  await addMembership(people.guardianUser.id, a.id, Role.PARENT);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);

  sessionId = (
    await db.academicSession.create({
      data: {
        tenantId: a.id,
        label: "2077",
        startDate: new Date(Date.now() - 30 * 86_400_000),
        endDate: new Date(Date.now() + 200 * 86_400_000),
        status: "ACTIVE",
      },
    })
  ).id;
  const group = await db.classGroup.create({ data: { tenantId: a.id, campusId: north, name: "North Class" } });
  armNorth = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A" } })).id;

  // a program in both campuses, active, with two groups (one inside the other) and a second top group; a program admin named
  const made = await post(programsUrl(), "admin", {
    name: uniq("Hifz"),
    kind: "ONGOING",
    campusIds: [north, south],
    levelLabels: ["Section", "Class"],
  });
  expect(made.status, made.text).toBe(201);
  programId = idOf(made);
  expect((await post(`${programsUrl()}/${programId}/status`, "admin", { action: "activate" })).status).toBe(200);
  top = idOf(await post(`${programsUrl()}/${programId}/groups`, "admin", { name: "Juz A" }));
  inner = idOf(await post(`${programsUrl()}/${programId}/groups`, "admin", { parentId: top, name: "Group 1" }));
  second = idOf(await post(`${programsUrl()}/${programId}/groups`, "admin", { name: "Juz B" }));
  expect((await post(`${programsUrl()}/${programId}/admins`, "admin", { userId: people.progAdmin.id })).status).toBe(201);
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: { in: ["programs.enabled", "standing.campusAdminMaySuspend"] } } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("reaching the routes", () => {
  test("nobody signed out, no pupil or guardian and no other school's administrator reaches a program's people", async () => {
    for (const url of [peopleUrl(), `${peopleUrl()}/candidates?kind=STUDENT&q=ab`, `${peopleUrl()}/classes`]) {
      expect((await api(url, SAAS)).status, url).toBe(401);
      for (const who of ["pupilUser", "guardianUser"]) expect((await get(url, who)).status, `${who} ${url}`).toBe(403);
      expect([403, 404], `adminB ${url}`).toContain((await get(url, "adminB")).status);
    }
    const record = await pupil(north);
    expect((await addPupil(record, "teacher")).status, "a teacher with no place in the program").toBe(404);
    expect([403, 404]).toContain((await addPupil(record, "adminB")).status);
    expect((await list("admin")).people.some((p) => p.name.includes(record.firstName))).toBe(false);
  });
});

test.describe("adding each kind of person", () => {
  test("a pupil, a member of staff and a guardian are linked from the school's records; an adult and a child are typed in; every one is audited", async () => {
    const student = await pupil(north);
    const teacherRecord = await staffRecord(north);
    const guardian = await guardianRecord();
    const s = await addPupil(student);
    expect(s.status, s.text).toBe(201);
    const t = await post(peopleUrl(), "admin", { kind: "STAFF", staffRecordId: teacherRecord.id, groupId: inner });
    expect(t.status, t.text).toBe(201);
    const g = await post(peopleUrl(), "admin", { kind: "GUARDIAN", guardianId: guardian.id, groupId: second });
    expect(g.status, g.text).toBe(201);
    const adult = await post(peopleUrl(), "admin", {
      kind: "ADULT",
      firstName: "  Maryam ",
      lastName: "Sule",
      phone: "08055550001",
      groupId: inner,
      campusId: north,
    });
    expect(adult.status, adult.text).toBe(201);
    const child = await post(peopleUrl(), "admin", {
      kind: "CHILD",
      firstName: "Zainab",
      lastName: "Sule",
      dateOfBirth: "2018-04-04",
      guardianName: "Maryam Sule",
      guardianPhone: "08055559999",
      groupId: inner,
      campusId: north,
    });
    expect(child.status, child.text).toBe(201);
    const rows = (await list("admin")).people;
    const row = (id: string) => rows.find((p) => p.id === id)!;
    expect(row(idOf(s))).toMatchObject({ kind: "STUDENT", state: "ACTIVE", campusId: north, groupPath: "Juz A–Group 1" });
    expect(row(idOf(t))).toMatchObject({ kind: "STAFF", state: "ACTIVE", campusId: north });
    expect(row(idOf(g))).toMatchObject({ kind: "GUARDIAN", state: "ACTIVE", campusId: null, groupPath: "Juz B" });
    expect(row(idOf(adult)).name).toBe("Maryam Sule");
    expect(row(idOf(child))).toMatchObject({ kind: "CHILD", state: "ACTIVE" });
    const audit = await db.programAudit.findMany({ where: { programId, action: "PERSON_ADDED" } });
    expect(audit.length).toBeGreaterThanOrEqual(5);
  });

  test("a child without a birth date, a guardian's name or a guardian's phone is refused with the field named; an adult needs only a name", async () => {
    const res = await post(peopleUrl(), "admin", {
      kind: "CHILD",
      firstName: "Kid",
      lastName: "NoGuardian",
      groupId: inner,
      campusId: north,
    });
    expect(res.status).toBe(400);
    const paths = JSON.stringify(res.json.error.details ?? []);
    for (const field of ["dateOfBirth", "guardianName", "guardianPhone"]) expect(paths).toContain(field);
    expect((await post(peopleUrl(), "admin", { kind: "ADULT", firstName: "", lastName: "X", groupId: inner })).status).toBe(400);
    expect(
      (await post(peopleUrl(), "admin", { kind: "ADULT", firstName: "A", lastName: "B", groupId: inner, extra: 1 })).status,
      "an unknown key",
    ).toBe(400);
    expect((await post(peopleUrl(), "admin", { kind: "ADULT", firstName: "A", lastName: "B", groupId: "no-such-group" })).status).toBe(404);
  });

  test("a person is in a program once: in again is refused; after leaving they are re-enrolled, not added; a group of another program is not found", async () => {
    const record = await pupil(north);
    const first = await addPupil(record);
    expect(first.status).toBe(201);
    const again = await addPupil(record);
    expect([again.status, again.json.error.code]).toEqual([409, "ALREADY_IN"]);
    const id = idOf(first);
    expect((await post(`${peopleUrl()}/${id}/place`, "admin", { action: "withdraw", reason: REASON })).status).toBe(200);
    const left = await addPupil(record);
    expect([left.status, left.json.error.code]).toEqual([409, "LEFT_ALREADY"]);
    expect(await find(id)).toMatchObject({ status: "WITHDRAWN", state: "WITHDRAWN" });
    const back = await post(`${peopleUrl()}/${id}/place`, "admin", { action: "reenrol", reason: REASON });
    expect(back.status, back.text).toBe(200);
    expect(await find(id)).toMatchObject({ status: "ACTIVE", state: "ACTIVE" });
    // the same row came back: one continuous history
    expect(await db.programParticipant.count({ where: { programId, studentId: record.id } })).toBe(1);
    const other = await post(programsUrl(), "admin", { name: uniq("Other"), kind: "ONGOING", campusIds: [north], levelLabels: ["One"] });
    const foreignGroup = idOf(await post(`${programsUrl()}/${idOf(other)}/groups`, "admin", { name: "Foreign" }));
    expect((await post(peopleUrl(), "admin", { kind: "STUDENT", studentId: (await pupil(north)).id, groupId: foreignGroup })).status).toBe(
      404,
    );
  });

  test("a withdrawn or re-enrolled person, a move and an edit are audited, and the history of the place says so", async () => {
    const adult = idOf(
      await post(peopleUrl(), "admin", { kind: "ADULT", firstName: "Hauwa", lastName: "Audit", groupId: inner, campusId: north }),
    );
    expect((await post(`${peopleUrl()}/${adult}/move`, "admin", { groupId: second })).status).toBe(200);
    expect((await send(`${peopleUrl()}/${adult}`, "admin", "PATCH", { phone: "08099990000" })).status).toBe(200);
    expect((await post(`${peopleUrl()}/${adult}/place`, "admin", { action: "withdraw", reason: REASON })).status).toBe(200);
    const history = (await get(`${peopleUrl()}/${adult}`, "admin")).json.data.history as { action: string }[];
    expect(history.map((h) => h.action)).toEqual(["PERSON_WITHDRAWN", "PERSON_EDITED", "PERSON_MOVED", "PERSON_ADDED"]);
    expect((await post(`${peopleUrl()}/${adult}/move`, "admin", { groupId: inner })).status, "a place that has ended cannot be moved").toBe(
      409,
    );
  });
});

test.describe("the state of a place follows the school's own record, both ways", () => {
  test("a suspended, expelled or archived pupil changes the place with no repair step, and coming back puts it right again", async () => {
    const record = await pupil(north);
    const id = idOf(await addPupil(record));
    expect((await find(id))!.state).toBe("ACTIVE");
    await db.studentRecord.update({ where: { id: record.id }, data: { standing: "SUSPENDED", standingUntil: new Date(day(3)) } });
    expect((await find(id))!.state).toBe("SUSPENDED");
    await db.studentRecord.update({ where: { id: record.id }, data: { standingUntil: new Date(day(-1)) } });
    expect((await find(id))!.state, "the suspension ended by itself").toBe("ACTIVE");
    await db.studentRecord.update({ where: { id: record.id }, data: { standing: "EXPELLED", standingUntil: null } });
    expect((await find(id))!.state).toBe("EXPELLED");
    await db.studentRecord.update({ where: { id: record.id }, data: { standing: "ACTIVE" } });
    expect((await find(id))!.state).toBe("ACTIVE");
    await db.studentRecord.update({ where: { id: record.id }, data: { archivedAt: new Date() } });
    expect((await find(id))!.state).toBe("ENDED_BY_SCHOOL");
  });

  test("a terminated, suspended or deactivated member of staff changes every place of theirs; a suspended one is still listed", async () => {
    const user = await createUser({ name: uniq("linked") });
    await addMembership(user.id, a.id, Role.TEACHING_STAFF, north);
    const record = await staffRecord(north, { userId: user.id });
    const id = idOf(await post(peopleUrl(), "admin", { kind: "STAFF", staffRecordId: record.id, groupId: inner }));
    await db.staffRecord.update({ where: { id: record.id }, data: { standing: "SUSPENDED" } });
    expect((await find(id))!.state).toBe("SUSPENDED");
    await db.staffRecord.update({ where: { id: record.id }, data: { standing: "TERMINATED" } });
    expect((await find(id))!.state).toBe("TERMINATED");
    await db.staffRecord.update({ where: { id: record.id }, data: { standing: "ACTIVE" } });
    await db.tenantMembership.update({
      where: { userId_tenantId: { userId: user.id, tenantId: a.id } },
      data: { deactivatedAt: new Date() },
    });
    expect((await find(id))!.state).toBe("ENDED_BY_SCHOOL");
  });

  test("a pupil or a member of staff has no standing to change here: it is the school's, and the answer says where", async () => {
    const id = idOf(await addPupil(await pupil(north)));
    const res = await post(`${peopleUrl()}/${id}/standing`, "admin", { action: "suspend", reason: REASON });
    expect([res.status, res.json.error.code]).toEqual([409, "LINKED"]);
    const edit = await send(`${peopleUrl()}/${id}`, "admin", "PATCH", { phone: "08000000000" });
    expect([edit.status, edit.json.error.code]).toEqual([409, "LINKED"]);
  });
});

test.describe("who sees and handles whom", () => {
  test("a campus administrator sees and handles only the people through their own campus, never another campus's or the school's", async () => {
    const northPupil = idOf(await addPupil(await pupil(north)));
    const southPupil = idOf(await addPupil(await pupil(south)));
    const wide = idOf(await addPupil(await pupil(null)));
    const northRows = (await list("campusNorth")).people.map((p) => p.id);
    expect(northRows).toContain(northPupil);
    expect(northRows).not.toContain(southPupil);
    expect(northRows).not.toContain(wide);
    for (const [method, url, body] of [
      ["GET", `${peopleUrl()}/${southPupil}`, undefined],
      ["POST", `${peopleUrl()}/${southPupil}/move`, { groupId: second }],
      ["POST", `${peopleUrl()}/${southPupil}/place`, { action: "withdraw", reason: REASON }],
      ["GET", `${peopleUrl()}/${wide}`, undefined],
    ] as const) {
      const res = await api(url, { ...as("campusNorth"), method, ...(body ? { body } : {}) });
      expect(res.status, `${method} ${url}`).toBe(404);
    }
    expect((await find(southPupil))!.state).toBe("ACTIVE");
    // and cannot add from another campus, or the school
    expect((await addPupil(await pupil(south), "campusNorth")).status).toBe(404);
    expect((await addPupil(await pupil(null), "campusNorth")).status).toBe(404);
    expect((await addPupil(await pupil(north), "campusNorth")).status, "their own campus").toBe(201);
  });

  test("a program admin handles everyone; the head counts on the program count only what the viewer may see", async () => {
    const southPupil = idOf(await addPupil(await pupil(south), "progAdmin"));
    expect(await find(southPupil, "progAdmin")).toBeTruthy();
    const full = (await get(`${programsUrl()}/${programId}`, "admin")).json.data.groups as { id: string; people: number }[];
    const asNorth = (await get(`${programsUrl()}/${programId}`, "campusNorth")).json.data.groups as { id: string; people: number }[];
    const count = (groups: { id: string; people: number }[], id: string) => groups.find((g) => g.id === id)!.people;
    expect(count(full, top)).toBeGreaterThanOrEqual(count(asNorth, top) + 1);
    expect(count(full, top)).toBeGreaterThanOrEqual(count(full, inner));
  });

  test("a person with no place in the program, and another school's records, are never reached", async () => {
    const theirs = await db.studentRecord.create({
      data: { tenantId: b.id, firstName: "Other", lastName: "School", dateOfBirth: new Date("2012-01-01"), admissionNo: uniq("B/") },
    });
    const res = await post(peopleUrl(), "admin", { kind: "STUDENT", studentId: theirs.id, groupId: inner });
    expect(res.status).toBe(404);
    expect(await db.programParticipant.count({ where: { studentId: theirs.id } })).toBe(0);
    const found = (await get(`${peopleUrl()}/candidates?kind=STUDENT&q=School`, "admin")).json.data as { name: string }[];
    expect(found.some((c) => c.name.includes("Other"))).toBe(false);
  });

  test("the list searches by name, filters by group, kind and state, and pages", async () => {
    const unique = uniq("Zed");
    const id = idOf(
      await post(peopleUrl(), "admin", { kind: "ADULT", firstName: unique, lastName: "Searchable", groupId: second, campusId: south }),
    );
    const byName = await list("admin", `?q=${unique.toLowerCase()}`);
    expect(byName.people.map((p) => p.id)).toEqual([id]);
    expect((await list("admin", `?groupId=${second}&kind=ADULT&q=${unique}`)).total).toBe(1);
    expect((await list("admin", `?groupId=${top}&q=${unique}`)).total, "another group's people").toBe(0);
    expect((await list("admin", `?q=${unique}&state=SUSPENDED`)).total).toBe(0);
    expect((await list("admin", "?q=100%25")).total, "a % is text, not a wildcard").toBe(0);
    expect((await get(`${peopleUrl()}?page=0`, "admin")).status).toBe(400);
    expect((await get(`${peopleUrl()}?kind=NOPE`, "admin")).status).toBe(400);
  });
});

test.describe("the standing of a person typed in", () => {
  const typed = async (campusId = north) =>
    idOf(await post(peopleUrl(), "admin", { kind: "ADULT", firstName: uniq("Typed"), lastName: "Standing", groupId: inner, campusId }));

  test("the school's administrator suspends, lifts, expels and reinstates; each is a history entry with the reason, and the state follows", async () => {
    const id = await typed();
    const url = `${peopleUrl()}/${id}/standing`;
    expect((await post(url, "admin", { action: "suspend", reason: REASON, until: day(5) })).status).toBe(200);
    expect(await find(id)).toMatchObject({ state: "SUSPENDED" });
    expect((await post(url, "admin", { action: "suspend", reason: REASON })).status, "suspending twice").toBe(409);
    expect((await post(url, "admin", { action: "lift", reason: REASON })).status).toBe(200);
    expect((await post(url, "admin", { action: "expel", reason: REASON })).status).toBe(200);
    expect(await find(id)).toMatchObject({ state: "EXPELLED" });
    expect((await post(url, "admin", { action: "reinstate", reason: REASON })).status).toBe(200);
    expect((await find(id))!.state).toBe("ACTIVE");
    const history = (await get(url, "admin")).json.data;
    expect(history.events.map((e: { action: string }) => e.action)).toEqual(["REINSTATED", "EXPELLED", "LIFTED", "SUSPENDED"]);
    expect(history.events.every((e: { reason: string }) => e.reason === REASON)).toBe(true);
    expect(await db.standingEvent.count({ where: { tenantId: a.id, participantId: id, subject: "PARTICIPANT" } })).toBe(4);
  });

  test("a suspension that has a last day ends by itself; a reason is required; a date that is not a day is refused", async () => {
    const id = await typed();
    const url = `${peopleUrl()}/${id}/standing`;
    expect((await post(url, "admin", { action: "suspend", reason: "no" })).status).toBe(400);
    expect((await post(url, "admin", { action: "suspend", reason: REASON, until: "2026-13-01" })).status).toBe(400);
    expect((await post(url, "admin", { action: "suspend", reason: REASON, until: day(-2) })).status).toBe(400);
    expect((await post(url, "admin", { action: "suspend", reason: REASON, until: day(2) })).status).toBe(200);
    await db.programParticipant.update({ where: { id }, data: { standingUntil: new Date(day(-1)) } });
    expect((await find(id))!.state).toBe("ACTIVE");
  });

  test("a program admin and a campus administrator suspend and lift while the school allows it; expelling and reinstating are the school administrator's alone", async () => {
    const id = await typed(north);
    const url = `${peopleUrl()}/${id}/standing`;
    expect((await post(url, "progAdmin", { action: "suspend", reason: REASON })).status).toBe(200);
    expect((await post(url, "progAdmin", { action: "expel", reason: REASON })).status).toBe(403);
    expect((await post(url, "campusNorth", { action: "lift", reason: REASON })).status).toBe(200);
    expect((await post(url, "campusNorth", { action: "expel", reason: REASON })).status).toBe(403);
    expect((await post(url, "campusSouth", { action: "suspend", reason: REASON })).status, "another campus's person").toBe(404);
    // the school takes suspending away from campus administrators: it holds program admins too
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "standing.campusAdminMaySuspend", value: false, updatedById: people.admin.id },
    });
    expect((await post(url, "campusNorth", { action: "suspend", reason: REASON })).status).toBe(403);
    expect((await post(url, "progAdmin", { action: "suspend", reason: REASON })).status).toBe(403);
    expect((await post(url, "admin", { action: "suspend", reason: REASON })).status, "the school's administrator is never held by it").toBe(
      200,
    );
    const view = (await list("campusNorth")).people.find((p) => p.id === id)!;
    expect(view.can.suspend).toBe(false);
  });
});

test.describe("the namesake guard", () => {
  test("the same name and birth date, or the same phone, is refused until an administrator confirms, and the confirmation is audited", async () => {
    const body = { kind: "ADULT", firstName: "Fatima", lastName: "Twin", dateOfBirth: "1990-05-05", groupId: inner, campusId: north };
    const first = await post(peopleUrl(), "admin", body);
    expect(first.status).toBe(201);
    const twin = await post(peopleUrl(), "admin", { ...body, firstName: " fatima " });
    expect([twin.status, twin.json.error.code]).toEqual([409, "POSSIBLE_DUPLICATE"]);
    const confirmed = await post(peopleUrl(), "admin", { ...body, confirmNamesake: true });
    expect(confirmed.status, confirmed.text).toBe(201);
    const audit = await db.programAudit.findFirstOrThrow({ where: { programId, targetId: idOf(confirmed), action: "PERSON_ADDED" } });
    expect(JSON.stringify(audit.afterValue)).toContain('"namesakeConfirmed":true');
    const phone = { kind: "ADULT", firstName: "Phone", lastName: "One", phone: "0803 777 8899", groupId: inner, campusId: north };
    expect((await post(peopleUrl(), "admin", phone)).status).toBe(201);
    expect(
      (await post(peopleUrl(), "admin", { ...phone, firstName: "Phone", lastName: "Two", phone: "+234 803 777 8899" })).status,
      "a phone written another way",
    ).toBe(409);
  });
});

test.describe("adding a class", () => {
  test("without confirm it says who would be added and who is skipped; with it, one audited step adds them", async () => {
    const [one, two, expelled, archived, southKid] = [
      await pupil(north, {}, true),
      await pupil(north, { standing: "SUSPENDED" }, true),
      await pupil(north, { standing: "EXPELLED" }, true),
      await pupil(north, { archivedAt: new Date() }, true),
      await pupil(south, {}, true),
    ];
    const already = await pupil(north, {}, true);
    await addPupil(already);
    const preview = await post(`${peopleUrl()}/class`, "admin", { classArmId: armNorth, groupId: second, confirm: false });
    expect(preview.status, preview.text).toBe(200);
    expect(preview.json.data.added).toBe(0);
    const names = (rows: { name: string }[]) => rows.map((r) => r.name);
    expect(names(preview.json.data.willAdd)).toEqual(
      expect.arrayContaining([`${one.firstName} Program`, `${two.firstName} Program`, `${southKid.firstName} Program`]),
    );
    const reasons = Object.fromEntries(preview.json.data.skipped.map((s: { name: string; reason: string }) => [s.name, s.reason]));
    expect(reasons[`${expelled.firstName} Program`]).toBe("EXPELLED");
    expect(reasons[`${archived.firstName} Program`]).toBe("ARCHIVED");
    expect(reasons[`${already.firstName} Program`]).toBe("ALREADY_IN");
    expect(await db.programParticipant.count({ where: { programId, studentId: one.id } }), "a preview adds no one").toBe(0);
    const confirmed = await post(`${peopleUrl()}/class`, "admin", { classArmId: armNorth, groupId: second, confirm: true });
    expect(confirmed.status, confirmed.text).toBe(200);
    expect(confirmed.json.data.added).toBeGreaterThanOrEqual(3);
    expect(await db.programParticipant.count({ where: { programId, studentId: { in: [one.id, two.id] } } })).toBe(2);
    expect(
      await db.programParticipant.findFirst({ where: { programId, studentId: southKid.id } }),
      "through the pupil's own campus",
    ).toMatchObject({ campusId: south });
    // run again: everyone is already in
    const again = await post(`${peopleUrl()}/class`, "admin", { classArmId: armNorth, groupId: second, confirm: true });
    expect(again.json.data.added).toBe(0);
    expect(await db.programAudit.count({ where: { programId, action: "CLASS_ADDED" } })).toBeGreaterThanOrEqual(2);
  });

  test("a campus administrator adds only their own campus's pupils from a class; a class of another school is not found", async () => {
    const own = await pupil(north, {}, true);
    const other = await pupil(south, {}, true);
    const res = await post(`${peopleUrl()}/class`, "campusNorth", { classArmId: armNorth, groupId: inner, confirm: true });
    expect(res.status, res.text).toBe(200);
    expect(await db.programParticipant.count({ where: { programId, studentId: own.id } })).toBe(1);
    expect(await db.programParticipant.count({ where: { programId, studentId: other.id } })).toBe(0);
    const group = await db.classGroup.create({ data: { tenantId: b.id, name: "B class" } });
    const arm = await db.classArm.create({ data: { tenantId: b.id, classGroupId: group.id, name: "A" } });
    expect((await post(`${peopleUrl()}/class`, "admin", { classArmId: arm.id, groupId: inner, confirm: true })).status).toBe(404);
  });

  test("the candidates found are the campus's own records, and say who is already in or has left", async () => {
    const mine = await pupil(north, { firstName: "Searchme" });
    const theirs = await pupil(south, { firstName: "Searchme" });
    const inProgram = await pupil(north, { firstName: "Searchme" });
    await addPupil(inProgram);
    const asNorth = (await get(`${peopleUrl()}/candidates?kind=STUDENT&q=Searchme`, "campusNorth")).json.data as {
      id: string;
      note: string | null;
    }[];
    expect(asNorth.map((c) => c.id)).toEqual(expect.arrayContaining([mine.id, inProgram.id]));
    expect(asNorth.map((c) => c.id)).not.toContain(theirs.id);
    expect(asNorth.find((c) => c.id === inProgram.id)!.note).toBe("Already in this program");
    const all = (await get(`${peopleUrl()}/candidates?kind=STUDENT&q=Searchme`, "admin")).json.data as { id: string }[];
    expect(all.map((c) => c.id)).toContain(theirs.id);
    expect((await get(`${peopleUrl()}/candidates?kind=STUDENT&q=S`, "admin")).json.data, "one letter finds nothing").toEqual([]);
  });
});

test.describe("the guards around the tree, the campuses and the switch", () => {
  test("a group with an open place in it, or in a group inside it, is not archived; after they leave it is", async () => {
    const group = idOf(await post(`${programsUrl()}/${programId}/groups`, "admin", { name: uniq("Guarded") }));
    const child = idOf(await post(`${programsUrl()}/${programId}/groups`, "admin", { parentId: group, name: "Child" }));
    const id = idOf(
      await post(peopleUrl(), "admin", { kind: "ADULT", firstName: "Guard", lastName: "Case", groupId: child, campusId: north }),
    );
    const refused = await send(`${programsUrl()}/${programId}/groups/${group}`, "admin", "PATCH", { archived: true });
    expect(refused.status).toBe(409); // a live group inside it, first
    const refusedChild = await send(`${programsUrl()}/${programId}/groups/${child}`, "admin", "PATCH", { archived: true });
    expect([refusedChild.status, refusedChild.json.error.code]).toEqual([409, "HAS_PEOPLE"]);
    expect((await post(`${peopleUrl()}/${id}/place`, "admin", { action: "withdraw", reason: REASON })).status).toBe(200);
    expect((await send(`${programsUrl()}/${programId}/groups/${child}`, "admin", "PATCH", { archived: true })).status).toBe(200);
    // an archived group is not a place to move or add to, and re-enrolling into it asks for another
    expect((await post(`${peopleUrl()}/${id}/place`, "admin", { action: "reenrol", reason: REASON })).json.error.code).toBe(
      "GROUP_ARCHIVED",
    );
    expect((await post(`${peopleUrl()}/${id}/place`, "admin", { action: "reenrol", reason: REASON, groupId: second })).status).toBe(200);
  });

  test("a campus cannot leave a program while people are or were in it through that campus", async () => {
    const campusOnly = idOf(
      await post(programsUrl(), "admin", { name: uniq("Two"), kind: "ONGOING", campusIds: [north, south], levelLabels: ["One"] }),
    );
    await post(`${programsUrl()}/${campusOnly}/status`, "admin", { action: "activate" });
    const g = idOf(await post(`${programsUrl()}/${campusOnly}/groups`, "admin", { name: "G" }));
    const added = await post(peopleUrl(campusOnly), "admin", {
      kind: "ADULT",
      firstName: "Camp",
      lastName: "Us",
      groupId: g,
      campusId: south,
    });
    expect(added.status, added.text).toBe(201);
    const refused = await send(`${programsUrl()}/${campusOnly}/campuses/${south}`, "admin", "DELETE");
    expect([refused.status, refused.json.error.code]).toEqual([409, "CAMPUS_HAS_PEOPLE"]);
    await post(`${peopleUrl(campusOnly)}/${idOf(added)}/place`, "admin", { action: "withdraw", reason: REASON });
    expect(
      (await send(`${programsUrl()}/${campusOnly}/campuses/${south}`, "admin", "DELETE")).json.error.code,
      "a person who left keeps their history with the campus",
    ).toBe("CAMPUS_HAS_PEOPLE");
  });

  test("a campus the program does not run in is not found; a campus that switched programs off is refused; an archived program and a switched-off school are read only", async () => {
    const northOnly = idOf(
      await post(programsUrl(), "admin", { name: uniq("North"), kind: "ONGOING", campusIds: [north], levelLabels: ["One"] }),
    );
    await post(`${programsUrl()}/${northOnly}/status`, "admin", { action: "activate" });
    const g = idOf(await post(`${programsUrl()}/${northOnly}/groups`, "admin", { name: "G" }));
    expect((await post(peopleUrl(northOnly), "admin", { kind: "STUDENT", studentId: (await pupil(south)).id, groupId: g })).status).toBe(
      404,
    );
    expect(
      (await post(peopleUrl(northOnly), "admin", { kind: "ADULT", firstName: "No", lastName: "Campus", groupId: g, campusId: south }))
        .status,
    ).toBe(404);
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: north, key: "programs.enabled", value: false, updatedById: people.admin.id },
    });
    const off = await addPupil(await pupil(north), "admin");
    expect([off.status, off.json.error.code]).toEqual([409, "CAMPUS_PROGRAMS_OFF"]);
    await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "programs.enabled" } });
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "programs.enabled", value: false, updatedById: people.admin.id },
    });
    const school = await addPupil(await pupil(north), "admin");
    expect([school.status, school.json.error.code]).toEqual([409, "PROGRAMS_OFF"]);
    await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "programs.enabled" } });
    await post(`${programsUrl()}/${northOnly}/status`, "admin", { action: "archive" });
    expect(
      (await post(peopleUrl(northOnly), "admin", { kind: "ADULT", firstName: "Late", lastName: "Comer", groupId: g, campusId: north })).json
        .error.code,
    ).toBe("PROGRAM_READ_ONLY");
    expect((await get(peopleUrl(northOnly), "admin")).status, "an archived program can still be read").toBe(200);
  });
});

test.describe("what the database refuses by itself", () => {
  const base = () => ({ tenantId: a.id, programId, groupId: inner, joinedOn: new Date(), createdByUserId: people.admin.id });
  test("a linked person keeps no details on the row, a child needs a guardian, a linked person's standing is the school's, and a place does not end before it starts", async () => {
    const record = await pupil(north);
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: record.id, firstName: "Copy" } }),
    ).rejects.toThrow();
    await expect(db.programParticipant.create({ data: { ...base(), kind: "STUDENT" } })).rejects.toThrow();
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: record.id, standing: "SUSPENDED" } }),
    ).rejects.toThrow();
    await expect(db.programParticipant.create({ data: { ...base(), kind: "CHILD", firstName: "K", lastName: "L" } })).rejects.toThrow();
    await expect(db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: " ", lastName: "L" } })).rejects.toThrow();
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "L", standingUntil: new Date() } }),
    ).rejects.toThrow();
    await expect(
      db.programParticipant.create({
        data: {
          ...base(),
          kind: "ADULT",
          firstName: "A",
          lastName: "L",
          joinedOn: new Date("2026-02-02"),
          endedOn: new Date("2026-01-01"),
          status: "WITHDRAWN",
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "L", endedOn: new Date() } }),
      "an active place has not ended",
    ).rejects.toThrow();
  });
  test("a place names a group of its own program and a record of its own school; a person is in a program once", async () => {
    const other = idOf(
      await post(programsUrl(), "admin", { name: uniq("Else"), kind: "ONGOING", campusIds: [north], levelLabels: ["One"] }),
    );
    const foreign = idOf(await post(`${programsUrl()}/${other}/groups`, "admin", { name: "Foreign" }));
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "ADULT", firstName: "A", lastName: "L", groupId: foreign } }),
    ).rejects.toThrow();
    const theirs = await db.studentRecord.create({
      data: { tenantId: b.id, firstName: "T", lastName: "S", dateOfBirth: new Date("2012-01-01"), admissionNo: uniq("X/") },
    });
    await expect(db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: theirs.id } })).rejects.toThrow();
    const record = await pupil(north);
    await db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: record.id, campusId: north } });
    await expect(
      db.programParticipant.create({ data: { ...base(), kind: "STUDENT", studentId: record.id, campusId: north } }),
    ).rejects.toThrow();
  });
});
