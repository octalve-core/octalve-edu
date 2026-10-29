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

// A student's report card (GET /people/students/[id]/report-card): a student and a parent read their own, and staff read the students their campus
// (and, for a teacher, their arms) allow - the rule the student's attendance history already applies (ISS-0013).

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let admin: TestUser;
let teacher: TestUser;
let bystander: TestUser;
let clerkNorth: TestUser;
let clerkSchool: TestUser;
let parent: TestUser;
let pupilUser: TestUser;
const cookie: Record<string, string> = {};

let period: { id: string };
let northPupil: { id: string };
let southPupil: { id: string };

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Report Cards", campuses: ["Alpha North", "Alpha South"] });
  const [north, south] = a.campuses;

  admin = await createUser();
  teacher = await createUser();
  bystander = await createUser();
  clerkNorth = await createUser();
  clerkSchool = await createUser();
  parent = await createUser();
  pupilUser = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(teacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(bystander.id, a.id, Role.TEACHING_STAFF);
  await addMembership(clerkNorth.id, a.id, Role.NON_TEACHING_STAFF, north.id);
  await addMembership(clerkSchool.id, a.id, Role.NON_TEACHING_STAFF);
  await addMembership(parent.id, a.id, Role.PARENT);
  await addMembership(pupilUser.id, a.id, Role.STUDENT);
  for (const [key, user] of Object.entries({ admin, teacher, bystander, clerkNorth, clerkSchool, parent, pupilUser }))
    cookie[key] = await cookieFor(user);

  const session = await db.academicSession.create({
    data: { tenantId: a.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
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
  const groupNorth = await db.classGroup.create({ data: { tenantId: a.id, name: "JSS 1 North", sortOrder: 1, campusId: north.id } });
  const groupSouth = await db.classGroup.create({ data: { tenantId: a.id, name: "JSS 1 South", sortOrder: 2, campusId: south.id } });
  const armNorth = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupNorth.id, name: "A" } });
  const armSouth = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupSouth.id, name: "A" } });
  const subject = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTHRC" } });

  // the teacher teaches the north arm only; the bystander teaches nothing
  const staff = await db.staffRecord.create({
    data: { tenantId: a.id, userId: teacher.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
  });
  await db.staffSubjectAssignment.create({
    data: { tenantId: a.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: armNorth.id },
  });

  const pupil = (firstName: string, campusId: string, armId: string, userId: string | null = null) =>
    db.studentRecord
      .create({
        data: {
          tenantId: a.id,
          firstName,
          lastName: "Card",
          dateOfBirth: new Date("2014-05-05"),
          admissionNo: `RC-${firstName}`,
          campusId,
          userId,
        },
      })
      .then(async (student) => {
        await db.studentEnrollment.create({
          data: { tenantId: a.id, sessionId: session.id, classArmId: armId, studentId: student.id, status: "ACTIVE" },
        });
        await db.result.create({
          data: {
            tenantId: a.id,
            studentId: student.id,
            subjectId: subject.id,
            periodId: period.id,
            score: 70,
            status: "PUBLISHED",
            enteredByStaffId: teacher.id,
            verificationToken: `rc-${firstName}`,
          },
        });
        return student;
      });
  northPupil = await pupil("Nadia", north.id, armNorth.id, pupilUser.id);
  southPupil = await pupil("Sade", south.id, armSouth.id);

  const guardian = await db.guardianRecord.create({ data: { tenantId: a.id, userId: parent.id, firstName: "Amina", lastName: "Card" } });
  await db.guardianLink.create({
    data: {
      tenantId: a.id,
      studentId: northPupil.id,
      guardianId: guardian.id,
      relationship: "MOTHER",
      status: "APPROVED",
      isPrimary: true,
    },
  });
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const card = (who: string, studentId: string) =>
  api(`/api/v1/schools/${a.code}/people/students/${studentId}/report-card?periodId=${period.id}`, { ...SAAS, cookie: cookie[who] });

test.describe("a student's report card: who may read whose", () => {
  test("a teacher reads the students of the arms they teach, and no others", async () => {
    expect((await card("teacher", northPupil.id)).status).toBe(200);
    const other = await card("teacher", southPupil.id);
    expect.soft(other.status, other.text).toBe(404);
  });

  test("a teacher who teaches no arm reads no report card", async () => {
    const res = await card("bystander", northPupil.id);
    expect.soft(res.status, res.text).toBe(404);
  });

  test("a member anchored to a campus reads that campus's students, and a member of the whole school reads every campus's", async () => {
    expect((await card("clerkNorth", northPupil.id)).status).toBe(200);
    const other = await card("clerkNorth", southPupil.id);
    expect.soft(other.status, other.text).toBe(404);
    expect((await card("clerkSchool", northPupil.id)).status).toBe(200);
    expect((await card("clerkSchool", southPupil.id)).status).toBe(200);
  });

  test("an administrator reads any (control)", async () => {
    expect((await card("admin", northPupil.id)).status).toBe(200);
    expect((await card("admin", southPupil.id)).status).toBe(200);
  });

  test("a student reads their own and no one else's; a parent reads their child's and no one else's (controls)", async () => {
    expect((await card("pupilUser", northPupil.id)).status).toBe(200);
    expect((await card("pupilUser", southPupil.id)).status).toBe(403);
    expect((await card("parent", northPupil.id)).status).toBe(200);
    expect((await card("parent", southPupil.id)).status).toBe(403);
  });

  test("an id that cannot be an id, and one that is not in this school, are the same 404", async () => {
    const nul = `a${String.fromCharCode(0)}b`;
    for (const id of [nul, "no-such-student"]) {
      const res = await card("teacher", id);
      expect.soft(res.status, `${id}: ${res.text}`).toBe(404);
    }
  });
});
