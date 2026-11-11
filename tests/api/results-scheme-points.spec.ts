import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The three decisions on the points left open by task 0032, built in task 0048, over real HTTP:
//  - a school names the exam part of its scheme ("Final Examination", "Endterm"): cleaned, 1 to 40 characters, never a component's name, carried into a new version, in the snapshot, on the marks sheet and
//    the import template, and frozen with the scheme (the database refuses a change to a locked one);
//  - the first result saved by the default grade scale locks that scale (once, with one audit row), and a refused save locks nothing;
//  - a bare score where the scheme has parts stays refused.
// Every scheme and scale is made through the real endpoints. The tests run in order: a save locks.

test.describe.configure({ mode: "serial" });

const SAAS = { baseUrl: SAAS_URL };
let counter = 0;
const uniq = (p: string) => `${p}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const BANDS = [
  { min: 0, max: 40, letter: "F", remark: "Fail" },
  { min: 40, max: 70, letter: "C", remark: "Credit" },
  { min: 70, max: 100, letter: "A", remark: "Excellent" },
];

let t: TestTenant;
let admin: string;
let sessionId: string;
let periodId: string;
let subjectId: string;
let armId: string;
let groupId: string;
let p1: string;

const base = () => `/api/v1/schools/${t.code}/academics`;
const post = (url: string, body: object) => api(url, { ...SAAS, cookie: admin, method: "POST", body });
const patch = (url: string, body: object) => api(url, { ...SAAS, cookie: admin, method: "PATCH", body });
const get = (url: string) => api(url, { ...SAAS, cookie: admin });
const schemes = () => `${base()}/assessment-schemes`;
const save = (results: object[]) => post(`${base()}/results`, { periodId, subjectId, results });
const resultCount = () => db.result.count({ where: { tenantId: t.id } });
type SchemeJson = { id: string; name: string; examName: string | null; version: number; locked: boolean; examMax: number };
const schemeOf = (res: { json: { data: { assessmentScheme: SchemeJson } } }) => res.json.data.assessmentScheme;

/// A class group with its own arm and offering, and a new pupil on its roll.
async function newClass(label: string) {
  const group = await db.classGroup.create({ data: { tenantId: t.id, name: uniq(`${label} `), sortOrder: ++counter } });
  const arm = await db.classArm.create({ data: { tenantId: t.id, classGroupId: group.id, name: "A" } });
  await db.subjectOffering.create({ data: { tenantId: t.id, classGroupId: group.id, subjectId } });
  return { groupId: group.id, armId: arm.id };
}
async function newPupil(arm: string) {
  const record = await db.studentRecord.create({
    data: { tenantId: t.id, firstName: uniq("P"), lastName: "Points", dateOfBirth: day("2014-01-01"), admissionNo: uniq("PT/") },
  });
  await db.studentEnrollment.create({ data: { tenantId: t.id, studentId: record.id, sessionId, classArmId: arm } });
  return record.id;
}

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Points School" });
  const user = await createUser({ name: "Points Admin" });
  await addMembership(user.id, t.id, Role.ADMIN);
  admin = cookieHeader((await loginAs(user, SAAS)).token!);
  sessionId = (
    await db.academicSession.create({
      data: { tenantId: t.id, label: "2037/2038", startDate: day("2037-09-01"), endDate: day("2038-07-20"), status: "ACTIVE" },
    })
  ).id;
  periodId = (
    await db.academicPeriod.create({
      data: {
        tenantId: t.id,
        sessionId,
        kind: "TERM",
        ordinal: 1,
        label: "First Term",
        startDate: day("2037-09-01"),
        endDate: day("2037-12-15"),
        isCurrent: true,
      },
    })
  ).id;
  subjectId = (await db.subject.create({ data: { tenantId: t.id, name: "Mathematics" } })).id;
  const k = await newClass("Form 1");
  groupId = k.groupId;
  armId = k.armId;
  p1 = await newPupil(armId);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("the name of the exam part", () => {
  let scheme: SchemeJson;

  test("a school names its exam: the name is cleaned, kept, shown by the API and part of the snapshot", async () => {
    const res = await post(schemes(), {
      classGroupId: groupId,
      name: uniq("Named "),
      examMax: 60,
      examName: "  Final   Examination ",
      components: [
        { name: "CA 1", maxScore: 20 },
        { name: "CA 2", maxScore: 20 },
      ],
    });
    expect(res.status, res.text).toBe(201);
    scheme = schemeOf(res);
    expect(scheme.examName).toBe("Final Examination");
    const one = await get(`${schemes()}/${scheme.id}`);
    expect(one.json.data.assessmentScheme.examName).toBe("Final Examination");
    expect(one.json.data.snapshot.json).toContain('"examMax":"60.00","examName":"Final Examination","components"');
    const audit = await db.auditLog.findFirst({ where: { tenantId: t.id, action: "ASSESSMENT_SCHEME_CREATED", targetId: scheme.id } });
    expect(audit?.afterValue).toMatchObject({ examName: "Final Examination" });
  });

  test("no name, null or a blank one is the default: examName null, and the snapshot is what it always was", async () => {
    for (const body of [{}, { examName: null }, { examName: "   " }]) {
      const k = await newClass("Default");
      const res = await post(schemes(), {
        classGroupId: k.groupId,
        name: uniq("Plain "),
        examMax: 60,
        components: [{ name: "CA", maxScore: 40 }],
        ...body,
      });
      expect(res.status, `${JSON.stringify(body)} ${res.text}`).toBe(201);
      expect(schemeOf(res).examName, JSON.stringify(body)).toBeNull();
      const snap = (await get(`${schemes()}/${schemeOf(res).id}`)).json.data.snapshot.json as string;
      expect(snap).not.toContain("examName");
    }
  });

  test("a name that is too long, the same as a component's (in any case), given for an exam worth nothing, or not text is refused with its own sentence and nothing is made", async () => {
    const before = await db.assessmentScheme.count({ where: { tenantId: t.id } });
    const cases: [string, object, string, string][] = [
      ["41 characters", { examMax: 60, examName: "x".repeat(41) }, "body.examName", "1 to 40 characters"],
      ["a component's name", { examMax: 60, examName: "ca" }, "body.examName", "A component already has that name"],
      [
        "no exam to name",
        { examMax: 0, examName: "Endterm", components: [{ name: "CA", maxScore: 100 }] },
        "body.examName",
        "worth nothing",
      ],
      ["not text", { examMax: 60, examName: 7 }, "body.examName", ""],
    ];
    for (const [what, extra, path, words] of cases) {
      const k = await newClass("Bad");
      const res = await post(schemes(), {
        classGroupId: k.groupId,
        name: uniq("Bad "),
        components: [{ name: "CA", maxScore: 40 }],
        ...extra,
      });
      expect(res.status, `${what}: ${res.text}`).toBe(400);
      expect(res.json.error.code, what).toBe("VALIDATION");
      expect(JSON.stringify(res.json.error.details ?? res.json.error), what).toContain(path);
      if (words) expect(res.json.error.message, what).toContain(words);
    }
    expect(await db.assessmentScheme.count({ where: { tenantId: t.id } })).toBe(before);
  });

  test("the marks sheet and the import template call the exam what the school called it", async () => {
    const sheet = await get(`${base()}/results/sheet?periodId=${periodId}&classArmId=${armId}&subjectId=${subjectId}`);
    expect(sheet.status, sheet.text).toBe(200);
    expect(sheet.json.data.scheme.examName).toBe("Final Examination");
    expect(sheet.json.data.scheme.parts.map((p: { name: string }) => p.name)).toEqual(["CA 1", "CA 2", "Final Examination"]);
    const template = await get(`${base()}/results/import-template?periodId=${periodId}&classArmId=${armId}&subjectId=${subjectId}`);
    expect(template.status).toBe(200);
    expect(template.bytes.toString("utf8").slice(1).split("\r\n")[0]).toBe("admission_no,name,CA 1 (20),CA 2 (20),Final Examination (60)");
  });

  test("a save must use that name: the default name is refused with a sentence that lists the scheme's parts; the school's name is saved and locks the scheme", async () => {
    const wrong = await save([
      {
        studentId: p1,
        components: [
          { name: "CA 1", score: 10, maxScore: 20 },
          { name: "CA 2", score: 10, maxScore: 20 },
          { name: "Exam", score: 40, maxScore: 60 },
        ],
      },
    ]);
    expect(wrong.status, wrong.text).toBe(400);
    expect(wrong.json.error.message).toContain('"Exam" is not a part of the scheme');
    expect(wrong.json.error.message).toContain("Final Examination (out of 60)");
    expect(await resultCount()).toBe(0);
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: scheme.id } })).lockedAt).toBeNull();

    const right = await save([
      {
        studentId: p1,
        components: [
          { name: "CA 1", score: 10, maxScore: 20 },
          { name: "CA 2", score: 10, maxScore: 20 },
          { name: "Final Examination", score: 40, maxScore: 60 },
        ],
      },
    ]);
    expect(right.status, right.text).toBe(200);
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: scheme.id } })).lockedAt).not.toBeNull();
  });

  test("once locked the name is frozen: a PATCH is 409 LOCKED, and the database itself refuses to change it, to set it or to clear it", async () => {
    const refused = await patch(`${schemes()}/${scheme.id}`, { examName: "Endterm" });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("LOCKED");
    await expect(db.assessmentScheme.update({ where: { id: scheme.id }, data: { examName: "Endterm" } })).rejects.toThrow(/locked/);
    await expect(db.assessmentScheme.update({ where: { id: scheme.id }, data: { examName: null } })).rejects.toThrow(/locked/);
    // An unnamed scheme that is locked cannot be given a name either: null -> text is a change.
    const k = await newClass("Locked plain");
    const plain = schemeOf(
      await post(schemes(), { classGroupId: k.groupId, name: uniq("Plain "), examMax: 60, components: [{ name: "CA", maxScore: 40 }] }),
    );
    await post(`${base()}/results`, {
      periodId,
      subjectId,
      results: [
        {
          studentId: await newPupil(k.armId),
          components: [
            { name: "CA", score: 30, maxScore: 40 },
            { name: "Exam", score: 40, maxScore: 60 },
          ],
        },
      ],
    });
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: plain.id } })).lockedAt).not.toBeNull();
    await expect(db.assessmentScheme.update({ where: { id: plain.id }, data: { examName: "Endterm" } })).rejects.toThrow(/locked/);
    // Archiving a locked scheme is still allowed (it is not one of the frozen fields).
    await db.assessmentScheme.update({ where: { id: plain.id }, data: { archivedAt: new Date() } });
  });

  test("a new version keeps the name unless it is given another, and the old version keeps its own", async () => {
    const kept = await post(`${schemes()}/${scheme.id}/new-version`, {});
    expect(kept.status, kept.text).toBe(201);
    expect(schemeOf(kept)).toMatchObject({ version: 2, examName: "Final Examination" });
    const renamed = await post(`${schemes()}/${schemeOf(kept).id}/new-version`, {});
    expect(renamed.status).toBe(409); // an unlocked version is edited in place, not versioned
    const edited = await patch(`${schemes()}/${schemeOf(kept).id}`, { examName: "Endterm" });
    expect(edited.status, edited.text).toBe(200);
    expect(schemeOf(edited).examName).toBe("Endterm");
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: scheme.id } })).examName).toBe("Final Examination");
    const cleared = await patch(`${schemes()}/${schemeOf(kept).id}`, { examName: null });
    expect(schemeOf(cleared).examName).toBeNull();
    const untouched = await patch(`${schemes()}/${schemeOf(kept).id}`, { examMax: 60 });
    expect(schemeOf(untouched).examName).toBeNull(); // a PATCH that does not mention the name leaves it as it is
    expect(untouched.json.data.changed).toBe(false);
  });

  test("a new version of a locked scheme can carry a new name, with the audit row", async () => {
    const k = await newClass("Versioned");
    const first = schemeOf(
      await post(schemes(), {
        classGroupId: k.groupId,
        name: uniq("V "),
        examMax: 60,
        examName: "Exam one",
        components: [{ name: "CA", maxScore: 40 }],
      }),
    );
    const saved = await post(`${base()}/results`, {
      periodId,
      subjectId,
      results: [
        {
          studentId: await newPupil(k.armId),
          components: [
            { name: "CA", score: 30, maxScore: 40 },
            { name: "Exam one", score: 40, maxScore: 60 },
          ],
        },
      ],
    });
    expect(saved.status, saved.text).toBe(200);
    const next = await post(`${schemes()}/${first.id}/new-version`, { examName: "Exam two" });
    expect(next.status, next.text).toBe(201);
    expect(schemeOf(next)).toMatchObject({ version: 2, examName: "Exam two" });
    const audit = await db.auditLog.findFirst({
      where: { tenantId: t.id, action: "ASSESSMENT_SCHEME_NEW_VERSION", targetId: schemeOf(next).id },
    });
    expect(audit?.afterValue).toMatchObject({ examName: "Exam two" });
    expect(audit?.beforeValue).toMatchObject({ examName: "Exam one" });
  });
});

test.describe("a bare score where the scheme has parts", () => {
  test("is refused, with a sentence that lists the parts, and nothing is saved or locked", async () => {
    const k = await newClass("Bare");
    const s = schemeOf(
      await post(schemes(), {
        classGroupId: k.groupId,
        name: uniq("Bare "),
        examMax: 60,
        components: [{ name: "CA", maxScore: 40 }],
      }),
    );
    const before = await resultCount();
    const res = await save([{ studentId: await newPupil(k.armId), score: 55 }]);
    expect(res.status, res.text).toBe(400);
    expect(res.json.error.message).toContain(`The scheme "${s.name}" has parts: CA (out of 40), Exam (out of 60). Send a score for each.`);
    expect(await resultCount()).toBe(before);
    expect((await db.assessmentScheme.findUniqueOrThrow({ where: { id: s.id } })).lockedAt).toBeNull();
  });
});

test.describe("the default grade scale", () => {
  let scale: { id: string };
  let armOfScale: string;
  const lockAudits = () => db.auditLog.count({ where: { tenantId: t.id, action: "GRADE_SCALE_LOCKED", targetId: scale.id } });
  const scaleRow = () => db.gradeScale.findUniqueOrThrow({ where: { id: scale.id } });

  test("a save with no default scale locks no scale and writes no scale audit row", async () => {
    const k = await newClass("No scale");
    const res = await save([{ studentId: await newPupil(k.armId), score: 61 }]);
    expect(res.status, res.text).toBe(200);
    expect(await db.auditLog.count({ where: { tenantId: t.id, action: "GRADE_SCALE_LOCKED" } })).toBe(0);
  });

  test("with a default scale, a refused save locks nothing; the first save that grades a result locks the scale once, with one audit row", async () => {
    const made = await post(`${base()}/grade-scales`, { name: uniq("Scale "), bands: BANDS });
    expect(made.status, made.text).toBe(201);
    scale = made.json.data.gradeScale;
    expect((await post(`${base()}/grade-scales/${scale.id}/make-default`, {})).status).toBe(200);
    expect((await scaleRow()).lockedAt).toBeNull();

    const k = await newClass("Graded");
    armOfScale = k.armId;
    const pupil = await newPupil(armOfScale);
    const refused = await save([{ studentId: pupil, score: 9999 }]); // out of bounds: refused before any write
    expect(refused.status).toBe(400);
    expect((await scaleRow()).lockedAt).toBeNull();
    expect(await lockAudits()).toBe(0);

    const first = await save([{ studentId: pupil, score: 75 }]);
    expect(first.status, first.text).toBe(200);
    expect((await scaleRow()).lockedAt).not.toBeNull();
    expect(await lockAudits()).toBe(1);
    const audit = await db.auditLog.findFirst({ where: { tenantId: t.id, action: "GRADE_SCALE_LOCKED", targetId: scale.id } });
    expect(audit).toMatchObject({ beforeValue: { locked: false }, afterValue: { locked: true, periodId } });
    // The grade it stored is the scale's.
    expect((await db.result.findFirstOrThrow({ where: { tenantId: t.id, studentId: pupil } })).gradeLetter).toBe("A");

    const second = await save([{ studentId: await newPupil(armOfScale), score: 30 }]);
    expect(second.status, second.text).toBe(200);
    expect(await lockAudits()).toBe(1); // locked once, audited once
  });

  test("saves at the same moment lock the scale once; and a save waits for a scale edit that is in progress (it takes the edit's lock in its shared form)", async () => {
    // A fresh school, so nothing has locked its scale yet.
    const w = await createTenant({ name: "Scale Race School" });
    const user = await createUser({ name: "Scale Race Admin" });
    await addMembership(user.id, w.id, Role.ADMIN);
    const cookie = cookieHeader((await loginAs(user, SAAS)).token!);
    const session = await db.academicSession.create({
      data: { tenantId: w.id, label: "2038/2039", startDate: day("2038-09-01"), endDate: day("2039-07-20"), status: "ACTIVE" },
    });
    const period = await db.academicPeriod.create({
      data: {
        tenantId: w.id,
        sessionId: session.id,
        kind: "TERM",
        ordinal: 1,
        label: "First Term",
        startDate: day("2038-09-01"),
        endDate: day("2038-12-15"),
        isCurrent: true,
      },
    });
    const subject = await db.subject.create({ data: { tenantId: w.id, name: "Mathematics" } });
    const group = await db.classGroup.create({ data: { tenantId: w.id, name: "Form 1", sortOrder: 1 } });
    const arm = await db.classArm.create({ data: { tenantId: w.id, classGroupId: group.id, name: "A" } });
    const pupilOf = async () => {
      const record = await db.studentRecord.create({
        data: { tenantId: w.id, firstName: uniq("R"), lastName: "Race", dateOfBirth: day("2014-01-01"), admissionNo: uniq("RC/") },
      });
      await db.studentEnrollment.create({ data: { tenantId: w.id, studentId: record.id, sessionId: session.id, classArmId: arm.id } });
      return record.id;
    };
    const saveOf = (studentId: string) =>
      api(`/api/v1/schools/${w.code}/academics/results`, {
        ...SAAS,
        cookie,
        method: "POST",
        body: { periodId: period.id, subjectId: subject.id, results: [{ studentId, score: 80 }] },
      });
    const made = await api(`/api/v1/schools/${w.code}/academics/grade-scales`, {
      ...SAAS,
      cookie,
      method: "POST",
      body: { name: uniq("Race "), bands: BANDS },
    });
    expect(made.status, made.text).toBe(201);
    const raceScale = made.json.data.gradeScale as { id: string };
    await api(`/api/v1/schools/${w.code}/academics/grade-scales/${raceScale.id}/make-default`, {
      ...SAAS,
      cookie,
      method: "POST",
      body: {},
    });
    const audits = () => db.auditLog.count({ where: { tenantId: w.id, action: "GRADE_SCALE_LOCKED", targetId: raceScale.id } });

    // An edit in progress holds the school's scale lock exclusively; a save started meanwhile does not finish until it lets go, and then locks the scale it graded by.
    const waiting = await pupilOf();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let acquired!: () => void;
    const holding = new Promise<void>((resolve) => (acquired = resolve));
    const editor = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`grade-scale:${w.id}`}::text))`;
        acquired();
        await gate;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    await holding;
    const pending = saveOf(waiting);
    const state = await Promise.race([
      pending.then(() => "finished"),
      new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 2_500)),
    ]);
    expect(state).toBe("waiting");
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: raceScale.id } })).lockedAt).toBeNull();
    release();
    await editor;
    const after = await pending;
    expect(after.status, after.text).toBe(200);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: raceScale.id } })).lockedAt).not.toBeNull();
    expect(await audits()).toBe(1);

    // Several saves at once under an unlocked scale (the new version of the locked one takes the default flag and starts unlocked): all succeed, the scale is locked once and audited once.
    const next = await api(`/api/v1/schools/${w.code}/academics/grade-scales/${raceScale.id}/new-version`, {
      ...SAAS,
      cookie,
      method: "POST",
      body: { name: uniq("Race v2 ") },
    });
    expect(next.status, next.text).toBe(201);
    const successor = next.json.data.gradeScale as { id: string; isDefault: boolean };
    expect(successor.isDefault).toBe(true);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: successor.id } })).lockedAt).toBeNull();
    const five = await Promise.all(Array.from({ length: 5 }, () => pupilOf()));
    const done = await Promise.all(five.map((id) => saveOf(id)));
    expect(done.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await db.gradeScale.findUniqueOrThrow({ where: { id: successor.id } })).lockedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { tenantId: w.id, action: "GRADE_SCALE_LOCKED", targetId: successor.id } })).toBe(1);
    expect(await audits()).toBe(1); // the first scale was not audited again
  });

  test("the locked scale cannot be edited in place (409 LOCKED); a new version is the way, and it keeps the default", async () => {
    const refused = await patch(`${base()}/grade-scales/${scale.id}`, { bands: BANDS.map((b) => ({ ...b, remark: `${b.remark}!` })) });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("LOCKED");
    const next = await post(`${base()}/grade-scales/${scale.id}/new-version`, {
      bands: BANDS.map((b) => ({ ...b, remark: `${b.remark}!` })),
    });
    expect(next.status, next.text).toBe(201);
    expect(next.json.data.gradeScale).toMatchObject({ isDefault: true });
    // The result stored under the old scale keeps its letter and remark.
    const old = await db.result.findFirstOrThrow({ where: { tenantId: t.id, gradeLetter: "A" } });
    expect(old.gradeRemark).toBe("Excellent");
  });
});
