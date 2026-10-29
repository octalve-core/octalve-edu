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

// Taking a roll (POST /academics/arms/[id]/attendance): the students named must be on THAT arm's roll for the active session, each once, and a refused
// request changes nothing. (AlEemaan's twin has judged the students first since its A2 fix.)

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let b: TestTenant;
let admin: TestUser;
let teacher: TestUser;
let outsider: TestUser;
const cookie: Record<string, string> = {};

let session: { id: string };
let arm1: { id: string };
let arm2: { id: string };
let n = 0;

const today = new Date().toISOString().split("T")[0];

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Roll Rules" });
  b = await createTenant({ name: "Beta Roll Rules" });

  admin = await createUser();
  teacher = await createUser();
  outsider = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(teacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(outsider.id, b.id, Role.ADMIN);
  for (const [key, user] of Object.entries({ admin, teacher, outsider })) cookie[key] = await cookieFor(user);

  session = await db.academicSession.create({
    data: { tenantId: a.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { tenantId: a.id, name: "JSS 1", sortOrder: 1 } });
  arm1 = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A" } });
  arm2 = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "B" } });

  // the teacher teaches arm 1 only
  const subject = await db.subject.create({ data: { tenantId: a.id, name: "English", code: "ENGROLL" } });
  const staff = await db.staffRecord.create({
    data: { tenantId: a.id, userId: teacher.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
  });
  await db.staffSubjectAssignment.create({ data: { tenantId: a.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: arm1.id } });
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
const route = (armId: string) => `/api/v1/schools/${a.code}/academics/arms/${armId}/attendance`;
const mark = (who: string, armId: string, records: object[], date = today) =>
  api(route(armId), as(who, { method: "POST", body: { date, records } }));

/// A student on the roll of `armId` in the active session.
async function pupil(armId: string | null, extra: { archived?: boolean; status?: "ACTIVE" | "TRANSFERRED" } = {}) {
  n += 1;
  const student = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      firstName: `Roll${n}`,
      lastName: "Rules",
      dateOfBirth: new Date("2014-03-03"),
      admissionNo: `ROLL-${Date.now()}-${n}`,
      archivedAt: extra.archived ? new Date() : null,
    },
  });
  if (armId) {
    await db.studentEnrollment.create({
      data: { tenantId: a.id, sessionId: session.id, classArmId: armId, studentId: student.id, status: extra.status ?? "ACTIVE" },
    });
  }
  return student;
}
const records = (studentId: string) => db.attendanceRecord.findMany({ where: { studentId } });

test.describe("taking a roll: only the students on this arm's roll", () => {
  test("a roll of the arm's own students is saved, and saved again (control)", async () => {
    const [one, two] = [await pupil(arm1.id), await pupil(arm1.id)];
    const res = await mark("teacher", arm1.id, [
      { studentId: one.id, status: "PRESENT" },
      { studentId: two.id, status: "ABSENT", remarks: "Fever" },
    ]);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.count).toBe(2);
    expect((await mark("teacher", arm1.id, [{ studentId: two.id, status: "LATE" }])).status).toBe(200);
    expect((await records(two.id))[0].status).toBe("LATE");
  });

  test("a student of another arm is refused (400) and the other arm's mark is left as it was, wherever that student is in the list", async () => {
    const [mine, theirs] = [await pupil(arm1.id), await pupil(arm2.id)];
    expect((await mark("admin", arm2.id, [{ studentId: theirs.id, status: "PRESENT" }])).status).toBe(200);
    const before = await records(theirs.id);
    expect(before).toHaveLength(1);

    for (const list of [
      [{ studentId: theirs.id, status: "ABSENT" }],
      [
        { studentId: mine.id, status: "PRESENT" },
        { studentId: theirs.id, status: "ABSENT" },
      ],
      [
        { studentId: theirs.id, status: "ABSENT" },
        { studentId: mine.id, status: "PRESENT" },
      ],
    ]) {
      const res = await mark("teacher", arm1.id, list);
      expect.soft(res.status, res.text).toBe(400);
      expect.soft(res.json?.error?.code).toBe("VALIDATION");
    }
    expect(await records(theirs.id)).toEqual(before);
    expect(await records(mine.id), "the student of this arm, named in the same request").toHaveLength(0);
  });

  test("a student who is not in this school, or does not exist, is a 400 (never a 500) and nothing is written", async () => {
    const real = await pupil(arm1.id);
    const stranger = await db.studentRecord.create({
      data: { tenantId: b.id, firstName: "Out", lastName: "Sider", dateOfBirth: new Date("2014-01-01"), admissionNo: `B-${Date.now()}` },
    });
    for (const id of ["no-such-student", stranger.id]) {
      const res = await mark("teacher", arm1.id, [
        { studentId: real.id, status: "PRESENT" },
        { studentId: id, status: "PRESENT" },
      ]);
      expect.soft(res.status, `${id}: ${res.text}`).toBe(400);
    }
    expect(await records(real.id)).toHaveLength(0);
    expect(await records(stranger.id)).toHaveLength(0);
  });

  test("an id that cannot be an id (a NUL byte) is a 400, not a database error", async () => {
    const real = await pupil(arm1.id);
    const nul = `a${String.fromCharCode(0)}b`;
    const res = await mark("teacher", arm1.id, [
      { studentId: real.id, status: "PRESENT" },
      { studentId: nul, status: "PRESENT" },
    ]);
    expect.soft(res.status, res.text).toBe(400);
    expect(await records(real.id)).toHaveLength(0);
  });

  test("a student listed twice is a 400 and nothing is written", async () => {
    const [one, two] = [await pupil(arm1.id), await pupil(arm1.id)];
    const res = await mark("teacher", arm1.id, [
      { studentId: one.id, status: "PRESENT" },
      { studentId: two.id, status: "PRESENT" },
      { studentId: one.id, status: "ABSENT" },
    ]);
    expect.soft(res.status, res.text).toBe(400);
    expect(await records(one.id)).toHaveLength(0);
    expect(await records(two.id)).toHaveLength(0);
  });

  test("a student who has left the arm (a transferred enrolment) or been archived, and one with no enrolment, is not on the roll", async () => {
    const real = await pupil(arm1.id);
    const left = await pupil(arm1.id, { status: "TRANSFERRED" });
    const archived = await pupil(arm1.id, { archived: true });
    const none = await pupil(null);
    for (const [name, student] of Object.entries({ left, archived, none })) {
      const res = await mark("teacher", arm1.id, [
        { studentId: real.id, status: "PRESENT" },
        { studentId: student.id, status: "PRESENT" },
      ]);
      expect.soft(res.status, `${name}: ${res.text}`).toBe(400);
    }
    expect(await records(real.id)).toHaveLength(0);
  });

  test("with no active session nothing is taken: 409 SESSION_NOT_ACTIVE", async () => {
    const real = await pupil(arm1.id);
    await db.academicSession.update({ where: { id: session.id }, data: { status: "CLOSED" } });
    try {
      const res = await mark("teacher", arm1.id, [{ studentId: real.id, status: "PRESENT" }]);
      expect.soft(res.status, res.text).toBe(409);
      expect.soft(res.json?.error?.code).toBe("SESSION_NOT_ACTIVE");
      expect(await records(real.id)).toHaveLength(0);
    } finally {
      await db.academicSession.update({ where: { id: session.id }, data: { status: "ACTIVE" } });
    }
  });

  test("a teacher is still held to their own arms, and another school's administrator is refused (controls)", async () => {
    const theirs = await pupil(arm2.id);
    expect((await mark("teacher", arm2.id, [{ studentId: theirs.id, status: "PRESENT" }])).status).toBe(404);
    expect([403, 404]).toContain((await mark("outsider", arm1.id, [{ studentId: theirs.id, status: "PRESENT" }])).status);
    expect(await records(theirs.id)).toHaveLength(0);
  });
});
