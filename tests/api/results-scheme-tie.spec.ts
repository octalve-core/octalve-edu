import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A saved result is tied to the class's assessment scheme (task 0032), over real HTTP: parts that are not the scheme's are refused with a sentence that says what the scheme has, the exam is one of the
// parts, the total is the scheme's, the first save under a scheme locks it (once, with one audit row), the school-wide scheme is the fallback, and with no scheme the request stands as it always did.
//
// Every scheme here is made through the real endpoint, so a scheme the product cannot make (components + exam must equal the total) never gets into a fixture: the Marks screen of task 0031 was tested against
// hand-made schemes that broke that rule, and its exam mark could not be entered.
//
// Three schools: A (each class has its own scheme), W (only a school-wide scheme), N (no scheme at all). The tests run in order, because the first save under a scheme locks it.

test.describe.configure({ mode: "serial" });

const SAAS = { baseUrl: SAAS_URL };
let counter = 0;
const uniq = (p: string) => `${p}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

type World = { t: TestTenant; sessionId: string; periodId: string; subjectId: string; staffId: string; admin: string; teacher: string };
type Part = { name: string; score: number; maxScore: number };

async function makeWorld(name: string): Promise<World> {
  const t = await createTenant({ name });
  const adminUser = await createUser({ name: `${name} Admin` });
  const teacherUser = await createUser({ name: `${name} Teacher` });
  await addMembership(adminUser.id, t.id, Role.ADMIN);
  await addMembership(teacherUser.id, t.id, Role.TEACHING_STAFF, null);
  const session = await db.academicSession.create({
    data: { tenantId: t.id, label: "2033/2034", startDate: day("2033-09-01"), endDate: day("2034-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: {
      tenantId: t.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2033-09-01"),
      endDate: day("2033-12-15"),
      isCurrent: true,
    },
  });
  const subject = await db.subject.create({ data: { tenantId: t.id, name: "Mathematics" } });
  const staff = await db.staffRecord.create({
    data: { tenantId: t.id, userId: teacherUser.id, category: "TEACHING", firstName: "Tee", lastName: "Teacher" },
  });
  return {
    t,
    sessionId: session.id,
    periodId: period.id,
    subjectId: subject.id,
    staffId: staff.id,
    admin: cookieHeader((await loginAs(adminUser, SAAS)).token!),
    teacher: cookieHeader((await loginAs(teacherUser, SAAS)).token!),
  };
}

/// A class group with one arm, Mathematics offered to it and the teacher assigned to teach it there.
async function klass(w: World, label: string) {
  const group = await db.classGroup.create({ data: { tenantId: w.t.id, name: uniq(`${label} `), sortOrder: ++counter } });
  const arm = await db.classArm.create({ data: { tenantId: w.t.id, classGroupId: group.id, name: "A" } });
  await db.subjectOffering.create({ data: { tenantId: w.t.id, classGroupId: group.id, subjectId: w.subjectId } });
  await db.staffSubjectAssignment.create({
    data: { tenantId: w.t.id, staffRecordId: w.staffId, subjectId: w.subjectId, classArmId: arm.id },
  });
  return { groupId: group.id, armId: arm.id };
}

/// A pupil, enrolled in the arm for the session unless `armId` is null (then on no roll at all).
async function pupil(w: World, armId: string | null) {
  const record = await db.studentRecord.create({
    data: { tenantId: w.t.id, firstName: uniq("P"), lastName: "Tie", dateOfBirth: day("2014-01-01"), admissionNo: uniq("TI/") },
  });
  if (armId)
    await db.studentEnrollment.create({ data: { tenantId: w.t.id, studentId: record.id, sessionId: w.sessionId, classArmId: armId } });
  return record.id;
}

type SchemeBody = { totalMax?: number; examMax: number; components: { name: string; maxScore: number }[] };
async function makeScheme(w: World, classGroupId: string | null, body: SchemeBody) {
  const res = await api(`/api/v1/schools/${w.t.code}/academics/assessment-schemes`, {
    ...SAAS,
    cookie: w.admin,
    method: "POST",
    body: { ...(classGroupId ? { classGroupId } : {}), name: uniq("Scheme "), ...body },
  });
  expect(res.status, res.text).toBe(201);
  return res.json.data.assessmentScheme as { id: string; name: string };
}

const save = (w: World, who: "admin" | "teacher", results: object[]) =>
  api(`/api/v1/schools/${w.t.code}/academics/results`, {
    ...SAAS,
    cookie: w[who],
    method: "POST",
    body: { periodId: w.periodId, subjectId: w.subjectId, results },
  });
const rowsOf = (w: World) => db.result.findMany({ where: { tenantId: w.t.id }, orderBy: { createdAt: "asc" } });
const isLocked = async (schemeId: string) => (await db.assessmentScheme.findUniqueOrThrow({ where: { id: schemeId } })).lockedAt !== null;
const lockAudits = (w: World, schemeId: string) =>
  db.auditLog.count({ where: { tenantId: w.t.id, action: "ASSESSMENT_SCHEME_LOCKED", targetId: schemeId } });

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeAll(async () => {
  await seedInstance();
});

test.describe("school A: a class's own scheme (Test /20 and an exam /30, out of 50)", () => {
  let w: World;
  let f1: { groupId: string; armId: string };
  let scheme: { id: string; name: string };
  let p1: string;
  let p2: string;
  // The parts a save must carry, in the scheme's order, and in another order.
  const good = (test_: number, exam: number): Part[] => [
    { name: "Test", score: test_, maxScore: 20 },
    { name: "Exam", score: exam, maxScore: 30 },
  ];

  test.beforeAll(async () => {
    w = await makeWorld("Tie School A");
    f1 = await klass(w, "Form 1");
    scheme = await makeScheme(w, f1.groupId, { totalMax: 50, examMax: 30, components: [{ name: "Test", maxScore: 20 }] });
    p1 = await pupil(w, f1.armId);
    p2 = await pupil(w, f1.armId);
  });

  test("parts that are not the scheme's are refused with a sentence that says what the scheme has; nothing is saved and nothing is locked", async () => {
    const cases: [string, object, string][] = [
      [
        "a part the scheme does not have",
        { components: [...good(10, 20), { name: "Quiz", score: 3, maxScore: 5 }] },
        `"Quiz" is not a part of the scheme "${scheme.name}"`,
      ],
      [
        "a part out of another maximum",
        {
          components: [
            { name: "Test", score: 10, maxScore: 25 },
            { name: "Exam", score: 20, maxScore: 30 },
          ],
        },
        `"Test" is out of 25 here but out of 20 in the scheme`,
      ],
      ["a missing exam", { components: [{ name: "Test", score: 10, maxScore: 20 }] }, `also needs "Exam"`],
      ["a part sent twice", { components: [...good(10, 20), { name: "Test", score: 1, maxScore: 20 }] }, `"Test" is sent twice`],
      ["a bare score", { score: 30 }, "Send a score for each"],
      ["a total out of something else", { components: good(10, 20), maxScore: 100 }, `is out of 50, not 100`],
      [
        "parts of another case",
        { components: [{ name: "test", score: 10, maxScore: 20 }, ...good(0, 0).slice(1)] },
        `"test" is not a part`,
      ],
    ];
    for (const [label, entry, fragment] of cases) {
      const res = await save(w, "admin", [{ studentId: p1, ...entry }]);
      expect(res.status, `${label}: ${res.text}`).toBe(400);
      expect(res.json.error.code, label).toBe("VALIDATION");
      expect(res.json.error.message, label).toContain(fragment);
    }
    expect(await rowsOf(w)).toEqual([]);
    expect(await isLocked(scheme.id)).toBe(false);
    expect(await lockAudits(w, scheme.id)).toBe(0);
  });

  test("one pupil in the wrong shape refuses the whole request: the pupil who was right is not saved either", async () => {
    const res = await save(w, "admin", [
      { studentId: p1, components: good(10, 20) },
      { studentId: p2, components: [{ name: "Quiz", score: 3, maxScore: 50 }] },
    ]);
    expect(res.status, res.text).toBe(400);
    expect(await rowsOf(w)).toEqual([]);
    expect(await isLocked(scheme.id)).toBe(false);
  });

  test("the scheme's own parts, in any order and with the total left out, are saved: the total is the scheme's, and the first save locks the scheme once, with one audit row", async () => {
    const res = await save(w, "admin", [{ studentId: p1, components: [...good(12, 24)].reverse() }]);
    expect(res.status, res.text).toBe(200);
    const [row] = await rowsOf(w);
    expect(Number(row.score)).toBe(36);
    expect(Number(row.maxScore)).toBe(50); // the scheme's total, though the request said nothing
    expect(row.componentScores).toEqual([...good(12, 24)].reverse());
    expect(await isLocked(scheme.id)).toBe(true);
    expect(await lockAudits(w, scheme.id)).toBe(1);

    // Editing the draft, and a second pupil, change nothing about the lock; a total that equals the scheme's is welcome too.
    const again = await save(w, "admin", [
      { studentId: p1, components: good(15, 25), maxScore: 50 },
      { studentId: p2, components: good(5, 5) },
    ]);
    expect(again.status, again.text).toBe(200);
    expect((await rowsOf(w)).map((r) => Number(r.score)).sort((x, y) => x - y)).toEqual([10, 40]);
    expect(await lockAudits(w, scheme.id)).toBe(1);
  });

  test("a locked scheme cannot be edited in place; a new version is the way, and a draft saved under the old parts must be entered again under the new ones", async () => {
    const url = `/api/v1/schools/${w.t.code}/academics/assessment-schemes/${scheme.id}`;
    const edit = await api(url, { ...SAAS, cookie: w.admin, method: "PATCH", body: { name: uniq("Renamed ") } });
    expect(edit.status).toBe(409);
    expect(edit.json.error.code).toBe("LOCKED");

    // Version 2: Test /15 and Quiz /15 with the exam /20 (still out of 50).
    const v2 = await api(`${url}/new-version`, {
      ...SAAS,
      cookie: w.admin,
      method: "POST",
      body: {
        examMax: 20,
        components: [
          { name: "Test", maxScore: 15 },
          { name: "Quiz", maxScore: 15 },
        ],
      },
    });
    expect(v2.status, v2.text).toBe(201);
    const next = v2.json.data.assessmentScheme as { id: string };

    // p1's draft carries version 1's parts; saving it again with them is refused with a sentence that names the new scheme's parts.
    const stale = await save(w, "admin", [{ studentId: p1, components: good(15, 25) }]);
    expect(stale.status, stale.text).toBe(400);
    expect(stale.json.error.message).toContain("in the scheme");
    // Under version 2's parts it is saved, and version 2 is locked in its turn; version 1's audit row stays the only one it has.
    const fresh = await save(w, "admin", [
      {
        studentId: p1,
        components: [
          { name: "Test", score: 10, maxScore: 15 },
          { name: "Quiz", score: 10, maxScore: 15 },
          { name: "Exam", score: 15, maxScore: 20 },
        ],
      },
    ]);
    expect(fresh.status, fresh.text).toBe(200);
    expect(await isLocked(next.id)).toBe(true);
    expect(await lockAudits(w, next.id)).toBe(1);
    expect(await lockAudits(w, scheme.id)).toBe(1);
  });

  test("a teacher saves under the same rule: the scheme's parts are accepted, a part of their own is refused", async () => {
    const live = await db.assessmentScheme.findFirstOrThrow({
      where: { tenantId: w.t.id, classGroupId: f1.groupId, archivedAt: null },
      include: { components: true },
    });
    const parts = [
      ...live.components.map((c) => ({ name: c.name, score: 1, maxScore: Number(c.maxScore) })),
      { name: "Exam", score: 1, maxScore: Number(live.examMax) },
    ];
    const ok = await save(w, "teacher", [{ studentId: p2, components: parts }]);
    expect(ok.status, ok.text).toBe(200);
    const bad = await save(w, "teacher", [{ studentId: p2, components: [{ name: "Mine", score: 1, maxScore: 50 }] }]);
    expect(bad.status, bad.text).toBe(400);
    expect(bad.json.error.message).toContain(`"Mine" is not a part`);
  });

  test("two classes in one request are each held to their own scheme, and both are locked; one class's parts do not pass for another's", async () => {
    const f2 = await klass(w, "Form 2");
    const s2 = await makeScheme(w, f2.groupId, {
      examMax: 60,
      components: [
        { name: "CA 1", maxScore: 20 },
        { name: "CA 2", maxScore: 20 },
      ],
    });
    const q1 = await pupil(w, f2.armId);
    const f2Parts: Part[] = [
      { name: "CA 1", score: 10, maxScore: 20 },
      { name: "CA 2", score: 10, maxScore: 20 },
      { name: "Exam", score: 40, maxScore: 60 },
    ];
    const live1 = await db.assessmentScheme.findFirstOrThrow({
      where: { tenantId: w.t.id, classGroupId: f1.groupId, archivedAt: null },
      include: { components: true },
    });
    const f1Parts = [
      ...live1.components.map((c) => ({ name: c.name, score: 2, maxScore: Number(c.maxScore) })),
      { name: "Exam", score: 2, maxScore: Number(live1.examMax) },
    ];

    const cross = await save(w, "admin", [{ studentId: q1, components: f1Parts }]);
    expect(cross.status, cross.text).toBe(400);
    expect(await isLocked(s2.id)).toBe(false);

    const both = await save(w, "admin", [
      { studentId: p1, components: f1Parts },
      { studentId: q1, components: f2Parts },
    ]);
    expect(both.status, both.text).toBe(200);
    expect(await isLocked(s2.id)).toBe(true);
    expect(await lockAudits(w, s2.id)).toBe(1);
  });

  test("saves at the same moment lock the scheme once; and a save waits for a scheme edit that is in progress (it takes the edit's lock in its shared form)", async () => {
    // Six saves at once under one unlocked scheme: all succeed, one audit row.
    const f3 = await klass(w, "Form 3");
    const s3 = await makeScheme(w, f3.groupId, { totalMax: 50, examMax: 30, components: [{ name: "Test", maxScore: 20 }] });
    const six = await Promise.all(Array.from({ length: 6 }, () => pupil(w, f3.armId)));
    const done = await Promise.all(six.map((id) => save(w, "admin", [{ studentId: id, components: good(10, 10) }])));
    expect(done.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(await isLocked(s3.id)).toBe(true);
    expect(await lockAudits(w, s3.id)).toBe(1);

    // An edit in progress holds the school's scheme lock exclusively; a save started meanwhile does not finish until it lets go.
    const f4 = await klass(w, "Form 4");
    const s4 = await makeScheme(w, f4.groupId, { totalMax: 50, examMax: 30, components: [{ name: "Test", maxScore: 20 }] });
    const lateOne = await pupil(w, f4.armId);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let acquired!: () => void;
    const holding = new Promise<void>((resolve) => (acquired = resolve));
    const editor = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assessment-scheme:${w.t.id}`}::text))`;
        acquired();
        await gate;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    await holding;
    const pending = save(w, "admin", [{ studentId: lateOne, components: good(10, 10) }]);
    const state = await Promise.race([
      pending.then(() => "finished"),
      new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 2_500)),
    ]);
    expect(state).toBe("waiting");
    expect(await isLocked(s4.id)).toBe(false);
    release();
    await editor;
    const after = await pending;
    expect(after.status, after.text).toBe(200);
    expect(await isLocked(s4.id)).toBe(true);
  });
});

test.describe("school W: the school-wide scheme is the fallback (CA /40 and an exam /60)", () => {
  let w: World;
  let wide: { id: string; name: string };
  const wideParts: Part[] = [
    { name: "CA", score: 30, maxScore: 40 },
    { name: "Exam", score: 45, maxScore: 60 },
  ];

  test.beforeAll(async () => {
    w = await makeWorld("Tie School W");
    wide = await makeScheme(w, null, { examMax: 60, components: [{ name: "CA", maxScore: 40 }] });
  });

  test("a class with no scheme of its own is held to the school's; so is a pupil on no roll that session", async () => {
    const g = await klass(w, "Year 5");
    const onRoll = await pupil(w, g.armId);
    const offRoll = await pupil(w, null);
    for (const studentId of [onRoll, offRoll]) {
      const bad = await save(w, "admin", [{ studentId, components: [{ name: "Test", score: 5, maxScore: 10 }] }]);
      expect(bad.status, bad.text).toBe(400);
      expect(bad.json.error.message).toContain(`not a part of the scheme "${wide.name}"`);
    }
    expect(await isLocked(wide.id)).toBe(false);
    const ok = await save(w, "admin", [
      { studentId: onRoll, components: wideParts },
      { studentId: offRoll, components: wideParts },
    ]);
    expect(ok.status, ok.text).toBe(200);
    expect(await isLocked(wide.id)).toBe(true);
    expect(await lockAudits(w, wide.id)).toBe(1);
  });

  test("a class's own scheme wins over the school's: the school's parts are refused there", async () => {
    const h = await klass(w, "Year 6");
    const own = await makeScheme(w, h.groupId, { totalMax: 50, examMax: 30, components: [{ name: "Test", maxScore: 20 }] });
    const h1 = await pupil(w, h.armId);
    const refused = await save(w, "admin", [{ studentId: h1, components: wideParts }]);
    expect(refused.status, refused.text).toBe(400);
    expect(refused.json.error.message).toContain(`"CA" is not a part of the scheme "${own.name}"`);
    const ok = await save(w, "admin", [
      {
        studentId: h1,
        components: [
          { name: "Test", score: 10, maxScore: 20 },
          { name: "Exam", score: 20, maxScore: 30 },
        ],
      },
    ]);
    expect(ok.status, ok.text).toBe(200);
  });

  test("an archived scheme is not in force: its class falls back to the school's", async () => {
    const k = await klass(w, "Year 7");
    const own = await makeScheme(w, k.groupId, { totalMax: 50, examMax: 30, components: [{ name: "Test", maxScore: 20 }] });
    const k1 = await pupil(w, k.armId);
    // While its own scheme is live, the school's parts are not its parts...
    const before = await save(w, "admin", [{ studentId: k1, components: wideParts }]);
    expect(before.status, before.text).toBe(400);
    await db.assessmentScheme.update({ where: { id: own.id }, data: { archivedAt: new Date() } });
    const ok = await save(w, "admin", [{ studentId: k1, components: wideParts }]);
    expect(ok.status, ok.text).toBe(200);
  });
});

test.describe("school N: no scheme in force, so the request stands as it always did", () => {
  let w: World;
  let n1: string;

  test.beforeAll(async () => {
    w = await makeWorld("Tie School N");
    const g = await klass(w, "Class");
    n1 = await pupil(w, g.armId);
  });

  test("any parts, a bare score and an explicit total are all accepted; the total defaults to 100; nothing is locked", async () => {
    const free = await save(w, "admin", [
      {
        studentId: n1,
        components: [
          { name: "Quiz", score: 7, maxScore: 10 },
          { name: "Project", score: 20, maxScore: 30 },
        ],
      },
    ]);
    expect(free.status, free.text).toBe(200);
    let [row] = await rowsOf(w);
    expect(Number(row.score)).toBe(27);
    expect(Number(row.maxScore)).toBe(100);

    const bare = await save(w, "admin", [{ studentId: n1, score: 55 }]);
    expect(bare.status, bare.text).toBe(200);
    const sized = await save(w, "admin", [{ studentId: n1, score: 40, maxScore: 50 }]);
    expect(sized.status, sized.text).toBe(200);
    [row] = await rowsOf(w);
    expect([Number(row.score), Number(row.maxScore)]).toEqual([40, 50]);
    expect(await db.auditLog.count({ where: { tenantId: w.t.id, action: "ASSESSMENT_SCHEME_LOCKED" } })).toBe(0);
  });
});
