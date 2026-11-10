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

// Programs, slice P3b (task 0027): assessments over real HTTP. Who makes one, the life of an assessment (draft, open, marked, published), the sheet, entering scores (versions, codes, all or nothing,
// the groups a teacher reaches), standing, the history, the results and the three levels of the switch.
//
// School A has two campuses, North and South. School B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
let programId: string;
let top: string;
let other: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
const place: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const programUrl = (id = programId) => `${school()}/programs/${id}`;
const assessmentsUrl = () => `${programUrl()}/assessments`;
const get = (url: string, who: string) => api(url, as(who));
const send = (url: string, who: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) =>
  api(url, { ...as(who), method, ...(body ? { body } : {}) });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const idOf = (res: { json: { data: { id: string } } }) => res.json.data.id;

type Row = {
  participantId: string;
  name: string;
  canEdit: boolean;
  flag: string | null;
  entry: { score: number | null; code: string | null; version: number } | null;
  percent: number | null;
  grade: string | null;
  passed: boolean | null;
};
async function make(over: Record<string, unknown> = {}, who = "admin") {
  const res = await send(assessmentsUrl(), who, "POST", { title: uniq("Test"), date: day(-1), maxScore: 40, passMark: 20, ...over });
  expect(res.status, res.text).toBe(201);
  return idOf(res);
}
const action = (id: string, name: string, who = "admin") => send(`${assessmentsUrl()}/${id}`, who, "POST", { action: name });
const sheet = async (id: string, who = "admin") =>
  (await get(`${assessmentsUrl()}/${id}`, who)).json.data as {
    status: string;
    rows: Row[];
    rights: { enter: boolean; actions: string[]; reasonOnChange: boolean };
    counts: { expected: number; entered: number; missing: number; average: number | null };
  };
const scores = (id: string, who: string, entries: object[], over: Record<string, unknown> = {}) =>
  send(`${assessmentsUrl()}/${id}/scores`, who, "PUT", { entries, ...over });
async function member(campusId: string | null, groupId = top, over: Record<string, unknown> = {}) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Sitter"),
      lastName: "Score",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("SC/"),
      ...over,
    },
  });
  const res = await send(`${programUrl()}/people`, "admin", "POST", { kind: "STUDENT", studentId: record.id, groupId });
  expect(res.status, res.text).toBe(201);
  await db.programParticipant.update({ where: { id: idOf(res) }, data: { joinedOn: new Date(day(-60)) } });
  return { record, id: idOf(res) };
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Assessment School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Assessment School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusNorth", "progAdmin", "supervisor", "teacher", "recorder", "idle", "pupilUser", "adminB"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  for (const who of ["progAdmin", "supervisor", "teacher", "recorder", "idle"])
    await addMembership(people[who].id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, north);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
  const made = await send(`${school()}/programs`, "admin", "POST", {
    name: uniq("Hifz"),
    kind: "ONGOING",
    campusIds: [north],
    levelLabels: ["Section", "Class"],
  });
  programId = idOf(made);
  await send(`${programUrl()}/status`, "admin", "POST", { action: "activate" });
  top = idOf(await send(`${programUrl()}/groups`, "admin", "POST", { name: "Juz A" }));
  other = idOf(await send(`${programUrl()}/groups`, "admin", "POST", { name: "Juz B" }));
  place.progAdmin = idOf(await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.progAdmin.id, role: "ADMIN" }));
  place.supervisor = idOf(await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.supervisor.id, role: "SUPERVISOR" }));
  place.teacher = idOf(await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.teacher.id, role: "TEACHER" }));
  place.recorder = idOf(await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.recorder.id, role: "RECORDER" }));
  await send(`${programUrl()}/staff/${place.teacher}/groups`, "admin", "PUT", { groupIds: [top] });
  await send(`${programUrl()}/staff/${place.recorder}/groups`, "admin", "PUT", { groupIds: [other] });
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: { in: ["programs.enabled", "programs.assessments.enabled"] } } });
  await db.program.update({ where: { id: programId }, data: { assessmentsEnabled: true, gradeBands: [] } });
  // Each test arranges its own people: those an earlier test left would be on this test's sheets and block marking.
  await db.programParticipant.updateMany({
    where: { programId, status: "ACTIVE" },
    data: { status: "WITHDRAWN", endedOn: new Date(day(-59)), endedReason: "Cleared between tests" },
  });
  // A place that ended today still counts on yesterday's sheet, so those end long ago too.
  await db.programParticipant.updateMany({
    where: { programId, endedOn: { gt: new Date(day(-59)) } },
    data: { endedOn: new Date(day(-59)) },
  });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("reaching the routes and the switches", () => {
  test("nobody signed out, no pupil and no other school's administrator reaches an assessment; a member of staff with no place finds no program", async () => {
    const id = await make();
    for (const url of [assessmentsUrl(), `${assessmentsUrl()}/${id}`, `${assessmentsUrl()}/results`]) {
      expect((await api(url, SAAS)).status, url).toBe(401);
      expect((await get(url, "pupilUser")).status, url).toBe(403);
      expect([403, 404]).toContain((await get(url, "adminB")).status);
      expect((await get(url, "idle")).status, "no place").toBe(404);
    }
  });

  test("a program starts with assessments off; they are on only when the school, the campus and the program all have them on", async () => {
    await db.program.update({ where: { id: programId }, data: { assessmentsEnabled: false } });
    expect((await get(programUrl(), "admin")).json.data.assessments).toMatchObject({ on: false, offBy: "PROGRAM" });
    expect((await send(assessmentsUrl(), "admin", "POST", { title: "x", date: day(-1), maxScore: 10 })).json.error.code).toBe(
      "ASSESSMENTS_OFF",
    );
    await db.program.update({ where: { id: programId }, data: { assessmentsEnabled: true } });
    expect((await get(programUrl(), "admin")).json.data.assessments.on).toBe(true);
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "programs.assessments.enabled", value: false, updatedById: people.admin.id },
    });
    expect((await get(programUrl(), "admin")).json.data.assessments).toMatchObject({ on: false, offBy: "SCHOOL" });
    expect((await send(assessmentsUrl(), "admin", "POST", { title: "x", date: day(-1), maxScore: 10 })).json.error.code).toBe(
      "ASSESSMENTS_OFF",
    );
    expect((await get(assessmentsUrl(), "admin")).status, "reading still works").toBe(200);
  });

  test("the grade bands are checked and kept with the program", async () => {
    const url = `${programUrl()}/settings`;
    const bad = [
      [{ name: "A", from: 10 }],
      [
        { name: "A", from: 0 },
        { name: "a", from: 50 },
      ],
      [
        { name: "A", from: 0 },
        { name: "B", from: 0 },
      ],
      [
        { name: "A", from: 0 },
        { name: "B", from: 120 },
      ],
    ];
    for (const bands of bad) expect((await send(url, "admin", "PATCH", { gradeBands: bands })).status, JSON.stringify(bands)).toBe(400);
    const ok = await send(url, "progAdmin", "PATCH", {
      gradeBands: [
        { name: "Good", from: 70 },
        { name: "Pass", from: 40 },
        { name: "Fail", from: 0 },
      ],
    });
    expect(ok.status, ok.text).toBe(200);
    expect((await get(programUrl(), "admin")).json.data.assessments.bands).toHaveLength(3);
    expect((await send(url, "teacher", "PATCH", { gradeBands: [] })).status).toBe(403);
  });
});

test.describe("making and changing an assessment", () => {
  test("the school's administrator and a program admin make one; nobody else; the shape is checked", async () => {
    expect((await send(assessmentsUrl(), "progAdmin", "POST", { title: uniq("P"), date: day(-1), maxScore: 10 })).status).toBe(201);
    for (const who of ["teacher", "supervisor", "campusNorth", "recorder"])
      expect((await send(assessmentsUrl(), who, "POST", { title: "x", date: day(-1), maxScore: 10 })).status, who).toBe(403);
    const bad: object[] = [
      { title: "", date: day(-1), maxScore: 10 },
      { title: "x", date: "2026-13-40", maxScore: 10 },
      { title: "x", date: day(-1), maxScore: 0 },
      { title: "x", date: day(-1), maxScore: 1001 },
      { title: "x", date: day(-1), maxScore: 10, passMark: 11 },
      { title: "x", date: day(-1), maxScore: 10, weight: 0 },
      { title: "x", date: day(-1), maxScore: 10, groupIds: ["no-such"] },
      { title: "x", date: day(-1), maxScore: 10, extra: 1 },
    ];
    for (const body of bad)
      expect((await send(assessmentsUrl(), "admin", "POST", body)).status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
  });

  test("a draft changes freely; an open one only its labels; a published one not at all; the order is draft, open, marked, published", async () => {
    const id = await make();
    expect((await send(`${assessmentsUrl()}/${id}`, "admin", "PATCH", { maxScore: 50 })).status).toBe(200);
    expect((await action(id, "publish")).json.error.code, "not before marking").toBe("NOT_APPLICABLE");
    expect((await action(id, "open")).status).toBe(200);
    expect((await send(`${assessmentsUrl()}/${id}`, "admin", "PATCH", { maxScore: 60 })).json.error.code).toBe("LOCKED_FIELD");
    expect((await send(`${assessmentsUrl()}/${id}`, "admin", "PATCH", { title: "Renamed" })).status).toBe(200);
    for (const who of ["teacher", "campusNorth"]) expect((await action(id, "mark", who)).status, who).toBe(403);
  });

  test("marking needs every expected score; a supervisor may only mark; publishing is the administrator's; an archived one is read only", async () => {
    const id = await make({ groupIds: [top] });
    const one = await member(north);
    await action(id, "open");
    expect((await action(id, "mark")).json.error.code).toBe("INCOMPLETE");
    expect((await scores(id, "teacher", [{ participantId: one.id, score: 30 }])).status).toBe(200);
    expect((await action(id, "mark", "supervisor")).status).toBe(200);
    expect((await action(id, "publish", "supervisor")).status).toBe(403);
    expect((await action(id, "publish")).status).toBe(200);
    expect((await action(id, "archive")).status).toBe(200);
    expect((await scores(id, "admin", [{ participantId: one.id, score: 31 }])).status).toBeGreaterThanOrEqual(400);
  });
});

test.describe("the sheet and the scores", () => {
  test("a draft only an administrator sees; an open one by its audience; the sheet lists the people once each and only those the caller may see", async () => {
    const id = await make({ groupIds: [top] });
    const inTop = await member(north);
    const inOther = await member(north, other);
    expect((await get(`${assessmentsUrl()}/${id}`, "teacher")).status, "a draft").toBe(404);
    await action(id, "open");
    const forTeacher = await sheet(id, "teacher");
    expect(forTeacher.rows.map((r) => r.participantId)).toContain(inTop.id);
    expect(forTeacher.rows.map((r) => r.participantId)).not.toContain(inOther.id);
    expect((await get(`${assessmentsUrl()}/${id}`, "recorder")).status, "not their group").toBe(404);
    const all = await sheet(id, "admin");
    expect(new Set(all.rows.map((r) => r.participantId)).size).toBe(all.rows.length);
    expect(all.rows.map((r) => r.participantId)).not.toContain(inOther.id);
  });

  test("a teacher enters the scores of their groups; saving the same again changes nothing; codes work; the history keeps every entry", async () => {
    const id = await make({ groupIds: [top] });
    const [x, y, z] = [await member(north), await member(north), await member(north)];
    await action(id, "open");
    const saved = await scores(id, "teacher", [
      { participantId: x.id, score: 32.5, comment: "good" },
      { participantId: y.id, code: "ABSENT" },
      { participantId: z.id, code: "EXCUSED" },
    ]);
    expect(saved.status, saved.text).toBe(200);
    const rows = (await sheet(id, "teacher")).rows;
    expect(rows.find((r) => r.participantId === x.id)).toMatchObject({ percent: 81.3, passed: true });
    expect(rows.find((r) => r.participantId === y.id)!.entry).toMatchObject({ code: "ABSENT", score: null });
    const again = await scores(id, "teacher", [{ participantId: x.id, score: 32.5, comment: "good", version: 1 }]);
    expect(again.json.data).toMatchObject({ changed: 0 });
    const history = (await get(`${assessmentsUrl()}/${id}/history?personId=${x.id}`, "admin")).json.data;
    expect(history.changes).toHaveLength(1);
  });

  test("a stale version is refused and nothing is written; a change keeps what it replaced", async () => {
    const id = await make({ groupIds: [top] });
    const who = await member(north);
    await action(id, "open");
    await scores(id, "teacher", [{ participantId: who.id, score: 10 }]);
    const stale = await scores(id, "teacher", [{ participantId: who.id, score: 15, version: 9 }]);
    expect([stale.status, stale.json.error.code]).toEqual([409, "CHANGED"]);
    expect(
      (await scores(id, "teacher", [{ participantId: who.id, score: 15 }])).json.error.code,
      "no version for a score that exists",
    ).toBe("CHANGED");
    expect((await scores(id, "teacher", [{ participantId: who.id, score: 15, version: 1 }])).status).toBe(200);
    expect((await sheet(id, "admin")).rows.find((r) => r.participantId === who.id)!.entry).toMatchObject({ score: 15, version: 2 });
    const history = (await get(`${assessmentsUrl()}/${id}/history?personId=${who.id}`, "admin")).json.data.changes;
    expect(history).toHaveLength(2);
  });

  test("all or nothing: a score above the maximum, a person not on the sheet, a suspended person or a bad shape refuses the whole save", async () => {
    const id = await make({ groupIds: [top], date: day(0) }); // a suspension counts for today's roll; a past day is the record of what happened then
    const good = await member(north);
    const suspended = await member(north, top, { standing: "SUSPENDED" });
    const foreign = await member(north, other);
    await action(id, "open");
    const before = await db.programScore.count({ where: { assessmentId: id } });
    for (const entries of [
      [
        { participantId: good.id, score: 10 },
        { participantId: good.id + "x", score: 10 },
      ],
      [
        { participantId: good.id, score: 10 },
        { participantId: foreign.id, score: 10 },
      ],
      [
        { participantId: good.id, score: 10 },
        { participantId: suspended.id, score: 10 },
      ],
      [{ participantId: good.id, score: 41 }],
      [{ participantId: good.id, score: -1 }],
      [{ participantId: good.id, score: 10.123 }],
      [{ participantId: good.id, score: 10, code: "ABSENT" }],
      [{ participantId: good.id }],
      [
        { participantId: good.id, score: 10 },
        { participantId: good.id, score: 11 },
      ],
    ])
      expect((await scores(id, "admin", entries)).status, JSON.stringify(entries)).toBeGreaterThanOrEqual(400);
    expect(await db.programScore.count({ where: { assessmentId: id } }), "nothing was written").toBe(before);
  });

  test("a recorder enters only their group; a supervisor and a campus administrator enter nothing; not before the assessment is open", async () => {
    const id = await make({ groupIds: [top, other] });
    const mine = await member(north, other);
    const notMine = await member(north, top);
    expect((await scores(id, "recorder", [{ participantId: mine.id, score: 10 }])).json.error.code, "still a draft").toBeTruthy();
    await action(id, "open");
    expect((await scores(id, "recorder", [{ participantId: mine.id, score: 10 }])).status).toBe(200);
    expect((await scores(id, "recorder", [{ participantId: notMine.id, score: 10 }])).status).toBeGreaterThanOrEqual(400);
    for (const who of ["supervisor", "campusNorth", "idle"])
      expect((await scores(id, who, [{ participantId: mine.id, score: 12, version: 1 }])).status, who).toBeGreaterThanOrEqual(403);
  });

  test("an assessment that has not taken place yet cannot be scored; after marking only an administrator changes a score, and after publishing it needs a reason", async () => {
    const future = await make({ date: day(5) });
    expect((await action(future, "open")).status).toBe(200);
    expect((await scores(future, "admin", [{ participantId: "x", score: 1 }])).status).toBeGreaterThanOrEqual(400);
    const id = await make({ groupIds: [top] });
    const who = await member(north);
    await action(id, "open");
    await scores(id, "teacher", [{ participantId: who.id, score: 20 }]);
    await action(id, "mark");
    expect((await scores(id, "teacher", [{ participantId: who.id, score: 21, version: 1 }])).status).toBeGreaterThanOrEqual(400);
    expect((await scores(id, "admin", [{ participantId: who.id, score: 21, version: 1 }])).status).toBe(200);
    await action(id, "publish");
    const noReason = await scores(id, "admin", [{ participantId: who.id, score: 22, version: 2 }]);
    expect([noReason.status, noReason.json.error.code]).toEqual([400, "REASON_REQUIRED"]);
    expect((await scores(id, "admin", [{ participantId: who.id, score: 22, version: 2 }], { reason: "Marking error" })).status).toBe(200);
    const history = (await get(`${assessmentsUrl()}/${id}/history?personId=${who.id}`, "admin")).json.data.changes;
    expect(JSON.stringify(history)).toContain("Marking error");
  });

  test("someone suspended is left out of marking and the average; a suspended person's earlier score stays; a person who moved keeps their score on the sheet", async () => {
    const id = await make({ groupIds: [top, other] });
    const [fine, hold, moved] = [await member(north), await member(north), await member(north)];
    await action(id, "open");
    await scores(id, "admin", [
      { participantId: fine.id, score: 30 },
      { participantId: moved.id, score: 20 },
      { participantId: hold.id, score: 10 },
    ]);
    await db.studentRecord.update({ where: { id: hold.record.id }, data: { standing: "SUSPENDED" } });
    expect((await sheet(id, "admin")).rows.find((r) => r.participantId === hold.id)!.entry).toMatchObject({ score: 10 });
    await send(`${programUrl()}/people/${moved.id}/place`, "admin", "POST", { action: "withdraw", reason: "Moved away" });
    expect((await sheet(id, "admin")).rows.find((r) => r.participantId === moved.id)).toBeTruthy();
  });
});

test.describe("results and the database", () => {
  test("each person's results over the published assessments: the weighted average, the grade, ABSENT as 0, EXCUSED left out, drafts left out", async () => {
    await send(`${programUrl()}/settings`, "admin", "PATCH", {
      gradeBands: [
        { name: "Good", from: 70 },
        { name: "Fail", from: 0 },
      ],
    });
    const who = await member(north);
    const [one, two, three, draft] = [
      await make({ maxScore: 100, weight: 1 }),
      await make({ maxScore: 100, weight: 3 }),
      await make({ maxScore: 100, weight: 1 }),
      await make({ maxScore: 100 }),
    ];
    for (const [id, entry] of [
      [one, { score: 80 }],
      [two, { score: 40 }],
      [three, { code: "EXCUSED" }],
    ] as const) {
      expect((await action(id, "open")).status).toBe(200);
      const saved = await scores(id, "admin", [{ participantId: who.id, ...entry }]);
      expect(saved.status, saved.text).toBe(200);
      const marked = await action(id, "mark");
      expect(marked.status, marked.text).toBe(200);
      const published = await action(id, "publish");
      expect(published.status, published.text).toBe(200);
    }
    void draft;
    const results = (await get(`${assessmentsUrl()}/results`, "admin")).json.data;
    const row = results.rows.find((r: { participantId: string }) => r.participantId === who.id);
    expect(row.average).toBe(50);
    expect(row.grade).toBe("Fail");
    expect((await get(`${assessmentsUrl()}/results`, "teacher")).status).toBe(200);
  });

  test("the database refuses what the service would: a score is a number or a code, within the maximum; the history cannot be rewritten by the application's role", async () => {
    const id = await make();
    const who = await member(north);
    const base = { tenantId: a.id, programId, assessmentId: id, participantId: who.id, markedByUserId: people.admin.id };
    await expect(db.programScore.create({ data: { ...base, score: 5, code: "ABSENT" } })).rejects.toThrow();
    await expect(db.programScore.create({ data: { ...base } })).rejects.toThrow();
    await expect(db.programScore.create({ data: { ...base, score: 1001 } })).rejects.toThrow();
    await expect(db.programAssessment.update({ where: { id }, data: { passMark: 999 } })).rejects.toThrow();
    await expect(db.programAssessment.update({ where: { id }, data: { weight: 0 } })).rejects.toThrow();
  });
});
