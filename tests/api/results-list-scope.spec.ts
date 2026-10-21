import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  grantApprovalScope,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { Permission, ResultStatus } from "@prisma/client";
import { api, cookieHeader, loginAs } from "../support/http";

// Listing results (GET /academics/results) as a teacher: the results of the students on the roll (ACTIVE, in the active session) of the arms the teacher is
// assigned to, for every subject, and no others. The arms are those the student's attendance history and report card use (a subject assignment or a
// timetable slot of the teacher's live staff record). A teacher who holds CAN_APPROVE_RESULTS with a GENERAL approver scope is not narrowed, because approving other
// teachers' results needs to see them (a narrower scope is tests/api/results-approver-scope.spec.ts); non-teaching staff and administrators are held to the campus
// rule alone, as before.

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let closed: TestTenant; // a school whose only session is closed
let teacher: TestUser; // Mathematics in arm A
let slotTeacher: TestUser; // a timetable slot in arm B, no assignment
let idle: TestUser; // a staff record with neither
let noRecord: TestUser; // no staff record at all
let approver: TestUser; // CAN_APPROVE_RESULTS, assigned in arm A only
let clerk: TestUser;
let admin: TestUser;
let lateTeacher: TestUser; // assigned in the school that has no active session
const cookie: Record<string, string> = {};

let period: { id: string };
let armA: { id: string };
let armB: { id: string };
let armC: { id: string };
let maths: { id: string; code: string | null };
let english: { id: string; code: string | null };
let n = 0;

// the results seeded for each pupil, by name
const rows: Record<string, string[]> = {};
// the pupils of arm A, arm B, arm C, and the ones who are on no roll that counts
let inA: string[];
let inB: string[];
let inC: string[];
let invisible: string[];

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

const staffFor = (tenantId: string, user: TestUser, name: string) =>
  db.staffRecord.create({ data: { tenantId, userId: user.id, category: "TEACHING", firstName: name, lastName: "Lister" } });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Results Lists" });
  closed = await createTenant({ name: "Beta Results Lists" });

  teacher = await createUser();
  slotTeacher = await createUser();
  idle = await createUser();
  noRecord = await createUser();
  approver = await createUser();
  clerk = await createUser();
  admin = await createUser();
  lateTeacher = await createUser();
  for (const user of [teacher, slotTeacher, idle, noRecord]) await addMembership(user.id, a.id, Role.TEACHING_STAFF);
  await db.tenantMembership.create({
    data: { userId: approver.id, tenantId: a.id, role: Role.TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] },
  });
  await grantApprovalScope(approver.id, a.id); // a general approver, as granting the permission through the API gives
  await addMembership(clerk.id, a.id, Role.NON_TEACHING_STAFF);
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(lateTeacher.id, closed.id, Role.TEACHING_STAFF);
  for (const [key, user] of Object.entries({ teacher, slotTeacher, idle, noRecord, approver, clerk, admin, lateTeacher }))
    cookie[key] = await cookieFor(user);

  const session = await db.academicSession.create({
    data: { tenantId: a.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const old = await db.academicSession.create({
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
  const group = await db.classGroup.create({ data: { tenantId: a.id, name: "Grade 7", sortOrder: 1 } });
  armA = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A" } });
  armB = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "B" } });
  armC = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "C" } });
  maths = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MLS1" } });
  english = await db.subject.create({ data: { tenantId: a.id, name: "English", code: "ELS1" } });

  const staffTeacher = await staffFor(a.id, teacher, "Tola");
  const staffSlot = await staffFor(a.id, slotTeacher, "Sade");
  await staffFor(a.id, idle, "Ife");
  const staffApprover = await staffFor(a.id, approver, "Abike");
  await db.staffSubjectAssignment.create({
    data: { tenantId: a.id, staffRecordId: staffTeacher.id, subjectId: maths.id, classArmId: armA.id },
  });
  await db.staffSubjectAssignment.create({
    data: { tenantId: a.id, staffRecordId: staffApprover.id, subjectId: english.id, classArmId: armA.id },
  });
  await db.timetableSlot.create({
    data: {
      tenantId: a.id,
      classArmId: armB.id,
      subjectId: english.id,
      staffRecordId: staffSlot.id,
      dayOfWeek: 2,
      periodNumber: 1,
      startTime: "09:00",
      endTime: "09:45",
    },
  });

  const pupil = async (label: string, enrol?: { armId: string; sessionId?: string; status?: "ACTIVE" | "WITHDRAWN" }) => {
    n += 1;
    const student = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        firstName: label,
        lastName: "Lister",
        dateOfBirth: new Date("2013-03-03"),
        admissionNo: `RL-${Date.now()}-${n}`,
      },
    });
    if (enrol) {
      await db.studentEnrollment.create({
        data: {
          tenantId: a.id,
          sessionId: enrol.sessionId ?? session.id,
          classArmId: enrol.armId,
          studentId: student.id,
          status: enrol.status ?? "ACTIVE",
        },
      });
    }
    rows[student.id] = [];
    for (const [subject, status] of [
      [maths, ResultStatus.DRAFT],
      [english, ResultStatus.PUBLISHED],
    ] as const) {
      const made = await db.result.create({
        data: {
          tenantId: a.id,
          studentId: student.id,
          subjectId: subject.id,
          periodId: period.id,
          score: 60,
          status,
          enteredByStaffId: teacher.id,
          verificationToken: `rl-${Date.now()}-${n}-${subject.code}`,
          verificationHash: status === ResultStatus.PUBLISHED ? "a".repeat(64) : null,
          publishedAt: status === ResultStatus.PUBLISHED ? new Date() : null,
        },
      });
      rows[student.id].push(made.id);
    }
    return student.id;
  };
  inA = [await pupil("Ada", { armId: armA.id }), await pupil("Ayo", { armId: armA.id })];
  inB = [await pupil("Bola", { armId: armB.id })];
  inC = [await pupil("Chi", { armId: armC.id })];
  invisible = [
    await pupil("Unrolled"),
    await pupil("Withdrawn", { armId: armA.id, status: "WITHDRAWN" }),
    await pupil("Elsewhere", { armId: armA.id, sessionId: old.id }),
  ];

  // the other school: a session that is closed, a teacher assigned in it, and one result
  const oldSession = await db.academicSession.create({
    data: { tenantId: closed.id, label: "2025/2026", startDate: new Date("2025-09-01"), endDate: new Date("2026-07-20"), status: "CLOSED" },
  });
  const oldPeriod = await db.academicPeriod.create({
    data: {
      tenantId: closed.id,
      sessionId: oldSession.id,
      kind: "TERM",
      ordinal: 1,
      label: "Third Term",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-07-10"),
      isCurrent: false,
    },
  });
  const oldGroup = await db.classGroup.create({ data: { tenantId: closed.id, name: "Grade 6", sortOrder: 1 } });
  const oldArm = await db.classArm.create({ data: { tenantId: closed.id, classGroupId: oldGroup.id, name: "A" } });
  const oldSubject = await db.subject.create({ data: { tenantId: closed.id, name: "Science", code: "SLS1" } });
  const lateStaff = await staffFor(closed.id, lateTeacher, "Lola");
  await db.staffSubjectAssignment.create({
    data: { tenantId: closed.id, staffRecordId: lateStaff.id, subjectId: oldSubject.id, classArmId: oldArm.id },
  });
  const oldPupil = await db.studentRecord.create({
    data: { tenantId: closed.id, firstName: "Old", lastName: "Lister", dateOfBirth: new Date("2012-01-01"), admissionNo: "RL-OLD-1" },
  });
  await db.studentEnrollment.create({
    data: { tenantId: closed.id, sessionId: oldSession.id, classArmId: oldArm.id, studentId: oldPupil.id, status: "ACTIVE" },
  });
  await db.result.create({
    data: {
      tenantId: closed.id,
      studentId: oldPupil.id,
      subjectId: oldSubject.id,
      periodId: oldPeriod.id,
      score: 55,
      status: ResultStatus.DRAFT,
      enteredByStaffId: lateTeacher.id,
      verificationToken: `rl-old-${Date.now()}`,
    },
  });
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const list = async (who: string, query = "", tenant: TestTenant = a) => {
  const res = await api(`/api/v1/schools/${tenant.code}/academics/results${query}`, as(who));
  expect(res.status, `${who}: ${res.text}`).toBe(200);
  return res.json.data.results as Array<{ id: string; studentId: string; subjectId: string; status: string }>;
};
const idsOf = (pupils: string[]) => pupils.flatMap((id) => rows[id]).sort();
const sorted = (found: Array<{ id: string }>) => found.map((r) => r.id).sort();

test.describe("a teacher's list is the students on the roll of the arms they are assigned to", () => {
  test("every subject for those students, and none for any other student (the control: the same list has always been right for an administrator)", async () => {
    const found = await list("teacher");
    expect(sorted(found)).toEqual(idsOf(inA));
    expect(new Set(found.map((r) => r.subjectId))).toEqual(new Set([maths.id, english.id]));

    const everyone = await list("admin");
    expect(sorted(everyone)).toEqual(idsOf([...inA, ...inB, ...inC, ...invisible]));
  });

  test("a student who is on no roll, has withdrawn, or is rolled only in a closed session is not listed for a teacher, whoever teaches the arm", async () => {
    const found = new Set((await list("teacher")).map((r) => r.studentId));
    for (const id of invisible) expect.soft(found.has(id), `${id} is listed`).toBe(false);
  });

  test("the filters narrow it further and never widen it: another arm, status, subject", async () => {
    expect(sorted(await list("teacher", `?classArmId=${armA.id}`))).toEqual(idsOf(inA));
    expect(await list("teacher", `?classArmId=${armB.id}`), "an arm they are not assigned to").toEqual([]);
    expect(await list("teacher", `?classArmId=${armC.id}`)).toEqual([]);
    expect(await list("teacher", `?classArmId=no-such-arm`), "an arm that does not exist is an empty list, not an error").toEqual([]);

    const published = await list("teacher", `?status=PUBLISHED&periodId=${period.id}`);
    expect(sorted(published)).toEqual(inA.map((id) => rows[id][1]).sort());
    const mathsOnly = await list("teacher", `?subjectId=${maths.id}`);
    expect(sorted(mathsOnly)).toEqual(inA.map((id) => rows[id][0]).sort());
  });

  test("a timetable slot counts as being assigned to the arm, as it does for attendance", async () => {
    expect(sorted(await list("slotTeacher"))).toEqual(idsOf(inB));
    expect(sorted(await list("slotTeacher", `?classArmId=${armB.id}`))).toEqual(idsOf(inB));
    expect(await list("slotTeacher", `?classArmId=${armA.id}`)).toEqual([]);
  });

  test("a teacher with no assigned arm, and a teacher account with no staff record, see nothing", async () => {
    expect(await list("idle")).toEqual([]);
    expect(await list("noRecord")).toEqual([]);
  });

  test("in a school with no active session a teacher sees nothing", async () => {
    expect(await list("lateTeacher", "", closed)).toEqual([]);
  });
});

test.describe("who is not narrowed", () => {
  test("a teacher with the approve permission lists the school's results, as approving other teachers' work needs", async () => {
    expect(sorted(await list("approver"))).toEqual(idsOf([...inA, ...inB, ...inC, ...invisible]));
    expect(sorted(await list("approver", `?classArmId=${armB.id}`))).toEqual(idsOf(inB));
  });

  test("non-teaching staff and administrators are held to the campus rule alone", async () => {
    const all = idsOf([...inA, ...inB, ...inC, ...invisible]);
    expect(sorted(await list("clerk"))).toEqual(all);
    expect(sorted(await list("admin"))).toEqual(all);
  });

  test("the other school's results never appear in this school's lists", async () => {
    const seen = new Set((await list("admin")).map((r) => r.studentId));
    const foreign = await db.studentRecord.findFirstOrThrow({ where: { tenantId: closed.id } });
    expect(seen.has(foreign.id)).toBe(false);
  });
});
