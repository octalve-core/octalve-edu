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
import { weekStartOf } from "@/lib/programs/progress-rules";

// Progress records (task 0027, slices R1 to R4): the running log kept for each person in a program, over real HTTP. Setting it up, who sees and writes which record, the version check,
// verification and four-eyes, the lock, and what a pupil and a guardian see through the portal.
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
const progressUrl = () => `${programUrl()}/progress`;
const recordUrl = (person: string) => `${progressUrl()}/people/${person}`;
const get = (url: string, who: string) => api(url, as(who));
const send = (url: string, who: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) =>
  api(url, { ...as(who), method, ...(body ? { body } : {}) });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const idOf = (res: { json: { data: { id: string } } }) => res.json.data.id;
const range = (fromSurah: number, fromAyah: number, toSurah: number, toAyah: number) => ({ fromSurah, fromAyah, toSurah, toAyah });
const text = (entryDate: string, r = range(2, 1, 2, 5), extra: object = {}) => ({
  trackKey: "new",
  entryDate,
  values: { range: r, rating: 4, ...extra },
});
const add = (who: string, person: string, body: object) => send(`${recordUrl(person)}/entries`, who, "POST", body);
const settings = (who: string, body: object) => send(`${programUrl()}/settings`, who, "PATCH", body);
const entryRow = (id: string) => db.progressEntry.findUniqueOrThrow({ where: { id } });
const made = async (who: string, person: string, entryDate: string, extra: object = {}) => {
  const res = await add(who, person, { ...text(entryDate), ...extra });
  expect(res.status, res.text).toBe(201);
  return idOf(res);
};

async function member(campusId: string | null, groupId = top, over: Record<string, unknown> = {}) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Learner"),
      lastName: "Log",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("PG/"),
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
  a = await createTenant({ name: "Progress School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Progress School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of [
    "admin",
    "admin2",
    "campusNorth",
    "progAdmin",
    "supervisor",
    "teacher",
    "recorder",
    "idle",
    "pupilUser",
    "guardianUser",
    "adminB",
  ])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.admin2.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  for (const who of ["progAdmin", "supervisor", "teacher", "recorder", "idle"])
    await addMembership(people[who].id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, north);
  await addMembership(people.guardianUser.id, a.id, Role.PARENT);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
  const made = await send(`${school()}/programs`, "admin", "POST", {
    name: uniq("Hifz"),
    kind: "ONGOING",
    campusIds: [north, south],
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
  expect((await settings("admin", { progressTemplate: "QURAN_BOOKLET", progressEnabled: true })).status).toBe(200);
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({
    where: {
      tenantId: a.id,
      key: {
        in: ["programs.enabled", "programs.progress.enabled", "programs.progress.student.enabled", "programs.progress.guardian.enabled"],
      },
    },
  });
  await db.program.update({
    where: { id: programId },
    data: {
      progressEnabled: true,
      progressRequireVerification: false,
      progressFourEyes: true,
      progressStudentView: true,
      progressGuardianView: true,
      progressGuardianDetail: "SUMMARY",
      progressWriters: "BOTH",
    },
  });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("setting it up", () => {
  test("a program needs a template before it turns progress records on, and the template is kept as a copy; it cannot be swapped once a record is started", async () => {
    const id = idOf(
      await send(`${school()}/programs`, "admin", "POST", {
        name: uniq("Second"),
        kind: "ONGOING",
        campusIds: [north],
        levelLabels: ["Class"],
      }),
    );
    const set = (body: object) => send(`${programUrl(id)}/settings`, "admin", "PATCH", body);
    const refused = await set({ progressEnabled: true });
    expect(refused.status).toBe(400);
    expect(refused.json.error.details[0].path).toBe("body.progressTemplate");
    expect((await set({ progressTemplate: "NOPE" })).status).toBe(400);
    expect((await set({ progressTemplate: "SIMPLE_LOG", progressEnabled: true })).status).toBe(200);
    expect(await db.progressTemplate.findMany({ where: { programId: id } })).toHaveLength(1);
    const who = await member(north);
    await made("teacher", who.id, day(-1));
    const swap = await settings("admin", { progressTemplate: "SIMPLE_LOG" });
    expect([swap.status, swap.json.error.code]).toEqual([409, "TEMPLATE_IN_USE"]);
  });

  test("a program admin changes the settings; only the school's administrator changes four-eyes; the lock times and the Hijri adjustment are checked; others cannot", async () => {
    expect((await settings("progAdmin", { progressWriters: "TEACHERS", progressGuardianDetail: "FULL" })).status).toBe(200);
    expect((await settings("progAdmin", { progressFourEyes: false })).status).toBe(403);
    expect((await settings("admin", { progressFourEyes: false })).status).toBe(200);
    for (const body of [
      { progressLockInactivity: 59 },
      { progressLockInactivity: 3601 },
      { progressLockRelease: -1 },
      { progressLockRelease: 301 },
      { progressHijriAdjust: 3 },
      { progressHijriAdjust: -3 },
      { progressHijriAdjust: 0.5 },
      { progressWriters: "ALL" },
    ])
      expect((await settings("admin", body)).status, JSON.stringify(body)).toBe(400);
    expect((await settings("admin", { progressHijriAdjust: 1 })).status).toBe(200);
    for (const who of ["teacher", "supervisor", "campusNorth"])
      expect((await settings(who, { progressWriters: "BOTH" })).status, who).toBe(403);
  });

  test("the school's switch is a ceiling: off, nothing can be written but what was recorded can be read; the program's own flag turns it off too", async () => {
    const who = await member(north);
    const id = await made("teacher", who.id, day(-2));
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "programs.progress.enabled", value: false, updatedById: people.admin.id },
    });
    const refused = await add("teacher", who.id, text(day(-1)));
    expect([refused.status, refused.json.error.code]).toEqual([409, "PROGRESS_OFF"]);
    expect((await get(recordUrl(who.id), "teacher")).status, "reading still works").toBe(200);
    await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "programs.progress.enabled" } });
    await db.program.update({ where: { id: programId }, data: { progressEnabled: false } });
    expect((await add("teacher", who.id, text(day(-1)))).json.error.code).toBe("PROGRESS_OFF");
    expect((await entryRow(id)).status).toBeTruthy();
  });
});

test.describe("who sees and writes", () => {
  test("each person sees the people they reach: the administrator and the supervisor everyone, a teacher the people of their groups, a campus administrator their campus; a stranger finds nothing", async () => {
    const [inTop, inOther, southern] = [await member(north, top), await member(north, other), await member(south, top)];
    const ids = async (who: string) =>
      ((await get(progressUrl(), who)).json.data.people as { participantId: string }[]).map((p) => p.participantId);
    for (const who of ["admin", "supervisor", "progAdmin"])
      expect(await ids(who), who).toEqual(expect.arrayContaining([inTop.id, inOther.id, southern.id]));
    const teacher = await ids("teacher");
    expect(teacher).toContain(inTop.id);
    expect(teacher).not.toContain(inOther.id);
    expect((await ids("recorder")).includes(inOther.id)).toBe(true);
    const campus = await ids("campusNorth");
    expect(campus).toContain(inTop.id);
    expect(campus).not.toContain(southern.id);
    expect((await get(progressUrl(), "idle")).status).toBe(404);
    expect((await get(recordUrl(inOther.id), "teacher")).status, "a record out of reach").toBe(404);
    expect([403, 404]).toContain((await get(progressUrl(), "adminB")).status);
    expect((await get(progressUrl(), "pupilUser")).status).toBe(403);
  });

  test("a teacher adds an entry and it is published at once while verification is off; the record, a revision and the writer's name come with it", async () => {
    const who = await member(north);
    const id = await made("teacher", who.id, day(-1));
    const row = await entryRow(id);
    expect(row).toMatchObject({ status: "VERIFIED", version: 1 });
    expect(row.publishedValues).toBeTruthy();
    expect(await db.progressRecord.count({ where: { programId, participantId: who.id } })).toBe(1);
    expect(await db.progressEntryRevision.count({ where: { entryId: id } })).toBe(1);
    const view = (await get(recordUrl(who.id), "teacher")).json.data;
    expect(view.entries.some((e: { id: string; createdBy: string }) => e.id === id && e.createdBy === "teacher")).toBe(true);
  });

  test("the administrator and a program admin write anywhere; a teacher and a recorder to their groups; a supervisor, a campus administrator and a stranger cannot", async () => {
    const [inTop, inOther] = [await member(north, top), await member(north, other)];
    expect((await add("admin", inOther.id, text(day(-1)))).status).toBe(201);
    expect((await add("progAdmin", inTop.id, text(day(-2)))).status).toBe(201);
    expect((await add("teacher", inTop.id, text(day(-3)))).status).toBe(201);
    expect((await add("teacher", inOther.id, text(day(-3)))).status).toBeGreaterThanOrEqual(403);
    expect((await add("recorder", inOther.id, text(day(-4)))).status).toBe(201);
    for (const who of ["supervisor", "campusNorth", "idle"])
      expect((await add(who, inTop.id, text(day(-5)))).status, who).toBeGreaterThanOrEqual(403);
    await settings("admin", { progressWriters: "TEACHERS" });
    expect((await add("recorder", inOther.id, text(day(-6)))).status, "the writers setting").toBeGreaterThanOrEqual(403);
  });

  test("a place that is not taking part cannot be written to, but its record can be read", async () => {
    const who = await member(north, top, { standing: "SUSPENDED" });
    const refused = await add("teacher", who.id, text(day(-1)));
    expect([refused.status, refused.json.error.code]).toEqual([409, "NOT_ACTIVE"]);
    expect((await get(recordUrl(who.id), "teacher")).status).toBe(200);
  });

  test("what cannot be right is refused with the field named: a range outside the surah, a rating off the scale, an unknown key, an oversized note, a future day", async () => {
    const who = await member(north);
    const bad = [
      text(day(-1), range(2, 1, 2, 999)),
      text(day(-1), range(115, 1, 115, 2)),
      { ...text(day(-1)), values: { range: range(2, 1, 2, 3), rating: 9 } },
      { ...text(day(-1)), values: { range: range(2, 1, 2, 3), nope: 1 } },
      text(day(-1), range(2, 1, 2, 3), { notes: "x".repeat(501) }),
      text(day(5)),
      { ...text(day(-1)), trackKey: "missing" },
    ];
    for (const body of bad) expect((await add("teacher", who.id, body)).status, JSON.stringify(body)).toBe(400);
    expect(await db.progressEntry.count({ where: { record: { participantId: who.id } } })).toBe(0);
  });
});

test.describe("versions, verification and the lock", () => {
  test("a change needs the version it was opened at; a stale one is refused naming who changed it; saving what is stored changes nothing; every save is in the history", async () => {
    const who = await member(north);
    const id = await made("teacher", who.id, day(-1));
    const url = `${recordUrl(who.id)}/entries/${id}`;
    const stale = await send(url, "admin", "PATCH", { values: text(day(-1)).values, version: 7 });
    expect([stale.status, stale.json.error.code]).toEqual([409, "CHANGED"]);
    expect(stale.json.error.message).toContain("teacher");
    const changed = await send(url, "teacher", "PATCH", { values: { range: range(2, 1, 2, 9), rating: 5 }, version: 1 });
    expect(changed.status, changed.text).toBe(200);
    expect((await entryRow(id)).version).toBe(2);
    expect((await send(url, "teacher", "PATCH", { values: { range: range(2, 1, 2, 9), rating: 5 }, version: 2 })).status).toBe(200);
    expect((await entryRow(id)).version, "nothing changed").toBe(2);
    expect(await db.progressEntryRevision.count({ where: { entryId: id } })).toBe(2);
  });

  test("a track with one row a day opens the existing entry instead of making a second", async () => {
    const who = await member(north);
    const first = await made("teacher", who.id, day(-1));
    const again = await add("teacher", who.id, text(day(-1), range(3, 1, 3, 4)));
    expect([again.status, again.json.error?.code]).toEqual([409, "EXISTS"]);
    expect(await db.progressEntry.count({ where: { recordId: (await entryRow(first)).recordId, entryDate: new Date(day(-1)) } })).toBe(1);
  });

  test("with verification on: an entry is a draft, is handed in by its writer, and is verified by someone else; families get nothing until then; four-eyes keeps the writer from verifying", async () => {
    await settings("admin", { progressRequireVerification: true });
    const who = await member(north);
    const id = await made("teacher", who.id, day(-1));
    expect(await entryRow(id)).toMatchObject({ status: "DRAFT", publishedValues: null });
    const url = `${recordUrl(who.id)}/entries/${id}`;
    expect((await send(url, "teacher", "POST", { action: "submit", version: 1 })).status).toBe(200);
    expect((await entryRow(id)).status).toBe("SUBMITTED");
    const own = await send(url, "admin", "POST", { action: "verify", version: (await entryRow(id)).version });
    expect(own.status, "someone else has not touched it").toBe(200);
    expect(await entryRow(id)).toMatchObject({ status: "VERIFIED" });
    expect((await entryRow(id)).publishedValues).toBeTruthy();
    // the writer may not verify what they wrote
    const second = await made("admin", who.id, day(-2));
    await send(`${recordUrl(who.id)}/entries/${second}`, "admin", "POST", { action: "submit", version: 1 });
    const four = await send(`${recordUrl(who.id)}/entries/${second}`, "admin", "POST", { action: "verify", version: 2 });
    expect([four.status, four.json.error.code]).toEqual([403, "FOUR_EYES"]);
    await settings("admin", { progressFourEyes: false });
    expect((await send(`${recordUrl(who.id)}/entries/${second}`, "admin", "POST", { action: "verify", version: 2 })).status).toBe(200);
  });

  test("a verifier sends an entry back with a comment; editing a verified entry hands it back in while families keep the last verified copy; 'verify the week' verifies a whole week or none", async () => {
    await settings("admin", { progressRequireVerification: true });
    const who = await member(north);
    const a1 = await made("teacher", who.id, day(-1));
    const url = (id: string) => `${recordUrl(who.id)}/entries/${id}`;
    await send(url(a1), "teacher", "POST", { action: "submit", version: 1 });
    const returned = await send(url(a1), "supervisor", "POST", { action: "return", version: 2, comment: "Check the second ayah" });
    expect(returned.status, returned.text).toBe(200);
    expect(await entryRow(a1)).toMatchObject({ status: "DRAFT", returnComment: "Check the second ayah" });
    await send(url(a1), "teacher", "POST", { action: "submit", version: (await entryRow(a1)).version });
    expect((await send(url(a1), "supervisor", "POST", { action: "verify", version: (await entryRow(a1)).version })).status).toBe(200);
    const published = (await entryRow(a1)).publishedValues;
    await send(url(a1), "teacher", "PATCH", { values: { range: range(2, 1, 2, 20), rating: 3 }, version: (await entryRow(a1)).version });
    const after = await entryRow(a1);
    expect(after.status, "an edit of a verified entry hands it back in").toBe("SUBMITTED");
    expect(after.publishedValues, "families keep the last verified copy").toEqual(published);
    // the week
    const wk = weekStartOf(day(-9), 6);
    const dates = [0, 1, 2].map((i) => new Date(new Date(`${wk}T00:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10));
    const ids = [];
    for (const d of dates) {
      const id = await made("teacher", who.id, d);
      await send(url(id), "teacher", "POST", { action: "submit", version: 1 });
      ids.push(id);
    }
    expect((await send(`${recordUrl(who.id)}/verify-week`, "teacher", "POST", { weekStart: wk })).status).toBeGreaterThanOrEqual(403);
    const verified = await send(`${recordUrl(who.id)}/verify-week`, "supervisor", "POST", { weekStart: wk });
    expect(verified.status, verified.text).toBe(200);
    for (const id of ids) expect((await entryRow(id)).status).toBe("VERIFIED");
  });

  test("one person holds an entry; the others read it and are told who; 'Viewing' hands it back after the delay, zero at once; an expired lock is nobody's; an administrator can release it", async () => {
    const who = await member(north);
    const id = await made("teacher", who.id, day(-1));
    const lock = (user: string, action: string) => send(`${recordUrl(who.id)}/entries/${id}/lock`, user, "POST", { action });
    expect((await lock("teacher", "take")).status).toBe(200);
    const busy = await lock("admin", "take");
    expect([busy.status, busy.json.error.code]).toEqual([409, "LOCKED"]);
    expect(busy.json.error.message).toContain("teacher");
    const edit = await send(`${recordUrl(who.id)}/entries/${id}`, "admin", "PATCH", { values: text(day(-1)).values, version: 1 });
    expect(edit.json.error.code).toBe("LOCKED");
    expect((await lock("teacher", "heartbeat")).status).toBe(200);
    await db.program.update({ where: { id: programId }, data: { progressLockRelease: 0 } });
    expect((await lock("teacher", "viewing")).status).toBe(200);
    expect((await lock("admin", "take")).status, "released at once").toBe(200);
    await db.progressLock.update({
      where: { entryId: id },
      data: { heartbeatAt: new Date(Date.now() - 7200_000), expiresAt: new Date(Date.now() - 3600_000) },
    });
    expect((await lock("teacher", "take")).status, "an expired lock is nobody's").toBe(200);
    expect((await lock("admin", "release")).status).toBe(200);
    await db.program.update({ where: { id: programId }, data: { progressLockRelease: 30 } });
  });
});

test.describe("what the family sees", () => {
  const portal = (who: string, query = "") => get(`${school()}/portal/progress${query}`, who);
  test("a pupil sees their own verified entries in full; a guardian a summary and nothing day by day, or every verified entry when the program allows", async () => {
    const mine = await member(north, top, { userId: people.pupilUser.id });
    const guardian = await db.guardianRecord.create({
      data: { tenantId: a.id, firstName: "Gu", lastName: "Ardian", phone: "08030009999", userId: people.guardianUser.id },
    });
    await db.guardianLink.create({
      data: { tenantId: a.id, studentId: mine.record.id, guardianId: guardian.id, relationship: "MOTHER", isPrimary: true },
    });
    await made("teacher", mine.id, day(-1));
    const pupil = (await portal("pupilUser")).json.data;
    expect(pupil.actor).toBe("PUPIL");
    expect(pupil.children[0].programs[0].entries).toHaveLength(1);
    const parent = (await portal("guardianUser")).json.data;
    expect(parent.actor).toBe("GUARDIAN");
    expect(parent.children[0].programs[0].entries).toBeNull();
    expect(parent.children[0].programs[0].summary.month.daysRecorded).toBe(1);
    await settings("admin", { progressGuardianDetail: "FULL" });
    expect(((await portal("guardianUser")).json.data.children[0].programs[0].entries as unknown[]).length).toBe(1);
    expect((await portal("admin")).status).toBe(403);
    expect((await api(`${school()}/portal/progress`, SAAS)).status).toBe(401);
  });

  test("only what has been verified is shown; the program, the school and the campus can each close the view, for the pupil and the guardian separately; 'seen' is a record of a week", async () => {
    await settings("admin", { progressRequireVerification: true });
    await db.studentRecord.updateMany({ where: { tenantId: a.id, userId: people.pupilUser.id }, data: { userId: null } }); // one record per sign-in
    const mine = await member(north, top, { userId: people.pupilUser.id });
    const id = await made("teacher", mine.id, day(-1));
    expect((await portal("pupilUser")).json.data.children[0].programs[0].entries, "a draft is not shown").toHaveLength(0);
    await send(`${recordUrl(mine.id)}/entries/${id}`, "teacher", "POST", { action: "submit", version: 1 });
    await send(`${recordUrl(mine.id)}/entries/${id}`, "admin", "POST", { action: "verify", version: 2 });
    expect((await portal("pupilUser")).json.data.children[0].programs[0].entries).toHaveLength(1);
    const seen = await send(`${school()}/portal/progress/seen`, "pupilUser", "POST", { programId, weekStart: day(-1) });
    expect(seen.status, seen.text).toBe(200);
    expect(await db.progressSeen.count({ where: { programId, actor: "PUPIL" } })).toBeGreaterThanOrEqual(1);
    expect((await send(`${school()}/portal/progress/seen`, "pupilUser", "POST", { programId, weekStart: day(30) })).status).toBe(400);
    await db.program.update({ where: { id: programId }, data: { progressStudentView: false } });
    expect((await portal("pupilUser")).json.data.children[0]?.programs ?? []).toHaveLength(0);
    await db.program.update({ where: { id: programId }, data: { progressStudentView: true } });
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "programs.progress.student.enabled", value: false, updatedById: people.admin.id },
    });
    expect((await portal("pupilUser")).json.data.children[0]?.programs ?? []).toHaveLength(0);
  });
});

test.describe("the database", () => {
  test("a verified entry must carry the copy families see; the lock and the Hijri adjustment are bounded; a record of a person of another program is refused by the keys", async () => {
    const who = await member(north);
    const id = await made("teacher", who.id, day(-1));
    await expect(
      db.progressEntry.update({
        where: { id },
        data: { status: "VERIFIED", publishedValues: { set: undefined } as never, verifiedAt: null },
      }),
    ).rejects.toThrow();
    await expect(db.program.update({ where: { id: programId }, data: { progressHijriAdjust: 3 } })).rejects.toThrow();
    await expect(db.program.update({ where: { id: programId }, data: { progressLockInactivity: 10 } })).rejects.toThrow();
    const otherId = idOf(
      await send(`${school()}/programs`, "admin", "POST", {
        name: uniq("Else"),
        kind: "ONGOING",
        campusIds: [north],
        levelLabels: ["One"],
      }),
    );
    const template = await db.progressTemplate.findFirstOrThrow({ where: { programId } });
    await expect(
      db.progressRecord.create({
        data: { tenantId: a.id, programId: otherId, participantId: who.id, templateId: template.id, createdByUserId: people.admin.id },
      }),
    ).rejects.toThrow();
  });
});
