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

// Programs, slice P3 (task 0027): program staff and attendance over real HTTP. The roles and who names whom, the groups a teacher or a recorder is assigned to, the roll of a group, the
// 7-day window, a supervisor's corrections (always with a reason), stale versions, a suspended person, what a campus administrator sees, the three levels of the switch, the numbers.
//
// School A has two campuses, North and South. School B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
let programId: string;
let top: string;
let inner: string;
let other: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
const place: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const programUrl = (id = programId) => `${school()}/programs/${id}`;
const get = (url: string, who: string) => api(url, as(who));
const send = (url: string, who: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) =>
  api(url, { ...as(who), method, ...(body ? { body } : {}) });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const idOf = (res: { json: { data: { id: string } } }) => res.json.data.id;

type RollRow = {
  participantId: string;
  name: string;
  canEdit: boolean;
  flag: string | null;
  listed: boolean;
  campusOff: boolean;
  mark: { status: string; version: number; markedBy: string } | null;
};
const rollUrl = (groupId: string, date: string, label = "") =>
  `${programUrl()}/attendance?groupId=${groupId}&date=${date}&label=${encodeURIComponent(label)}`;
const roll = async (who: string, groupId = top, date = day(0), label = "") =>
  (await get(rollUrl(groupId, date, label), who)).json.data as {
    rows: RollRow[];
    rights: { create: boolean; change: boolean; reasonOnChange: boolean };
    sessionId: string | null;
  };
const mark = (who: string, marks: object[], over: Record<string, unknown> = {}) =>
  send(`${programUrl()}/attendance`, who, "PUT", { groupId: top, date: day(0), marks, ...over });

/// A pupil added to the program in `groupId`, through `campusId`.
async function member(campusId: string | null, groupId = inner, over: Record<string, unknown> = {}) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Learner"),
      lastName: "Roll",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("RL/"),
      ...over,
    },
  });
  const res = await send(`${programUrl()}/people`, "admin", "POST", { kind: "STUDENT", studentId: record.id, groupId });
  expect(res.status, res.text).toBe(201);
  // joined long ago, so that the roll of an earlier day lists them
  await db.programParticipant.update({ where: { id: idOf(res) }, data: { joinedOn: new Date(day(-60)) } });
  return { record, id: idOf(res) };
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Attendance School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Attendance School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusNorth", "progAdmin", "supervisor", "teacher", "recorder", "idle", "outsider", "pupilUser", "adminB"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  for (const who of ["progAdmin", "supervisor", "teacher", "recorder", "idle"])
    await addMembership(people[who].id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.outsider.id, a.id, Role.TEACHING_STAFF, south); // a campus the program does not run in
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, north);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);

  const made = await send(`${school()}/programs`, "admin", "POST", {
    name: uniq("Hifz"),
    kind: "ONGOING",
    campusIds: [north],
    levelLabels: ["Section", "Class"],
  });
  expect(made.status, made.text).toBe(201);
  programId = idOf(made);
  expect((await send(`${programUrl()}/status`, "admin", "POST", { action: "activate" })).status).toBe(200);
  top = idOf(await send(`${programUrl()}/groups`, "admin", "POST", { name: "Juz A" }));
  inner = idOf(await send(`${programUrl()}/groups`, "admin", "POST", { parentId: top, name: "Group 1" }));
  other = idOf(await send(`${programUrl()}/groups`, "admin", "POST", { name: "Juz B" }));
  place.progAdmin = idOf(await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.progAdmin.id, role: "ADMIN" }));
  place.supervisor = idOf(await send(`${programUrl()}/staff`, "progAdmin", "POST", { userId: people.supervisor.id, role: "SUPERVISOR" }));
  place.teacher = idOf(await send(`${programUrl()}/staff`, "progAdmin", "POST", { userId: people.teacher.id, role: "TEACHER" }));
  place.recorder = idOf(await send(`${programUrl()}/staff`, "progAdmin", "POST", { userId: people.recorder.id, role: "RECORDER" }));
  expect((await send(`${programUrl()}/staff/${place.teacher}/groups`, "progAdmin", "PUT", { groupIds: [top] })).status).toBe(200);
  expect((await send(`${programUrl()}/staff/${place.recorder}/groups`, "progAdmin", "PUT", { groupIds: [other] })).status).toBe(200);
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({
    where: { tenantId: a.id, key: { in: ["programs.enabled", "programs.attendance.enabled", "standing.campusAdminMaySuspend"] } },
  });
  await db.program.update({ where: { id: programId }, data: { attendanceEnabled: true } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("naming staff and giving them groups", () => {
  test("the school's administrator names every role; a program admin names all but another admin; a campus administrator, a teacher and the rest name no one", async () => {
    const body = (userId: string, role: string) => ({ userId, role });
    expect(
      (await send(`${programUrl()}/staff`, "progAdmin", "POST", body(people.idle.id, "ADMIN"))).status,
      "a program admin cannot promote",
    ).toBe(403);
    expect((await send(`${programUrl()}/staff`, "campusNorth", "POST", body(people.idle.id, "TEACHER"))).status).toBe(403);
    expect((await send(`${programUrl()}/staff`, "teacher", "POST", body(people.idle.id, "TEACHER"))).status).toBe(403);
    expect((await send(`${programUrl()}/staff`, "pupilUser", "POST", body(people.idle.id, "TEACHER"))).status).toBe(403);
    expect([403, 404]).toContain((await send(`${programUrl()}/staff`, "adminB", "POST", body(people.idle.id, "TEACHER"))).status);
    const named = await send(`${programUrl()}/staff`, "admin", "POST", body(people.idle.id, "RECORDER"));
    expect(named.status, named.text).toBe(201);
    const again = await send(`${programUrl()}/staff`, "admin", "POST", body(people.idle.id, "RECORDER"));
    expect([again.status, again.json.error.code]).toEqual([409, "ALREADY"]);
    expect((await send(`${programUrl()}/staff/${idOf(named)}`, "progAdmin", "DELETE")).status).toBe(200);
  });

  test("a person whose campus the program does not run in, a pupil and a stranger cannot be named", async () => {
    for (const who of ["outsider", "pupilUser"])
      expect((await send(`${programUrl()}/staff`, "admin", "POST", { userId: people[who].id, role: "TEACHER" })).status, who).toBe(400);
    expect((await send(`${programUrl()}/staff`, "admin", "POST", { userId: "no-such-user", role: "TEACHER" })).status).toBe(400);
    expect((await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.idle.id, role: "BOSS" })).status).toBe(400);
  });

  test("the candidates for a role are the staff who fit and do not hold it yet; a program admin sees none for ADMIN", async () => {
    const names = async (who: string, role: string) =>
      ((await get(`${programUrl()}/staff/candidates?role=${role}`, who)).json.data?.candidates ?? []).map(
        (c: { userId: string }) => c.userId,
      );
    expect(await names("admin", "TEACHER")).toContain(people.idle.id);
    expect(await names("admin", "TEACHER")).not.toContain(people.teacher.id);
    expect(await names("admin", "TEACHER")).not.toContain(people.outsider.id);
    expect((await get(`${programUrl()}/staff/candidates?role=ADMIN`, "progAdmin")).status).toBe(403);
    expect((await get(`${programUrl()}/staff/candidates?role=TEACHER`, "progAdmin")).status).toBe(200);
  });

  test("groups go to a teacher or a recorder only, in a live group of this program; a supervisor takes none; naming again starts with none; a group with staff in it is not archived", async () => {
    const url = (id: string) => `${programUrl()}/staff/${id}/groups`;
    expect((await send(url(place.supervisor), "admin", "PUT", { groupIds: [top] })).json.error.code).toBe("NO_GROUPS_FOR_ROLE");
    expect((await send(url(place.teacher), "admin", "PUT", { groupIds: ["no-such-group"] })).status).toBe(404);
    expect((await send(url(place.teacher), "teacher", "PUT", { groupIds: [top] })).status, "a teacher assigns nothing").toBe(403);
    const elsewhere = idOf(
      await send(`${school()}/programs`, "admin", "POST", {
        name: uniq("Else"),
        kind: "ONGOING",
        campusIds: [north],
        levelLabels: ["One"],
      }),
    );
    const foreign = idOf(await send(`${programUrl(elsewhere)}/groups`, "admin", "POST", { name: "Foreign" }));
    expect((await send(url(place.teacher), "admin", "PUT", { groupIds: [foreign] })).status, "a group of another program").toBe(404);
    const archive = await send(`${programUrl()}/groups/${other}`, "admin", "PATCH", { archived: true });
    expect([archive.status, archive.json.error.code]).toEqual([409, "HAS_STAFF"]);
    // end the recorder and name them again: the old assignment does not come back
    await send(`${programUrl()}/staff/${place.recorder}`, "admin", "DELETE");
    const back = await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.recorder.id, role: "RECORDER" });
    place.recorder = idOf(back);
    expect((await get(programUrl(), "admin")).json.data.staff.find((s: { id: string }) => s.id === place.recorder).groupIds).toEqual([]);
    await send(url(place.recorder), "admin", "PUT", { groupIds: [other] });
  });
});

test.describe("the roll", () => {
  test("a teacher sees the roll of their group and the groups inside it, once each; a group they are not assigned to is not found", async () => {
    const one = await member(north, inner);
    const two = await member(north, top);
    const rows = (await roll("teacher", top)).rows;
    expect(rows.map((r) => r.participantId)).toEqual(expect.arrayContaining([one.id, two.id]));
    expect(new Set(rows.map((r) => r.participantId)).size).toBe(rows.length);
    expect((await get(rollUrl(other, day(0)), "teacher")).status).toBe(404);
    expect((await get(rollUrl(top, day(0)), "idle")).status, "no place in the program").toBe(404);
    expect((await get(rollUrl(top, day(0)), "outsider")).status).toBe(404);
    expect((await get(rollUrl(top, day(0)), "pupilUser")).status).toBe(403);
    expect((await get(rollUrl("no-such-group", day(0)), "admin")).status).toBe(404);
  });

  test("marking takes the roll in one save, opens the session, shows who marked and rejects a second person for the same slot as an update", async () => {
    const one = await member(north);
    const two = await member(north);
    const saved = await mark("teacher", [
      { participantId: one.id, status: "PRESENT" },
      { participantId: two.id, status: "ABSENT", remarks: "sick" },
    ]);
    expect(saved.status, saved.text).toBe(200);
    expect(saved.json.data).toMatchObject({ created: 2, changed: 0 });
    const data = await roll("teacher");
    expect(data.sessionId).toBeTruthy();
    const row = data.rows.find((r) => r.participantId === two.id)!;
    expect(row.mark).toMatchObject({ status: "ABSENT", version: 1, markedBy: "teacher" });
    // the same marks again change nothing
    const again = await mark("teacher", [{ participantId: one.id, status: "PRESENT", version: 1 }]);
    expect(again.json.data).toMatchObject({ created: 0, changed: 0, unchanged: 1 });
    // a recorder of another group cannot mark this one
    expect((await mark("recorder", [{ participantId: one.id, status: "LATE" }])).status).toBe(404);
  });

  test("a mark that does not fit the roll fails the whole save, naming the person; a person twice and an empty or too-large save are refused", async () => {
    const good = await member(north);
    const foreign = await member(north, other);
    const before = await db.programAttendance.count({ where: { programId } });
    const res = await mark("teacher", [
      { participantId: good.id, status: "PRESENT" },
      { participantId: foreign.id, status: "PRESENT" },
    ]);
    expect([res.status, res.json.error.code]).toEqual([409, "NOT_ON_ROLL"]);
    expect(await db.programAttendance.count({ where: { programId } }), "nothing was saved").toBe(before);
    expect(
      (
        await mark("teacher", [
          { participantId: good.id, status: "PRESENT" },
          { participantId: good.id, status: "LATE" },
        ])
      ).json.error.code,
    ).toBe("DUPLICATE_MARK");
    expect((await mark("teacher", [])).status).toBe(400);
    expect((await mark("teacher", [{ participantId: good.id, status: "PRESENT", extra: 1 }])).status).toBe(400);
    expect((await mark("teacher", [{ participantId: good.id, status: "HERE" }])).status).toBe(400);
  });

  test("the window: a teacher marks today and the 6 days before, never a day that has not come; an administrator any past day; a day before the program started is refused", async () => {
    const who = await member(north);
    const at = (offset: number, user: string) => mark(user, [{ participantId: who.id, status: "PRESENT" }], { date: day(offset) });
    expect((await at(-6, "teacher")).status).toBe(200);
    const old = await at(-7, "teacher");
    expect([old.status, old.json.error.code]).toEqual([403, "OUTSIDE_WINDOW"]);
    expect((await at(1, "teacher")).json.error.code).toBe("FUTURE_DAY");
    expect((await at(1, "admin")).json.error.code).toBe("FUTURE_DAY");
    expect((await at(-40, "admin")).status).toBe(200);
    expect((await mark("admin", [{ participantId: who.id, status: "PRESENT" }], { date: "2026-13-40" })).status).toBe(400);
    await db.program.update({ where: { id: programId }, data: { startsOn: new Date(day(-3)) } });
    expect((await at(-5, "admin")).json.error.code).toBe("BEFORE_START");
    await db.program.update({ where: { id: programId }, data: { startsOn: null } });
  });

  test("two sessions on one day are told apart by their names", async () => {
    const who = await member(north);
    expect((await mark("teacher", [{ participantId: who.id, status: "PRESENT" }], { label: "Morning" })).status).toBe(200);
    expect((await mark("teacher", [{ participantId: who.id, status: "ABSENT" }], { label: "After Asr" })).status).toBe(200);
    expect((await roll("teacher", top, day(0), "Morning")).rows.find((r) => r.participantId === who.id)!.mark!.status).toBe("PRESENT");
    expect((await roll("teacher", top, day(0), "After Asr")).rows.find((r) => r.participantId === who.id)!.mark!.status).toBe("ABSENT");
    expect(await db.programSession.count({ where: { programId, groupId: top, date: new Date(day(0)) } })).toBeGreaterThanOrEqual(2);
  });
});

test.describe("corrections", () => {
  test("a stale version is refused; a change by the one who marked keeps who marked first, and leaves a history row", async () => {
    const who = await member(north);
    await mark("teacher", [{ participantId: who.id, status: "PRESENT" }]);
    const version = (await roll("teacher")).rows.find((r) => r.participantId === who.id)!.mark!.version;
    const stale = await mark("teacher", [{ participantId: who.id, status: "LATE", version: version + 5 }]);
    expect([stale.status, stale.json.error.code]).toEqual([409, "CHANGED"]);
    expect((await mark("teacher", [{ participantId: who.id, status: "LATE" }])).json.error.code, "no version for a mark that exists").toBe(
      "CHANGED",
    );
    const fixed = await mark("teacher", [{ participantId: who.id, status: "LATE", version }]);
    expect(fixed.json.data).toMatchObject({ changed: 1 });
    const row = (await roll("admin")).rows.find((r) => r.participantId === who.id)!;
    expect(row.mark).toMatchObject({ status: "LATE", version: version + 1, markedBy: "teacher" });
    const history = (await get(`${programUrl()}/attendance/people/${who.id}`, "admin")).json.data;
    expect(history.marks[0].changes).toHaveLength(1);
    expect(history.marks[0].changes[0]).toMatchObject({ from: "PRESENT", to: "LATE" });
  });

  test("a supervisor corrects what exists, always with a reason, and cannot add a mark; a correction of an old day by an administrator needs a reason too", async () => {
    const who = await member(north);
    const blank = await member(north);
    await mark("teacher", [{ participantId: who.id, status: "PRESENT" }]);
    const rows = (await roll("supervisor")).rows;
    const version = rows.find((r) => r.participantId === who.id)!.mark!.version;
    expect((await roll("supervisor")).rights).toMatchObject({ create: false, change: true, reasonOnChange: true });
    const noReason = await mark("supervisor", [{ participantId: who.id, status: "ABSENT", version }]);
    expect([noReason.status, noReason.json.error.code]).toEqual([400, "REASON_REQUIRED"]);
    const adds = await mark("supervisor", [{ participantId: blank.id, status: "PRESENT" }]);
    expect([adds.status, adds.json.error.code]).toEqual([403, "FORBIDDEN"]);
    const ok = await mark("supervisor", [{ participantId: who.id, status: "ABSENT", version }], { reason: "Was at the doctor" });
    expect(ok.status, ok.text).toBe(200);
    const history = (await get(`${programUrl()}/attendance/people/${who.id}`, "admin")).json.data;
    expect(history.marks[0].changes[0]).toMatchObject({ reason: "Was at the doctor", by: "supervisor" });
    // an administrator marks an old day freely, but changing it again needs a reason
    await mark("admin", [{ participantId: who.id, status: "PRESENT" }], { date: day(-30) });
    const old = (await roll("admin", top, day(-30))).rows.find((r) => r.participantId === who.id)!.mark!;
    expect(
      (await mark("admin", [{ participantId: who.id, status: "LATE", version: old.version }], { date: day(-30) })).json.error.code,
    ).toBe("REASON_REQUIRED");
  });
});

test.describe("standing, campuses and the switches", () => {
  test("a suspended person is listed and flagged today but cannot be marked; an earlier day's roll is not rewritten by today's standing", async () => {
    const who = await member(north);
    await mark("admin", [{ participantId: who.id, status: "PRESENT" }], { date: day(-2) });
    await db.studentRecord.update({ where: { id: who.record.id }, data: { standing: "SUSPENDED" } });
    const today = (await roll("teacher")).rows.find((r) => r.participantId === who.id)!;
    expect(today).toMatchObject({ flag: "SUSPENDED", canEdit: false });
    const refused = await mark("teacher", [{ participantId: who.id, status: "PRESENT" }]);
    expect([refused.status, refused.json.error.code]).toEqual([409, "NOT_MARKABLE"]);
    const earlier = (await roll("teacher", top, day(-2))).rows.find((r) => r.participantId === who.id)!;
    expect(earlier).toMatchObject({ flag: null, canEdit: true });
    await db.studentRecord.update({ where: { id: who.record.id }, data: { standing: "EXPELLED" } });
    expect(
      (await roll("teacher")).rows.some((r) => r.participantId === who.id),
      "an expelled person is off today's roll",
    ).toBe(false);
    expect(
      (await roll("teacher", top, day(-2))).rows.some((r) => r.participantId === who.id),
      "and on the earlier day's",
    ).toBe(true);
  });

  test("a campus administrator reads the roll of their campus's people and marks none; a person who left is not on a new roll", async () => {
    const mine = await member(north);
    const res = await roll("campusNorth");
    expect(res.rows.some((r) => r.participantId === mine.id)).toBe(true);
    expect(res.rights).toMatchObject({ create: false, change: false });
    expect((await mark("campusNorth", [{ participantId: mine.id, status: "PRESENT" }])).status).toBe(403);
    await send(`${programUrl()}/people/${mine.id}/place`, "admin", "POST", { action: "withdraw", reason: "Moved away" });
    expect((await roll("teacher")).rows.some((r) => r.participantId === mine.id)).toBe(false);
  });

  test("attendance off at the school, the campus or the program: marking is refused with ATTENDANCE_OFF, reading still works, and the flag shows in the program", async () => {
    const who = await member(north);
    await mark("teacher", [{ participantId: who.id, status: "PRESENT" }]);
    const off = async (why: string) => {
      const res = await mark("teacher", [{ participantId: who.id, status: "LATE", version: 1 }]);
      expect([res.status, res.json.error.code], why).toEqual([409, "ATTENDANCE_OFF"]);
      expect((await get(rollUrl(top, day(0)), "teacher")).status, `${why}: reading`).toBe(200);
      expect((await get(programUrl(), "teacher")).json.data.attendance).toMatchObject({ on: false });
    };
    await db.program.update({ where: { id: programId }, data: { attendanceEnabled: false } });
    await off("the program's own switch");
    await db.program.update({ where: { id: programId }, data: { attendanceEnabled: true } });
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "programs.attendance.enabled", value: false, updatedById: people.admin.id },
    });
    await off("the school's switch");
    await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "programs.attendance.enabled" } });
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: north, key: "programs.attendance.enabled", value: false, updatedById: people.admin.id },
    });
    await off("every campus the program runs in");
  });

  test("the program's settings: the school's administrator and a program admin change them, others cannot; a number out of range and an unknown key are refused", async () => {
    const url = `${programUrl()}/settings`;
    expect((await send(url, "progAdmin", "PATCH", { lowAttendancePercent: 60 })).status).toBe(200);
    expect((await get(programUrl(), "admin")).json.data.settings).toMatchObject({ lowAttendancePercent: 60 });
    expect((await send(url, "admin", "PATCH", { lowAttendancePercent: 75 })).status).toBe(200);
    for (const who of ["campusNorth", "teacher", "supervisor"])
      expect((await send(url, who, "PATCH", { lowAttendancePercent: 10 })).status, who).toBe(403);
    expect((await send(url, "admin", "PATCH", { lowAttendancePercent: 0 })).status).toBe(400);
    expect((await send(url, "admin", "PATCH", { lowAttendancePercent: 101 })).status).toBe(400);
    expect((await send(url, "admin", "PATCH", { colour: "red" })).status).toBe(400);
    expect((await send(url, "admin", "PATCH", {})).status).toBe(400);
    expect((await get(programUrl(), "teacher")).json.data.settings, "settings are for those who manage").toBeNull();
  });

  test("the school's attendance switch has the same rules as the others: the school with a fresh proof, a campus only to turn it off", async () => {
    const url = `${school()}/settings/programs-attendance`;
    expect((await get(url, "admin")).status).toBe(200);
    expect((await send(url, "admin", "PATCH", { scope: "SCHOOL", enabled: false })).status, "no proof").toBe(400);
    const done = await send(url, "admin", "PATCH", {
      scope: "SCHOOL",
      enabled: false,
      stepUp: { type: "password", value: people.admin.password },
    });
    expect(done.status, done.text).toBe(200);
    expect(
      (await send(url, "campusNorth", "PATCH", { scope: "CAMPUS", campusId: north, enabled: true })).status,
      "a campus cannot turn it on over the school",
    ).toBe(400);
    for (const who of ["teacher", "pupilUser"]) expect((await get(url, who)).status, who).toBe(403);
  });
});

test.describe("the numbers", () => {
  test("a summary counts each way, leaves excused out of the percentage, flags a person under the threshold, lists the lowest first, and shows only what the viewer may see", async () => {
    const [good, poor, excused] = [await member(north), await member(north), await member(north)];
    for (const [offset, status] of [
      [-1, "PRESENT"],
      [-2, "PRESENT"],
      [-3, "LATE"],
      [-4, "PRESENT"],
    ] as const)
      await mark(
        "admin",
        [
          { participantId: good.id, status },
          { participantId: poor.id, status: offset === -1 ? "PRESENT" : "ABSENT" },
          { participantId: excused.id, status: "EXCUSED" },
        ],
        { date: day(offset) },
      );
    const url = `${programUrl()}/attendance/summary?groupId=${top}&from=${day(-10)}&to=${day(0)}`;
    const summary = (await get(url, "admin")).json.data;
    const row = (id: string) => summary.rows.find((r: { participantId: string }) => r.participantId === id);
    expect(row(good.id)).toMatchObject({ percent: 100, low: false });
    expect(row(poor.id)).toMatchObject({ percent: 25, low: true });
    expect(row(excused.id)).toMatchObject({ percent: null, low: false });
    expect(row(excused.id).counts.excused).toBe(4);
    const order = summary.rows.map((r: { participantId: string }) => r.participantId);
    expect(order.indexOf(poor.id)).toBeLessThan(order.indexOf(good.id));
    expect(order.indexOf(good.id)).toBeLessThan(order.indexOf(excused.id));
    const asTeacher = (await get(url, "teacher")).json.data;
    expect(asTeacher.rows.some((r: { participantId: string }) => r.participantId === poor.id)).toBe(true);
    expect(
      (await get(`${programUrl()}/attendance/summary?groupId=${other}&from=${day(-10)}&to=${day(0)}`, "teacher")).status,
      "not their group",
    ).toBe(404);
    expect((await get(`${programUrl()}/attendance/summary?from=${day(0)}&to=${day(-10)}`, "admin")).json.error.code).toBe("BAD_RANGE");
    expect((await get(`${programUrl()}/attendance/summary?from=2020-01-01&to=2026-01-01`, "admin")).json.error.code).toBe("BAD_RANGE");
  });

  test("the sessions of a week, and a person's own history, follow the same reach", async () => {
    const who = await member(north);
    await mark("teacher", [{ participantId: who.id, status: "PRESENT" }]);
    const sessions = (await get(`${programUrl()}/attendance/sessions?from=${day(-6)}&to=${day(0)}`, "teacher")).json.data.sessions as {
      groupId: string;
    }[];
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.groupId === top || s.groupId === inner)).toBe(true);
    expect((await get(`${programUrl()}/attendance/people/${who.id}`, "teacher")).status).toBe(200);
    expect((await get(`${programUrl()}/attendance/people/${who.id}`, "recorder")).status, "not their group").toBe(404);
    expect((await get(`${programUrl()}/attendance/people/no-such`, "admin")).status).toBe(404);
  });
});
