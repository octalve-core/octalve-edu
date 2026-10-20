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

// Recording results (POST /academics/results) as a teacher: only for the students on the roll of an arm the teacher is assigned to teach the subject in
// (a subject assignment on their live staff record, for exactly that subject and arm; an ACTIVE enrolment in the period's session). One student outside
// that refuses the whole request (403 FORBIDDEN) and nothing is saved. An administrator is not held to it, and the campus rule still comes first (404).

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let admin: TestUser;
let teacher: TestUser; // Mathematics in arm A
let sharer: TestUser; // also Mathematics in arm A: two teachers share a class
let twoArms: TestUser; // Mathematics in arm A, English in arm B
let noRecord: TestUser; // a teacher account with no staff record
let leaver: TestUser; // an archived staff record that still holds the assignment
let timetabled: TestUser; // a timetable slot for Mathematics in arm A, and no assignment
let northTeacher: TestUser; // anchored to the north campus, Mathematics in the north arm
const cookie: Record<string, string> = {};
const staff: Record<string, string> = {};

let session: { id: string };
let otherSession: { id: string };
let period: { id: string };
let armA: { id: string };
let armB: { id: string };
let armNorth: { id: string };
let armSouth: { id: string };
let n = 0;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

async function staffFor(user: TestUser, name: string, extra: { archived?: boolean; campusId?: string } = {}) {
  const record = await db.staffRecord.create({
    data: {
      tenantId: a.id,
      userId: user.id,
      category: "TEACHING",
      firstName: name,
      lastName: "Teacher",
      campusId: extra.campusId ?? null,
      archivedAt: extra.archived ? new Date() : null,
    },
  });
  return record.id;
}

const assign = (staffRecordId: string, subjectId: string, classArmId: string) =>
  db.staffSubjectAssignment.create({ data: { tenantId: a.id, staffRecordId, subjectId, classArmId } });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Results Assigned", campuses: ["Alpha North", "Alpha South"] });
  const [north, south] = a.campuses;

  admin = await createUser();
  teacher = await createUser();
  sharer = await createUser();
  twoArms = await createUser();
  noRecord = await createUser();
  leaver = await createUser();
  timetabled = await createUser();
  northTeacher = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
  for (const user of [teacher, sharer, twoArms, noRecord, leaver, timetabled]) await addMembership(user.id, a.id, Role.TEACHING_STAFF);
  await addMembership(northTeacher.id, a.id, Role.TEACHING_STAFF, north.id);
  for (const [key, user] of Object.entries({ admin, teacher, sharer, twoArms, noRecord, leaver, timetabled, northTeacher }))
    cookie[key] = await cookieFor(user);

  session = await db.academicSession.create({
    data: { tenantId: a.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  otherSession = await db.academicSession.create({
    data: { tenantId: a.id, label: "2025/2026", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-20"), status: "CLOSED" },
  });
  period = await db.academicPeriod.create({
    data: {
      tenantId: a.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { tenantId: a.id, name: "Grade 8", sortOrder: 1 } });
  const groupNorth = await db.classGroup.create({ data: { tenantId: a.id, name: "Grade 8 North", sortOrder: 2, campusId: north.id } });
  const groupSouth = await db.classGroup.create({ data: { tenantId: a.id, name: "Grade 8 South", sortOrder: 3, campusId: south.id } });
  armA = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A" } });
  armB = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "B" } });
  armNorth = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupNorth.id, name: "N" } });
  armSouth = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupSouth.id, name: "S" } });

  staff.teacher = await staffFor(teacher, "Tola");
  staff.sharer = await staffFor(sharer, "Shade");
  staff.twoArms = await staffFor(twoArms, "Wale");
  staff.leaver = await staffFor(leaver, "Lanre", { archived: true });
  staff.timetabled = await staffFor(timetabled, "Tayo");
  staff.northTeacher = await staffFor(northTeacher, "Nonso", { campusId: north.id });
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
const resultsRoute = () => `/api/v1/schools/${a.code}/academics/results`;
const record = (who: string, subjectId: string, results: object[]) =>
  api(resultsRoute(), as(who, { method: "POST", body: { periodId: period.id, subjectId, results } }));

/// A pupil on the roll of `armId` in `sessionId` with `status` (no roll at all when `armId` is null).
async function pupil(armId: string | null, opts: { campusId?: string | null; sessionId?: string; status?: "ACTIVE" | "WITHDRAWN" } = {}) {
  n += 1;
  const student = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      firstName: `Pupil${n}`,
      lastName: "Assigned",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: `RA-${Date.now()}-${n}`,
      campusId: opts.campusId ?? null,
    },
  });
  if (armId) {
    await db.studentEnrollment.create({
      data: {
        tenantId: a.id,
        sessionId: opts.sessionId ?? session.id,
        classArmId: armId,
        studentId: student.id,
        status: opts.status ?? "ACTIVE",
      },
    });
  }
  return student;
}
async function subject() {
  n += 1;
  return db.subject.create({ data: { tenantId: a.id, name: `Subject ${n}`, code: `RA${n}` } });
}
const saved = (subjectId: string) => db.result.count({ where: { subjectId } });
const audits = (subjectId: string) => db.resultAudit.count({ where: { result: { subjectId } } });

test.describe("a teacher records a subject only for the students of an arm they are assigned it in", () => {
  test("the assigned teacher records for the students on the arm's roll, and corrects the draft (the control: this was always allowed)", async () => {
    const maths = await subject();
    await assign(staff.teacher, maths.id, armA.id);
    const [one, two] = [await pupil(armA.id), await pupil(armA.id)];

    const res = await record("teacher", maths.id, [
      { studentId: one.id, score: 70 },
      { studentId: two.id, score: 71 },
    ]);
    expect(res.status, res.text).toBe(200);
    expect(await saved(maths.id)).toBe(2);

    expect((await record("teacher", maths.id, [{ studentId: one.id, score: 75 }])).status).toBe(200);
    expect(Number((await db.result.findFirstOrThrow({ where: { studentId: one.id, subjectId: maths.id } })).score)).toBe(75);
    expect(await audits(maths.id)).toBe(1);
  });

  test("a second teacher assigned the same subject and arm may record and correct the same draft", async () => {
    const maths = await subject();
    await assign(staff.teacher, maths.id, armA.id);
    await assign(staff.sharer, maths.id, armA.id);
    const one = await pupil(armA.id);
    expect((await record("teacher", maths.id, [{ studentId: one.id, score: 60 }])).status).toBe(200);
    expect((await record("sharer", maths.id, [{ studentId: one.id, score: 65 }])).status).toBe(200);
    expect(Number((await db.result.findFirstOrThrow({ where: { studentId: one.id, subjectId: maths.id } })).score)).toBe(65);
  });

  test("a subject the teacher is not assigned (in any arm) is refused with 403 and nothing is saved", async () => {
    const maths = await subject();
    const english = await subject();
    await assign(staff.teacher, maths.id, armA.id);
    const one = await pupil(armA.id);

    const res = await record("teacher", english.id, [{ studentId: one.id, score: 70 }]);
    expect.soft(res.status, res.text).toBe(403);
    expect(await saved(english.id)).toBe(0);
  });

  test("a student of another arm is refused, wherever in the list that student is, and the others in the request are not saved either", async () => {
    const maths = await subject();
    await assign(staff.teacher, maths.id, armA.id);
    const [first, second, outsider] = [await pupil(armA.id), await pupil(armA.id), await pupil(armB.id)];

    for (const order of [
      [outsider, first, second],
      [first, outsider, second],
      [first, second, outsider],
    ]) {
      const res = await record(
        "teacher",
        maths.id,
        order.map((s) => ({ studentId: s.id, score: 70 })),
      );
      expect.soft(res.status, res.text).toBe(403);
      expect(await saved(maths.id), "nothing was written").toBe(0);
    }
    expect(await audits(maths.id)).toBe(0);
  });

  test("the assignment is for an arm: the same subject taught in another arm does not cover this arm's students", async () => {
    const maths = await subject();
    await assign(staff.teacher, maths.id, armB.id);
    const inA = await pupil(armA.id);
    const inB = await pupil(armB.id);

    expect.soft((await record("teacher", maths.id, [{ studentId: inA.id, score: 70 }])).status).toBe(403);
    expect.soft((await record("teacher", maths.id, [{ studentId: inB.id, score: 70 }])).status).toBe(200);
    expect(await saved(maths.id)).toBe(1);
  });

  test("a teacher of two subjects in two arms is held to each pair, not to either list", async () => {
    const maths = await subject();
    const english = await subject();
    await assign(staff.twoArms, maths.id, armA.id);
    await assign(staff.twoArms, english.id, armB.id);
    const inA = await pupil(armA.id);
    const inB = await pupil(armB.id);

    expect.soft((await record("twoArms", maths.id, [{ studentId: inA.id, score: 70 }])).status, "maths in A").toBe(200);
    expect.soft((await record("twoArms", english.id, [{ studentId: inB.id, score: 70 }])).status, "english in B").toBe(200);
    expect.soft((await record("twoArms", maths.id, [{ studentId: inB.id, score: 70 }])).status, "maths in B").toBe(403);
    expect.soft((await record("twoArms", english.id, [{ studentId: inA.id, score: 70 }])).status, "english in A").toBe(403);
    expect(await saved(maths.id)).toBe(1);
    expect(await saved(english.id)).toBe(1);
  });

  test("an assignment that is taken away stops covering the arm at once", async () => {
    const maths = await subject();
    const given = await assign(staff.teacher, maths.id, armA.id);
    const one = await pupil(armA.id);
    expect((await record("teacher", maths.id, [{ studentId: one.id, score: 70 }])).status).toBe(200);

    await db.staffSubjectAssignment.delete({ where: { id: given.id } });
    expect.soft((await record("teacher", maths.id, [{ studentId: one.id, score: 80 }])).status).toBe(403);
    expect(Number((await db.result.findFirstOrThrow({ where: { studentId: one.id, subjectId: maths.id } })).score)).toBe(70);
  });
});

test.describe("who counts as assigned", () => {
  test("a teacher account with no staff record, an archived staff record, or only a timetable slot is refused", async () => {
    const maths = await subject();
    const one = await pupil(armA.id);
    await assign(staff.leaver, maths.id, armA.id);
    await db.timetableSlot.create({
      data: {
        tenantId: a.id,
        classArmId: armA.id,
        subjectId: maths.id,
        staffRecordId: staff.timetabled,
        dayOfWeek: 1,
        periodNumber: 1,
        startTime: "08:00",
        endTime: "08:45",
      },
    });

    for (const who of ["noRecord", "leaver", "timetabled"]) {
      const res = await record(who, maths.id, [{ studentId: one.id, score: 70 }]);
      expect.soft(res.status, `${who}: ${res.text}`).toBe(403);
    }
    expect(await saved(maths.id)).toBe(0);
  });

  test("the roll counts only while it is ACTIVE and in this period's session: a withdrawn pupil, a pupil with no roll and a pupil rolled in another session are refused", async () => {
    const maths = await subject();
    await assign(staff.teacher, maths.id, armA.id);
    const cases = {
      withdrawn: await pupil(armA.id, { status: "WITHDRAWN" }),
      "no roll": await pupil(null),
      "another session": await pupil(armA.id, { sessionId: otherSession.id }),
    };
    for (const [name, student] of Object.entries(cases)) {
      const res = await record("teacher", maths.id, [{ studentId: student.id, score: 70 }]);
      expect.soft(res.status, `${name}: ${res.text}`).toBe(403);
    }
    expect(await saved(maths.id)).toBe(0);
  });

  test("an administrator is not held to it: any pupil of the school, on a roll or not", async () => {
    const maths = await subject();
    const [rolled, unrolled] = [await pupil(armB.id), await pupil(null)];
    const res = await record("admin", maths.id, [
      { studentId: rolled.id, score: 70 },
      { studentId: unrolled.id, score: 71 },
    ]);
    expect(res.status, res.text).toBe(200);
    expect(await saved(maths.id)).toBe(2);
  });
});

test.describe("the checks that come before it still answer as they did", () => {
  test("an unknown student is a 404, not a 403, and a malformed id is a 400", async () => {
    const maths = await subject();
    await assign(staff.teacher, maths.id, armA.id);
    const one = await pupil(armA.id);

    const unknown = await record("teacher", maths.id, [
      { studentId: one.id, score: 70 },
      { studentId: "no-such-student", score: 70 },
    ]);
    expect.soft(unknown.status, unknown.text).toBe(404);
    const nul = await record("teacher", maths.id, [{ studentId: `a${String.fromCharCode(0)}b`, score: 70 }]);
    expect.soft(nul.status, JSON.stringify(nul.json)).toBe(400);
    expect(await saved(maths.id)).toBe(0);
  });

  test("a member anchored to a campus: another campus's pupil is still a 404, a pupil of their campus outside their arm a 403, their own arm's pupils 200", async () => {
    const [north, south] = a.campuses;
    const maths = await subject();
    await assign(staff.northTeacher, maths.id, armNorth.id);
    const own = await pupil(armNorth.id, { campusId: north.id });
    const elsewhere = await pupil(armSouth.id, { campusId: south.id });
    const sameCampusOtherArm = await pupil(armB.id, { campusId: north.id });

    const campus = await record("northTeacher", maths.id, [
      { studentId: own.id, score: 70 },
      { studentId: elsewhere.id, score: 70 },
    ]);
    expect.soft(campus.status, campus.text).toBe(404);
    const arm = await record("northTeacher", maths.id, [{ studentId: sameCampusOtherArm.id, score: 70 }]);
    expect.soft(arm.status, arm.text).toBe(403);
    expect(await saved(maths.id)).toBe(0);

    expect((await record("northTeacher", maths.id, [{ studentId: own.id, score: 70 }])).status).toBe(200);
    expect(await saved(maths.id)).toBe(1);
  });
});
