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

// Promotion (task 0031) over real HTTP: who reaches it, what the preview advises, what a roll does to enrolments, every refusal the service makes before it writes, a roll that runs twice or at the
// same moment, a pupil who already has a place in the next session, campus rules and the school boundary.
//
// School A has two campuses, North and South. School B has an administrator. Every test builds its own world (`world()`): classes and sessions of earlier tests are archived, so the
// progression and the sessions each test sees are the ones it made.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const promo = (path: string, code = a.code) => `${school(code)}/academics/promotion/${path}`;
const get = (url: string, who: string) => api(url, as(who));
const post = (url: string, who: string, body: object) => api(url, { ...as(who), method: "POST", body });
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

type World = {
  s1: string;
  s2: string;
  s3: string;
  periods: string[];
  g1: string;
  g2: string;
  g3: string;
  arms: Record<string, string>; // "1A" -> arm id
  subjects: string[];
};

/// A fresh calendar and a fresh ladder (three classes) for school A. Everything older is archived.
async function world(opts: { campusId?: string | null } = {}): Promise<World> {
  const campusId = opts.campusId ?? null;
  await db.classGroup.updateMany({ where: { tenantId: a.id, archivedAt: null }, data: { archivedAt: new Date() } });
  await db.academicSession.updateMany({ where: { tenantId: a.id, archivedAt: null }, data: { status: "CLOSED", archivedAt: new Date() } });
  const year = 2030 + (counter % 40);
  const session = (n: number, status: "ACTIVE" | "PLANNED") =>
    db.academicSession.create({
      data: {
        tenantId: a.id,
        campusId,
        label: uniq(`S${n}-`),
        startDate: day(`${year + n}-09-01`),
        endDate: day(`${year + n + 1}-07-31`),
        status,
      },
    });
  const [s1, s2, s3] = [await session(0, "ACTIVE"), await session(1, "PLANNED"), await session(2, "PLANNED")];
  const periods: string[] = [];
  for (let n = 1; n <= 3; n++) {
    const p = await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId: s1.id,
        kind: "TERM",
        ordinal: n,
        label: `Term ${n}`,
        startDate: day(`${year}-${String(8 + n * 1).padStart(2, "0")}-02`),
        endDate: day(`${year}-${String(8 + n * 1).padStart(2, "0")}-25`),
        isCurrent: n === 3,
      },
    });
    periods.push(p.id);
  }
  const group = (name: string, sortOrder: number) =>
    db.classGroup.create({ data: { tenantId: a.id, campusId, name: uniq(name), sortOrder } });
  const [g1, g2, g3] = [await group("JSS1-", 1), await group("JSS2-", 2), await group("JSS3-", 3)];
  const arms: Record<string, string> = {};
  for (const [key, g, name] of [
    ["1A", g1, "A"],
    ["1B", g1, "B"],
    ["2A", g2, "A"],
    ["2B", g2, "B"],
    ["3A", g3, "A"],
  ] as const) {
    arms[key] = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: g.id, name } })).id;
  }
  const subjects = [
    (await db.subject.create({ data: { tenantId: a.id, name: uniq("Maths") } })).id,
    (await db.subject.create({ data: { tenantId: a.id, name: uniq("English") } })).id,
  ];
  return { s1: s1.id, s2: s2.id, s3: s3.id, periods, g1: g1.id, g2: g2.id, g3: g3.id, arms, subjects };
}

/// A pupil on the roll of an arm for the first session, with the given published average per term (null = no result that term).
async function pupil(
  w: World,
  armKey: string,
  terms: (number | null)[],
  over: Record<string, unknown> = {},
  enrol: Record<string, unknown> = {},
) {
  const record = await db.studentRecord.create({
    data: { tenantId: a.id, firstName: uniq("Pu"), lastName: "Rollup", dateOfBirth: day("2014-03-03"), admissionNo: uniq("PR/"), ...over },
  });
  const enrolment = await db.studentEnrollment.create({
    data: { tenantId: a.id, studentId: record.id, sessionId: w.s1, classArmId: w.arms[armKey], ...enrol },
  });
  for (const [i, avg] of terms.entries()) {
    if (avg === null) continue;
    for (const subjectId of w.subjects) {
      await db.result.create({
        data: {
          tenantId: a.id,
          studentId: record.id,
          subjectId,
          periodId: w.periods[i],
          score: avg,
          maxScore: 100,
          status: "PUBLISHED",
          verificationToken: uniq("tok"),
        },
      });
    }
  }
  return { record, enrolment };
}

const previewUrl = (w: World, over: Record<string, string> = {}, cls = w.g1) =>
  `${promo("preview")}?${new URLSearchParams({ sourceSessionId: w.s1, targetSessionId: w.s2, sourceClassGroupId: cls, ...over })}`;
const body = (w: World, over: Record<string, unknown> = {}) => ({
  sourceSessionId: w.s1,
  targetSessionId: w.s2,
  sourceClassGroupId: w.g1,
  ...over,
});
const roll = (w: World, who = "admin", over: Record<string, unknown> = {}) => post(promo("execute"), who, body(w, over));
type Row = {
  studentId: string;
  recommendedDecision: string;
  overallAverage: number | null;
  targetClassArmName: string | null;
  alreadyEnrolledInTarget: boolean;
  termAverages: Record<string, number | null>;
};
const rows = async (w: World, who = "admin", cls = w.g1) => (await get(previewUrl(w, {}, cls), who)).json.data.preview.students as Row[];

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Promotion School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Promotion School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusNorth", "campusSouth", "teacher", "registrar", "pupilUser", "adminB"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.campusSouth.id, a.id, Role.CAMPUS_ADMIN, south);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.registrar.id, a.id, Role.NON_TEACHING_STAFF, null);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, null);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("who reaches promotion", () => {
  test("nobody signed out, no pupil, no teacher and no registrar; another school's administrator is told there is no such class", async () => {
    const w = await world();
    for (const url of [previewUrl(w), promo("batches")]) {
      expect((await api(url, SAAS)).status, url).toBe(401);
      for (const who of ["pupilUser", "teacher", "registrar"]) expect((await get(url, who)).status, `${url} ${who}`).toBe(403);
    }
    for (const who of ["pupilUser", "teacher", "registrar"]) expect((await roll(w, who)).status, who).toBe(403);
    expect((await api(promo("execute"), { ...SAAS, method: "POST", body: body(w) })).status).toBe(401);
    // The other school's administrator is not a member of school A: the 403 every school route gives. In their own school, naming ids of school A is the same 404 as ids that do not exist.
    expect((await get(previewUrl(w), "adminB")).status).toBe(403);
    expect((await post(promo("execute"), "adminB", body(w))).status).toBe(403);
    expect((await get(previewUrl(w).replace(a.code, b.code), "adminB")).status).toBe(404);
    expect((await post(promo("execute", b.code), "adminB", body(w))).status).toBe(404);
  });

  test("a campus administrator rolls the classes of their own campus, not another's and not a class of the whole school", async () => {
    const w = await world({ campusId: north });
    await pupil(w, "1A", [70, 70, 70], { campusId: north });
    expect((await get(previewUrl(w), "campusNorth")).status).toBe(200);
    expect((await get(previewUrl(w), "campusSouth")).status).toBe(404); // another campus's class: no such class
    expect((await get(previewUrl(w), "admin")).status).toBe(200);

    // A class of the whole school, in the whole school's own calendar, moves every campus's pupils: the school administrator's.
    const whole = await world();
    expect((await get(previewUrl(whole), "campusNorth")).status).toBe(403);
    expect((await roll(whole, "campusNorth")).status).toBe(403);
  });

  test("a campus administrator rolls a class of the whole school inside their own campus's calendar, and sees only their own history", async () => {
    const w = await world({ campusId: north });
    // The classes are the whole school's, the sessions are north's own: make the classes school-wide.
    await db.classGroup.updateMany({ where: { id: { in: [w.g1, w.g2, w.g3] } }, data: { campusId: null } });
    const p = await pupil(w, "1A", [80, 80, 80], { campusId: north });
    const other = await pupil(w, "1A", [80, 80, 80], { campusId: south }); // a pupil of another campus in the shared class
    const rolled = await roll(w, "campusNorth");
    expect(rolled.status, rolled.text).toBe(201);
    // Only north's pupil moved; the other campus's pupil is not on north's roll.
    expect((await db.studentEnrollment.findUnique({ where: { id: p.enrolment.id } }))!.status).toBe("PROMOTED");
    expect((await db.studentEnrollment.findUnique({ where: { id: other.enrolment.id } }))!.status).toBe("ACTIVE");
    const mine = (await get(promo("batches"), "campusNorth")).json.data.batches as { id: string }[];
    expect(mine.map((x) => x.id)).toContain(rolled.json.data.batch.id);
    expect((await get(promo("batches"), "campusSouth")).json.data.batches as unknown[]).toHaveLength(0);
    expect((await get(promo(`batches/${rolled.json.data.batch.id}`), "campusSouth")).status).toBe(404);
    expect((await get(promo(`batches/${rolled.json.data.batch.id}`), "campusNorth")).status).toBe(200);
  });
});

test.describe("the preview", () => {
  test("advises from the mean of the published term averages; a draft does not count; a missing term is left out, not counted as zero", async () => {
    const w = await world();
    const good = await pupil(w, "1A", [60, 70, null]); // 65 -> promoted
    const weak = await pupil(w, "1A", [40, 30, 50]); // 40 -> repeats
    const none = await pupil(w, "1A", [null, null, null]); // no result -> repeats
    const edge = await pupil(w, "1A", [50, 50, 50]); // the pass mark itself -> promoted
    const draft = await pupil(w, "1A", [null, null, null]);
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: draft.record.id,
        subjectId: w.subjects[0],
        periodId: w.periods[0],
        score: 100,
        maxScore: 100,
        status: "DRAFT",
      },
    });
    const locked = await pupil(w, "1A", [null, null, null]);
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: locked.record.id,
        subjectId: w.subjects[0],
        periodId: w.periods[2],
        score: 90,
        maxScore: 100,
        status: "LOCKED",
      },
    });

    const res = await get(previewUrl(w), "admin");
    expect(res.status, res.text).toBe(200);
    const by = new Map((res.json.data.preview.students as Row[]).map((r) => [r.studentId, r]));
    expect(by.get(good.record.id)).toMatchObject({
      recommendedDecision: "PROMOTED",
      overallAverage: 65,
      termAverages: { "1": 60, "2": 70, "3": null },
    });
    expect(by.get(weak.record.id)).toMatchObject({ recommendedDecision: "REPEATED", overallAverage: 40 });
    expect(by.get(none.record.id)).toMatchObject({ recommendedDecision: "REPEATED", overallAverage: null });
    expect(by.get(edge.record.id)?.recommendedDecision).toBe("PROMOTED");
    expect(by.get(draft.record.id)?.overallAverage).toBeNull(); // a draft is not a result the school stood behind
    expect(by.get(locked.record.id)?.overallAverage).toBe(90); // a locked one is
    const p = res.json.data.preview;
    expect(p.targetClassGroup.id).toBe(w.g2);
    expect(p.eligibility.eligible).toBe(true);
    expect(p.summary).toMatchObject({ totalEvaluated: 6, totalPromoted: 3, totalRepeated: 3, totalGraduated: 0, totalSkipped: 0 });
    // Advice (task 0047, decision D8 of task 0031): three pupils have no published mark for the last period (good, none and the one with only a draft earlier); it is advice, the roll is not refused.
    expect(p.finalTermGap).toMatchObject({ ordinal: 3, pupils: 3 });
  });

  test("the advice about the final term counts the pupils with no published marks for it, and is null when nobody is missing (task 0047)", async () => {
    const w = await world();
    await pupil(w, "1A", [60, 60, 60]);
    await pupil(w, "1A", [null, null, 70]);
    expect((await get(previewUrl(w), "admin")).json.data.preview.finalTermGap).toBeNull();
    await pupil(w, "1A", [60, 60, null]);
    const gap = (await get(previewUrl(w), "admin")).json.data.preview.finalTermGap;
    expect(gap).toMatchObject({ ordinal: 3, pupils: 1 });
    expect(typeof gap.label).toBe("string");
    // Advice, not a refusal: the roll still goes through.
    expect((await get(previewUrl(w), "admin")).status).toBe(200);
  });

  test("the pass mark is the school's to set, and a nonsense one is refused", async () => {
    const w = await world();
    const mid = await pupil(w, "1A", [45, 45, 45]);
    const at = (passMark: string) => get(previewUrl(w, { passMark }), "admin");
    expect(((await at("40")).json.data.preview.students as Row[]).find((r) => r.studentId === mid.record.id)?.recommendedDecision).toBe(
      "PROMOTED",
    );
    expect(((await at("50")).json.data.preview.students as Row[]).find((r) => r.studentId === mid.record.id)?.recommendedDecision).toBe(
      "REPEATED",
    );
    for (const bad of ["-1", "101", "abc"]) expect((await at(bad)).status, bad).toBe(400);
  });

  test("the roll leaves out an expelled pupil, an archived record and a pupil who left; a suspended pupil is on it", async () => {
    const w = await world();
    const active = await pupil(w, "1A", [70, 70, 70]);
    const suspended = await pupil(w, "1A", [70, 70, 70], { standing: "SUSPENDED" });
    const expelled = await pupil(w, "1A", [70, 70, 70], { standing: "EXPELLED" }, { status: "EXPELLED" });
    const archived = await pupil(w, "1A", [70, 70, 70], { archivedAt: new Date() });
    const withdrawn = await pupil(w, "1A", [70, 70, 70], {}, { status: "WITHDRAWN" });
    const ids = (await rows(w)).map((r) => r.studentId);
    expect(ids).toContain(active.record.id);
    expect(ids).toContain(suspended.record.id);
    for (const x of [expelled, archived, withdrawn]) expect(ids).not.toContain(x.record.id);
  });

  test("a pupil promoted lands in the arm of the same name, else the first; the last class has no next class", async () => {
    const w = await world();
    await pupil(w, "1A", [70, 70, 70]);
    await pupil(w, "1B", [70, 70, 70]);
    const names = (await rows(w)).map((r) => r.targetClassArmName).sort();
    expect(names).toEqual(["A", "B"]);
    const last = await get(previewUrl(w, {}, w.g3), "admin");
    expect(last.json.data.preview.targetClassGroup).toBeNull();
    expect(last.json.data.preview.isTerminalClass).toBe(true);
  });

  test("advice says when the session is not at its last period, and still previews", async () => {
    const w = await world();
    await db.academicPeriod.updateMany({ where: { sessionId: w.s1 }, data: { isCurrent: false } });
    await db.academicPeriod.update({ where: { id: w.periods[0] }, data: { isCurrent: true } });
    const res = await get(previewUrl(w), "admin");
    expect(res.status).toBe(200);
    expect(res.json.data.preview.eligibility).toMatchObject({ eligible: false, finalPeriodOrdinal: 3 });
  });
});

test.describe("rolling a class", () => {
  test("promotes, repeats and graduates, writes the new enrolments, the batch, its records and an audit row", async () => {
    const w = await world();
    const up = await pupil(w, "1A", [70, 70, 70]);
    const upB = await pupil(w, "1B", [90, 90, 90]);
    const down = await pupil(w, "1A", [20, 20, 20]);
    const res = await roll(w, "admin", { notes: "End of year" });
    expect(res.status, res.text).toBe(201);
    const batch = res.json.data.batch;
    expect(batch.totals).toMatchObject({ evaluated: 3, promoted: 2, repeated: 1, graduated: 0, skipped: 0 });
    expect(batch.sourceClassGroup.id).toBe(w.g1);
    expect(batch.targetClassGroup.id).toBe(w.g2);
    expect(batch.notes).toBe("End of year");

    const status = async (id: string) => (await db.studentEnrollment.findUnique({ where: { id } }))!.status;
    expect(await status(up.enrolment.id)).toBe("PROMOTED");
    expect(await status(down.enrolment.id)).toBe("REPEATED");
    const into = (studentId: string) =>
      db.studentEnrollment.findUnique({ where: { tenantId_studentId_sessionId: { tenantId: a.id, studentId, sessionId: w.s2 } } });
    expect(await into(up.record.id)).toMatchObject({ classArmId: w.arms["2A"], status: "ACTIVE" });
    expect(await into(upB.record.id)).toMatchObject({ classArmId: w.arms["2B"], status: "ACTIVE" }); // the arm of the same name
    expect(await into(down.record.id)).toMatchObject({ classArmId: w.arms["1A"], status: "ACTIVE" }); // a repeater keeps their own arm

    const records = await db.promotionRecord.findMany({ where: { batchId: batch.id } });
    expect(records).toHaveLength(3);
    const upRecord = records.find((r) => r.studentId === up.record.id)!;
    expect(upRecord).toMatchObject({
      decision: "PROMOTED",
      decisionMode: "AUTOMATIC",
      targetEnrollmentId: (await into(up.record.id))!.id,
      sourceEnrollmentId: up.enrolment.id,
    });
    expect(Number(upRecord.overallAverage)).toBe(70);
    expect(upRecord.termAverages).toEqual({ "1": 70, "2": 70, "3": 70 });
    const audit = await db.auditLog.findFirst({ where: { tenantId: a.id, action: "PROMOTION_EXECUTED", targetId: batch.id } });
    expect(audit?.actorUserId).toBe(people.admin.id);
  });

  test("the last class graduates its pupils and gives them no place in the next session", async () => {
    const w = await world();
    const passer = await pupil(w, "3A", [70, 70, 70]);
    const failer = await pupil(w, "3A", [10, 10, 10]);
    const res = await roll(w, "admin", { sourceClassGroupId: w.g3 });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.batch.targetClassGroup).toBeNull();
    expect(res.json.data.batch.totals).toMatchObject({ graduated: 1, repeated: 1, promoted: 0 });
    expect((await db.studentEnrollment.findUnique({ where: { id: passer.enrolment.id } }))!.status).toBe("ALUMNI");
    expect(await db.studentEnrollment.count({ where: { studentId: passer.record.id, sessionId: w.s2 } })).toBe(0);
    expect((await db.studentEnrollment.findUnique({ where: { id: failer.enrolment.id } }))!.status).toBe("REPEATED");
    const rec = await db.promotionRecord.findFirst({ where: { studentId: passer.record.id } });
    expect(rec).toMatchObject({ decision: "GRADUATED", targetEnrollmentId: null });
  });

  test("rolling the same class again is refused and changes nothing", async () => {
    const w = await world();
    await pupil(w, "1A", [70, 70, 70]);
    expect((await roll(w)).status).toBe(201);
    const again = await roll(w);
    expect(again.status, again.text).toBe(409);
    expect(again.json.error.code).toBe("PROMOTION_REFUSED");
    expect(await db.promotionBatch.count({ where: { tenantId: a.id, sourceClassGroupId: w.g1 } })).toBe(1);
    expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2 } })).toBe(1);
  });

  test("two administrators pressing the button at the same moment process every pupil once", async () => {
    const w = await world();
    const made = [];
    for (let i = 0; i < 6; i++) made.push(await pupil(w, i % 2 ? "1A" : "1B", [70, 70, 70]));
    const results = await Promise.all([roll(w), roll(w), roll(w)]);
    const statuses = results.map((r) => r.status).sort();
    expect(
      statuses.filter((s) => s === 201),
      statuses.join(),
    ).toHaveLength(1);
    expect(
      statuses.filter((s) => s === 409),
      statuses.join(),
    ).toHaveLength(2);
    expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2 } })).toBe(6);
    expect(await db.promotionRecord.count({ where: { studentId: { in: made.map((m) => m.record.id) } } })).toBe(6);
    expect(await db.promotionBatch.count({ where: { tenantId: a.id, sourceClassGroupId: w.g1 } })).toBe(1);
  });

  test("a pupil who already has a place in the next session is left alone, not overwritten", async () => {
    const w = await world();
    const placed = await pupil(w, "1A", [70, 70, 70]);
    const other = await pupil(w, "1A", [70, 70, 70]);
    // An administrator put this pupil in 2B by hand: the roll must not move them.
    await db.studentEnrollment.create({ data: { tenantId: a.id, studentId: placed.record.id, sessionId: w.s2, classArmId: w.arms["2B"] } });
    const pre = (await rows(w)).find((r) => r.studentId === placed.record.id)!;
    expect(pre.alreadyEnrolledInTarget).toBe(true);
    const res = await roll(w);
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.batch.totals).toMatchObject({ evaluated: 2, promoted: 1, skipped: 1 });
    expect((await db.studentEnrollment.findUnique({ where: { id: placed.enrolment.id } }))!.status).toBe("ACTIVE"); // still on the old roll
    expect(
      (await db.studentEnrollment.findUnique({
        where: { tenantId_studentId_sessionId: { tenantId: a.id, studentId: placed.record.id, sessionId: w.s2 } },
      }))!.classArmId,
    ).toBe(w.arms["2B"]);
    expect((await db.studentEnrollment.findUnique({ where: { id: other.enrolment.id } }))!.status).toBe("PROMOTED");
    expect(await db.promotionRecord.count({ where: { studentId: placed.record.id } })).toBe(0);
  });

  test("a suspended pupil is promoted like any other; an expelled pupil is never touched", async () => {
    const w = await world();
    const suspended = await pupil(w, "1A", [70, 70, 70], { standing: "SUSPENDED" });
    const expelled = await pupil(w, "1A", [70, 70, 70], { standing: "EXPELLED" }, { status: "EXPELLED" });
    expect((await roll(w)).status).toBe(201);
    expect((await db.studentEnrollment.findUnique({ where: { id: suspended.enrolment.id } }))!.status).toBe("PROMOTED");
    expect((await db.studentEnrollment.findUnique({ where: { id: expelled.enrolment.id } }))!.status).toBe("EXPELLED");
    expect(await db.studentEnrollment.count({ where: { studentId: expelled.record.id, sessionId: w.s2 } })).toBe(0);
  });
});

test.describe("overrides", () => {
  test("an override changes the decision, takes the chosen arm, and is recorded with its reason", async () => {
    const w = await world();
    const weak = await pupil(w, "1A", [30, 30, 30]); // advised to repeat
    const strong = await pupil(w, "1A", [90, 90, 90]); // advised to be promoted
    const res = await roll(w, "admin", {
      overrides: [
        { studentId: weak.record.id, decision: "PROMOTED", targetClassArmId: w.arms["2B"], overrideReason: "Moved up after a re-sit" },
        { studentId: strong.record.id, decision: "REPEATED", overrideReason: "Parents asked" },
      ],
    });
    expect(res.status, res.text).toBe(201);
    const into = (id: string) =>
      db.studentEnrollment.findUnique({ where: { tenantId_studentId_sessionId: { tenantId: a.id, studentId: id, sessionId: w.s2 } } });
    expect((await into(weak.record.id))!.classArmId).toBe(w.arms["2B"]);
    expect((await into(strong.record.id))!.classArmId).toBe(w.arms["1A"]);
    const record = await db.promotionRecord.findFirst({ where: { studentId: weak.record.id } });
    expect(record).toMatchObject({ decision: "PROMOTED", decisionMode: "OVERRIDDEN", overrideReason: "Moved up after a re-sit" });
    // The history shows both the decision taken and the one the rule advised.
    const detail = await get(promo(`batches/${res.json.data.batch.id}`), "admin");
    const fromHistory = (detail.json.data.records as { student: { id: string }; decision: string; recommendedDecision: string }[]).find(
      (r) => r.student.id === weak.record.id,
    )!;
    expect(fromHistory).toMatchObject({ decision: "PROMOTED", recommendedDecision: "REPEATED" });
  });

  test("withdrawing a pupil closes their place and gives them none in the next session", async () => {
    const w = await world();
    const leaver = await pupil(w, "1A", [70, 70, 70]);
    const res = await roll(w, "admin", {
      overrides: [{ studentId: leaver.record.id, decision: "WITHDRAWN", overrideReason: "Left the school" }],
    });
    expect(res.status, res.text).toBe(201);
    expect(res.json.data.batch.totals.withdrawn).toBe(1);
    expect((await db.studentEnrollment.findUnique({ where: { id: leaver.enrolment.id } }))!.status).toBe("WITHDRAWN");
    expect(await db.studentEnrollment.count({ where: { studentId: leaver.record.id, sessionId: w.s2 } })).toBe(0);
  });

  test("every override is judged before anything is written, with words that name the pupil", async () => {
    const w = await world();
    const p = await pupil(w, "1A", [70, 70, 70]);
    const stranger = await pupil(w, "1A", [70, 70, 70], {}, { status: "WITHDRAWN" }); // not on the roll
    const armOfOtherClass = w.arms["3A"];
    const cases: [string, Record<string, unknown>, number][] = [
      ["a pupil who is not on the roll", { studentId: stranger.record.id, decision: "REPEATED", overrideReason: "x" }, 409],
      ["no reason", { studentId: p.record.id, decision: "REPEATED" }, 400],
      ["a blank reason", { studentId: p.record.id, decision: "REPEATED", overrideReason: "   " }, 400],
      ["graduating from a class that has a next class", { studentId: p.record.id, decision: "GRADUATED", overrideReason: "x" }, 400],
      [
        "an arm of another class",
        { studentId: p.record.id, decision: "PROMOTED", targetClassArmId: armOfOtherClass, overrideReason: "x" },
        400,
      ],
      [
        "an arm of the class the pupil is leaving, for a promotion",
        { studentId: p.record.id, decision: "PROMOTED", targetClassArmId: w.arms["1B"], overrideReason: "x" },
        400,
      ],
      [
        "an arm for a pupil who is withdrawn",
        { studentId: p.record.id, decision: "WITHDRAWN", targetClassArmId: w.arms["2A"], overrideReason: "x" },
        400,
      ],
      ["an unknown field", { studentId: p.record.id, decision: "REPEATED", overrideReason: "x", reason: "y" }, 400],
      ["an unknown decision", { studentId: p.record.id, decision: "EXPELLED", overrideReason: "x" }, 400],
    ];
    for (const [what, override, status] of cases) {
      const res = await roll(w, "admin", { overrides: [override] });
      expect(res.status, `${what}: ${res.text}`).toBe(status);
    }
    // A pupil listed twice, and an archived arm.
    expect(
      (
        await roll(w, "admin", {
          overrides: [
            { studentId: p.record.id, decision: "REPEATED", overrideReason: "x" },
            { studentId: p.record.id, decision: "PROMOTED", overrideReason: "y" },
          ],
        })
      ).status,
    ).toBe(400);
    await db.classArm.update({ where: { id: w.arms["2B"] }, data: { archivedAt: new Date() } });
    expect(
      (
        await roll(w, "admin", {
          overrides: [{ studentId: p.record.id, decision: "PROMOTED", targetClassArmId: w.arms["2B"], overrideReason: "x" }],
        })
      ).status,
    ).toBe(400);
    // Nothing was written by any of them.
    expect(await db.promotionBatch.count({ where: { tenantId: a.id, sourceClassGroupId: w.g1 } })).toBe(0);
    expect((await db.studentEnrollment.findUnique({ where: { id: p.enrolment.id } }))!.status).toBe("ACTIVE");
  });

  test("promoting from the last class is refused, with the pupil's name", async () => {
    const w = await world();
    const p = await pupil(w, "3A", [70, 70, 70]);
    const res = await roll(w, "admin", {
      sourceClassGroupId: w.g3,
      overrides: [{ studentId: p.record.id, decision: "PROMOTED", overrideReason: "x" }],
    });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toContain(p.record.firstName);
    expect(res.json.error.message).toContain("no next class");
  });
});

test.describe("what makes a roll refused", () => {
  test("a pair of sessions that cannot be a rollover, a session that is not the school's, an unknown class", async () => {
    const w = await world();
    await pupil(w, "1A", [70, 70, 70]);
    expect((await roll(w, "admin", { targetSessionId: w.s1 })).status).toBe(400); // the same session
    expect((await roll(w, "admin", { sourceSessionId: w.s2, targetSessionId: w.s1 })).status).toBe(400); // backwards
    expect((await get(previewUrl(w, { targetSessionId: w.s1 }), "admin")).status).toBe(400);
    expect((await roll(w, "admin", { targetSessionId: "nosuchsession" })).status).toBe(404);
    expect((await roll(w, "admin", { sourceClassGroupId: "nosuchclass" })).status).toBe(404);
    expect((await roll(w, "admin", { sourceClassGroupId: "../etc/passwd" })).status).toBe(400); // not even an id
    const stranger = await db.academicSession.create({
      data: { tenantId: b.id, label: uniq("B-"), startDate: day("2090-09-01"), endDate: day("2091-07-31") },
    });
    expect((await roll(w, "admin", { targetSessionId: stranger.id })).status).toBe(404); // another school's session is "not found"
    // A closed target cannot take pupils.
    await db.academicSession.update({ where: { id: w.s2 }, data: { status: "CLOSED" } });
    expect((await roll(w)).status).toBe(409);
    await db.academicSession.update({ where: { id: w.s2 }, data: { status: "PLANNED", archivedAt: new Date() } });
    expect((await roll(w)).status).toBe(404); // an archived session is not offered
  });

  test("two calendars are not mixed: a campus's session and the whole school's", async () => {
    const w = await world();
    await pupil(w, "1A", [70, 70, 70]);
    await db.academicSession.update({ where: { id: w.s2 }, data: { campusId: north } });
    const res = await roll(w);
    expect(res.status, res.text).toBe(400);
    expect(res.json.error.message).toContain("same calendar");
  });

  test("a class of one campus is not rolled in another campus's calendar", async () => {
    const w = await world({ campusId: north });
    await db.academicSession.updateMany({ where: { id: { in: [w.s1, w.s2] } }, data: { campusId: south } });
    const res = await roll(w);
    expect(res.status, res.text).toBe(400);
    expect(res.json.error.message).toContain("another campus");
  });

  test("a screen that was opened before the classes changed is refused, not obeyed", async () => {
    const w = await world();
    await pupil(w, "1A", [70, 70, 70]);
    const stale = await db.classGroup.create({ data: { tenantId: a.id, name: uniq("Old-"), sortOrder: 2 } });
    await db.classGroup.update({ where: { id: stale.id }, data: { archivedAt: new Date() } });
    expect((await roll(w, "admin", { targetClassGroupId: "somethingelse" })).status).toBe(409);
    expect((await roll(w, "admin", { targetClassGroupId: null })).status).toBe(409); // the screen believed the class is the last
    expect((await roll(w, "admin", { targetClassGroupId: w.g2 })).status).toBe(201); // the right one is accepted
  });

  test("an unknown field, a bad pass mark and a body that is not an object are refused", async () => {
    const w = await world();
    expect((await roll(w, "admin", { surprise: true })).status).toBe(400);
    expect((await roll(w, "admin", { passMark: 120 })).status).toBe(400);
    expect((await roll(w, "admin", { passMark: "50" })).status).toBe(400);
    expect((await roll(w, "admin", { notes: "x".repeat(501) })).status).toBe(400);
    expect(
      (await api(promo("execute"), { ...as("admin"), method: "POST", rawBody: "[]", headers: { "content-type": "application/json" } }))
        .status,
    ).toBe(400);
  });

  test("an empty class cannot be rolled and says why", async () => {
    const w = await world();
    const res = await roll(w);
    expect(res.status).toBe(409);
    expect(res.json.error.message).toContain("Nobody");
  });

  test("a promotion into a class with no arm is refused before anything is written", async () => {
    const w = await world();
    const p = await pupil(w, "1A", [70, 70, 70]);
    await db.classArm.updateMany({ where: { classGroupId: w.g2 }, data: { archivedAt: new Date() } });
    const res = await roll(w);
    expect(res.status, res.text).toBe(409);
    expect(await db.promotionBatch.count({ where: { tenantId: a.id, sourceClassGroupId: w.g1 } })).toBe(0);
    expect((await db.studentEnrollment.findUnique({ where: { id: p.enrolment.id } }))!.status).toBe("ACTIVE"); // rolled back
  });
});

test.describe("the history", () => {
  test("lists the school's own rolls, newest first, and opens one; another school sees none of them", async () => {
    const w = await world();
    await pupil(w, "1A", [70, 70, 70]);
    const first = await roll(w);
    expect(first.status).toBe(201);
    const list = await get(promo("batches"), "admin");
    const ids = (list.json.data.batches as { id: string }[]).map((x) => x.id);
    expect(ids[0]).toBe(first.json.data.batch.id);
    expect(list.json.data.batches[0]).toMatchObject({
      sourceSession: { id: w.s1 },
      targetSession: { id: w.s2 },
      executedBy: { id: people.admin.id },
    });
    expect((await get(promo(`batches/${ids[0]}`), "admin")).status).toBe(200);
    expect((await get(promo("batches", b.code), "adminB")).json.data.batches as unknown[]).toHaveLength(0);
    expect((await get(promo(`batches/${ids[0]}`, b.code), "adminB")).status).toBe(404);
    expect((await get(promo("batches/no-such-batch"), "admin")).status).toBe(404);
    expect((await get(promo("batches/..%2Fx"), "admin")).status).toBe(404);
    expect((await get(promo(`batches/${ids[0]}`), "teacher")).status).toBe(403);
  });
});
