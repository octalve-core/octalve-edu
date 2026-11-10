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

// The reads behind the Results screens (task 0031): the options the Marks tab offers, the marks sheet and the class list of the report-cards tab, over real HTTP. Who gets which, the campus rule, the
// assignment rule, what the sheet shows (the roster, the scheme's parts, what is saved) and that a sheet and the existing save agree.
//
// School A has two campuses, North and South, and the pupils and subjects below; school B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let counter = 0;
const uniq = (p: string) => `${p}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const base = (code = a.code) => `/api/v1/schools/${code}/academics/results`;
const get = (url: string, who: string) => api(url, as(who));

let sessionId: string;
let periodId: string;
let groupId: string;
let armA: string;
let armB: string;
let northGroup: string;
let northArm: string;
let southArm: string;
let maths: string;
let english: string;
const pupils: Record<string, string> = {};

async function pupil(name: string, armId: string, over: Record<string, unknown> = {}, enrol: Record<string, unknown> = {}) {
  const record = await db.studentRecord.create({
    data: { tenantId: a.id, firstName: name, lastName: "Sheet", dateOfBirth: day("2014-01-01"), admissionNo: uniq("SH/"), ...over },
  });
  await db.studentEnrollment.create({ data: { tenantId: a.id, studentId: record.id, sessionId, classArmId: armId, ...enrol } });
  return record.id;
}
const teacherOf = async (who: string, campusId: string | null = null) => {
  const record = await db.staffRecord.create({
    data: { tenantId: a.id, userId: people[who].id, category: "TEACHING", firstName: who, lastName: "Teacher", campusId },
  });
  return record.id;
};

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Sheet School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Sheet School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of [
    "admin",
    "campusAdmin",
    "mathsTeacher",
    "idleTeacher",
    "slotTeacher",
    "northTeacher",
    "registrar",
    "northRegistrar",
    "pupilUser",
    "adminB",
  ])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusAdmin.id, a.id, Role.CAMPUS_ADMIN, north);
  for (const who of ["mathsTeacher", "idleTeacher", "slotTeacher"]) await addMembership(people[who].id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.northTeacher.id, a.id, Role.TEACHING_STAFF, north);
  await addMembership(people.registrar.id, a.id, Role.NON_TEACHING_STAFF, null);
  await addMembership(people.northRegistrar.id, a.id, Role.NON_TEACHING_STAFF, north);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, null);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);

  sessionId = (
    await db.academicSession.create({
      data: { tenantId: a.id, label: "2031/2032", startDate: day("2031-09-01"), endDate: day("2032-07-20"), status: "ACTIVE" },
    })
  ).id;
  periodId = (
    await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId,
        kind: "TERM",
        ordinal: 1,
        label: "First Term",
        startDate: day("2031-09-01"),
        endDate: day("2031-12-15"),
        isCurrent: true,
      },
    })
  ).id;
  groupId = (await db.classGroup.create({ data: { tenantId: a.id, name: "Form 1", sortOrder: 1 } })).id;
  northGroup = (await db.classGroup.create({ data: { tenantId: a.id, name: "Form 1 North", sortOrder: 2, campusId: north } })).id;
  const southGroup = (await db.classGroup.create({ data: { tenantId: a.id, name: "Form 1 South", sortOrder: 3, campusId: south } })).id;
  armA = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupId, name: "A" } })).id;
  armB = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupId, name: "B" } })).id;
  northArm = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: northGroup, name: "N" } })).id;
  southArm = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: southGroup, name: "S" } })).id;
  maths = (await db.subject.create({ data: { tenantId: a.id, name: "Mathematics" } })).id;
  english = (await db.subject.create({ data: { tenantId: a.id, name: "English" } })).id;
  for (const [g, s] of [
    [groupId, maths],
    [groupId, english],
    [northGroup, maths],
    [southGroup, maths],
  ] as const)
    await db.subjectOffering.create({ data: { tenantId: a.id, classGroupId: g, subjectId: s } });

  // Mathematics in Form 1 A is Ms Maths's; Mrs Slot only has a timetable slot there; Mr North teaches Mathematics in the north arm.
  const mathsStaff = await teacherOf("mathsTeacher");
  await db.staffSubjectAssignment.create({ data: { tenantId: a.id, staffRecordId: mathsStaff, subjectId: maths, classArmId: armA } });
  const slotStaff = await teacherOf("slotTeacher");
  await db.timetableSlot.create({
    data: {
      tenantId: a.id,
      classArmId: armA,
      subjectId: maths,
      staffRecordId: slotStaff,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "08:40",
    },
  });
  await teacherOf("idleTeacher");
  const northStaff = await teacherOf("northTeacher", north);
  await db.staffSubjectAssignment.create({ data: { tenantId: a.id, staffRecordId: northStaff, subjectId: maths, classArmId: northArm } });

  pupils.ada = await pupil("Ada", armA);
  pupils.bayo = await pupil("Bayo", armA);
  pupils.chi = await pupil("Chi", armA, { standing: "SUSPENDED" });
  pupils.expelled = await pupil("Expelled", armA, { standing: "EXPELLED" }, { status: "EXPELLED" });
  pupils.archived = await pupil("Archived", armA, { archivedAt: new Date() });
  pupils.other = await pupil("Otherarm", armB);
  pupils.north = await pupil("Nora", northArm, { campusId: north });
  pupils.south = await pupil("Sade", southArm, { campusId: south });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const sheetUrl = (armId = armA, subjectId = maths, code = a.code) =>
  `${base(code)}/sheet?${new URLSearchParams({ periodId, classArmId: armId, subjectId })}`;
const rosterUrl = (armId = armA, code = a.code) => `${base(code)}/roster?${new URLSearchParams({ periodId, classArmId: armId })}`;

test.describe("who reads what", () => {
  test("signed out, a pupil, a campus administrator and another school's administrator reach none of the three", async () => {
    for (const url of [`${base()}/options`, sheetUrl(), rosterUrl()]) {
      expect((await api(url, SAAS)).status, url).toBe(401);
      for (const who of ["pupilUser", "adminB"]) expect((await get(url, who)).status, `${url} ${who}`).toBe(403);
      // A campus administrator is not on the results API's list of roles (task 0031, D7).
      expect((await get(url, "campusAdmin")).status, `${url} campusAdmin`).toBe(403);
    }
  });

  test("a registrar reads the options and the class list, but not a marks sheet", async () => {
    expect((await get(`${base()}/options`, "registrar")).status).toBe(200);
    expect((await get(rosterUrl(), "registrar")).status).toBe(200);
    expect((await get(sheetUrl(), "registrar")).status).toBe(403);
  });
});

test.describe("the options", () => {
  type Opt = { periods: { id: string; isCurrent: boolean }[]; pairs: { classArmId: string; subjectId: string }[]; arms: { id: string }[] };
  const opts = async (who: string) => (await get(`${base()}/options`, who)).json.data as Opt;
  const pairKeys = (o: Opt) => o.pairs.map((p) => `${p.classArmId}:${p.subjectId}`).sort();

  test("an administrator gets every offered pair, the active session's periods, and every arm", async () => {
    const o = await opts("admin");
    expect(o.periods.map((p) => p.id)).toContain(periodId);
    expect(o.periods.find((p) => p.id === periodId)?.isCurrent).toBe(true);
    expect(pairKeys(o)).toEqual(
      [
        `${armA}:${maths}`,
        `${armA}:${english}`,
        `${armB}:${maths}`,
        `${armB}:${english}`,
        `${northArm}:${maths}`,
        `${southArm}:${maths}`,
      ].sort(),
    );
    expect(o.arms.map((x) => x.id).sort()).toEqual([armA, armB, northArm, southArm].sort());
  });

  test("a teacher gets only what they are assigned; one with no assignment gets no pair", async () => {
    expect(pairKeys(await opts("mathsTeacher"))).toEqual([`${armA}:${maths}`]);
    expect((await opts("idleTeacher")).pairs).toEqual([]);
    // A timetable slot is when a class meets, not who answers for its marks: no pair, though the arm may be read.
    const slot = await opts("slotTeacher");
    expect(slot.pairs).toEqual([]);
    expect(slot.arms.map((x) => x.id)).toEqual([armA]);
  });

  test("a member anchored to a campus sees their campus's classes and the school's, not another campus's", async () => {
    const north_ = await opts("northTeacher");
    expect(pairKeys(north_)).toEqual([`${northArm}:${maths}`]);
    const reg = await opts("northRegistrar");
    expect(reg.pairs).toEqual([]);
    expect(reg.arms.map((x) => x.id).sort()).toEqual([armA, armB, northArm].sort()); // not the south arm
    expect((await opts("registrar")).arms.map((x) => x.id)).toContain(southArm); // no campus: the whole school
  });
});

test.describe("the marks sheet", () => {
  type Sheet = {
    scheme: {
      id: string | null;
      totalMax: number;
      examMax: number;
      components: { name: string; maxScore: number }[];
      parts: { name: string; maxScore: number }[];
    };
    rows: {
      studentId: string;
      standing: string;
      result: null | { status: string; score: number; components: { name: string; score: number }[] | null; gradeLetter: string | null };
    }[];
    arm: { name: string };
    subject: { name: string };
  };
  const sheet = async (who: string, armId = armA, subjectId = maths) => (await get(sheetUrl(armId, subjectId), who)).json.data as Sheet;

  test("the roll is the arm's active pupils: a suspended pupil is on it; an expelled, archived or other-arm pupil is not", async () => {
    const s = await sheet("admin");
    const ids = s.rows.map((r) => r.studentId);
    expect(ids).toEqual(expect.arrayContaining([pupils.ada, pupils.bayo, pupils.chi]));
    for (const gone of [pupils.expelled, pupils.archived, pupils.other, pupils.north]) expect(ids).not.toContain(gone);
    expect(s.rows.find((r) => r.studentId === pupils.chi)?.standing).toBe("SUSPENDED");
    expect(s.arm.name).toBe("A");
    expect(s.subject.name).toBe("Mathematics");
  });

  test("with no scheme the sheet is one mark out of 100; the school's single scheme is used when the class has none; the class's own wins", async () => {
    expect((await sheet("admin")).scheme).toMatchObject({ id: null, totalMax: 100, examMax: 0, components: [], parts: [] });
    const wide = await db.assessmentScheme.create({
      data: {
        tenantId: a.id,
        name: uniq("School scheme "),
        totalMax: 100,
        examMax: 60,
        // components + exam = total (the scheme rule): 15 + 25 + 60 = 100. Created out of order, so the sheet's own ordering is what is checked.
        components: {
          create: [
            { name: "CA 2", maxScore: 25, sortOrder: 2 },
            { name: "CA 1", maxScore: 15, sortOrder: 1 },
          ],
        },
      },
    });
    const viaSchool = (await sheet("admin")).scheme;
    expect(viaSchool.id).toBe(wide.id);
    expect(viaSchool.components).toEqual([
      { name: "CA 1", maxScore: 15 },
      { name: "CA 2", maxScore: 25 },
    ]); // in the scheme's own order
    // what a result is entered under: the components, then the exam, out of examMax (task 0032)
    expect(viaSchool).toMatchObject({ examMax: 60 });
    expect(viaSchool.parts).toEqual([
      { name: "CA 1", maxScore: 15 },
      { name: "CA 2", maxScore: 25 },
      { name: "Exam", maxScore: 60 },
    ]);
    const own = await db.assessmentScheme.create({
      data: {
        tenantId: a.id,
        classGroupId: groupId,
        name: uniq("Form 1 scheme "),
        totalMax: 50,
        examMax: 30,
        components: { create: [{ name: "Test", maxScore: 20, sortOrder: 1 }] }, // 20 + the exam 30 = 50
      },
    });
    expect((await sheet("admin")).scheme).toMatchObject({
      id: own.id,
      totalMax: 50,
      examMax: 30,
      components: [{ name: "Test", maxScore: 20 }],
      parts: [
        { name: "Test", maxScore: 20 },
        { name: "Exam", maxScore: 30 },
      ],
    });
    await db.assessmentScheme.updateMany({ where: { id: { in: [wide.id, own.id] } }, data: { archivedAt: new Date() } }); // an archived scheme is not used
    expect((await sheet("admin")).scheme.id).toBeNull();
  });

  test("what is saved comes back, and the existing save and the sheet agree", async () => {
    const saved = await api(`${base()}`, {
      ...as("admin"),
      method: "POST",
      body: {
        periodId,
        subjectId: maths,
        results: [
          {
            studentId: pupils.ada,
            maxScore: 100,
            components: [
              { name: "CA", score: 30, maxScore: 40 },
              { name: "Exam", score: 45, maxScore: 60 },
            ],
          },
        ],
      },
    });
    expect(saved.status, saved.text).toBe(200);
    const s = await sheet("admin");
    expect(s.rows.find((r) => r.studentId === pupils.ada)?.result).toMatchObject({
      status: "DRAFT",
      score: 75,
      components: [
        { name: "CA", score: 30 },
        { name: "Exam", score: 45 },
      ],
    });
    expect(s.rows.find((r) => r.studentId === pupils.bayo)?.result).toBeNull();
  });

  test("a teacher reads the sheet of the subject they are assigned and of no other; a timetable slot is not an assignment", async () => {
    expect((await get(sheetUrl(armA, maths), "mathsTeacher")).status).toBe(200);
    for (const [armId, subjectId] of [
      [armA, english],
      [armB, maths],
    ] as const) {
      const res = await get(sheetUrl(armId, subjectId), "mathsTeacher");
      expect(res.status).toBe(403);
      expect(res.json.error.message).toContain("not assigned");
    }
    expect((await get(sheetUrl(armA, maths), "slotTeacher")).status).toBe(403);
    expect((await get(sheetUrl(armA, maths), "idleTeacher")).status).toBe(403);
  });

  test("another campus's arm, an archived arm, an unknown id and a bad id are the same answer", async () => {
    expect((await get(sheetUrl(southArm, maths), "northTeacher")).status).toBe(404); // another campus
    expect((await get(sheetUrl(northArm, maths), "northTeacher")).status).toBe(200);
    expect((await get(sheetUrl("nosucharm", maths), "admin")).status).toBe(404);
    expect((await get(sheetUrl(armA, "nosuchsubject"), "admin")).status).toBe(404);
    expect((await get(sheetUrl("../x", maths), "admin")).status).toBe(400);
    expect((await get(`${base()}/sheet?periodId=${periodId}`, "admin")).status).toBe(400); // an id is missing
    // Another school's ids are not found in the administrator's own school.
    expect((await get(sheetUrl(armA, maths, b.code), "adminB")).status).toBe(404);
    const dead = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupId, name: uniq("Z"), archivedAt: new Date() } });
    expect((await get(sheetUrl(dead.id, maths), "admin")).status).toBe(404);
  });
});

test.describe("the class list for the report cards", () => {
  type Roster = { rows: { studentId: string; published: number; total: number }[] };
  const roster = async (who: string, armId = armA) => (await get(rosterUrl(armId), who)).json.data as Roster;

  test("lists the pupils with how many of their marks are published; pupils who finished the session stay on it", async () => {
    const promoted = await pupil("Promoted", armA, {}, { status: "PROMOTED" });
    const withdrew = await pupil("Withdrew", armA, {}, { status: "WITHDRAWN" });
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: pupils.bayo,
        subjectId: maths,
        periodId,
        score: 50,
        maxScore: 100,
        status: "PUBLISHED",
        verificationToken: uniq("t"),
      },
    });
    await db.result.create({
      data: { tenantId: a.id, studentId: pupils.bayo, subjectId: english, periodId, score: 60, maxScore: 100, status: "DRAFT" },
    });
    const r = await roster("admin");
    const ids = r.rows.map((x) => x.studentId);
    expect(ids).toEqual(expect.arrayContaining([pupils.ada, pupils.bayo, pupils.chi, promoted]));
    for (const gone of [pupils.expelled, pupils.archived, withdrew]) expect(ids).not.toContain(gone);
    expect(r.rows.find((x) => x.studentId === pupils.bayo)).toMatchObject({ published: 1, total: 2 });
  });

  test("a teacher reads the arms they teach or meet; the campus rule and the school boundary hold", async () => {
    expect((await get(rosterUrl(armA), "mathsTeacher")).status).toBe(200);
    expect((await get(rosterUrl(armA), "slotTeacher")).status).toBe(200); // a timetable slot is enough to READ the class
    expect((await get(rosterUrl(armA), "idleTeacher")).status).toBe(404);
    expect((await get(rosterUrl(armB), "mathsTeacher")).status).toBe(404);
    expect((await get(rosterUrl(southArm), "northRegistrar")).status).toBe(404);
    expect((await get(rosterUrl(northArm), "northRegistrar")).status).toBe(200);
    expect((await get(rosterUrl(armA, b.code), "adminB")).status).toBe(404);
    expect((await get(rosterUrl("../x"), "admin")).status).toBe(400);
  });
});
