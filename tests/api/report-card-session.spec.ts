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

// The report card is for a PERIOD (task 0031, decision D6). It used to read the pupil's CURRENT active enrolment, so after a promotion the card of a past term showed the new class, and its class
// rank was drawn from the new arm's pupils. It now reads the enrolment of the period's own session. Over real HTTP.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let admin: TestUser;
let cookie = "";
let counter = 0;
const uniq = (p: string) => `${p}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Card School" });
  admin = await createUser({ name: "cardadmin" });
  await addMembership(admin.id, a.id, Role.ADMIN);
  cookie = cookieHeader((await loginAs(admin, SAAS)).token!);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test("after a promotion the card of the past term still shows the class the pupil was in, and ranks them among that class", async () => {
  const s1 = await db.academicSession.create({
    data: { tenantId: a.id, label: "2041/2042", startDate: day("2041-09-01"), endDate: day("2042-07-20"), status: "ACTIVE" },
  });
  const s2 = await db.academicSession.create({
    data: { tenantId: a.id, label: "2042/2043", startDate: day("2042-09-01"), endDate: day("2043-07-20") },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: a.id,
      sessionId: s1.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2041-09-01"),
      endDate: day("2041-12-15"),
      isCurrent: true,
    },
  });
  const g1 = await db.classGroup.create({ data: { tenantId: a.id, name: "Year 1", sortOrder: 1 } });
  const g2 = await db.classGroup.create({ data: { tenantId: a.id, name: "Year 2", sortOrder: 2 } });
  const arm1 = await db.classArm.create({ data: { tenantId: a.id, classGroupId: g1.id, name: "A" } });
  const arm2 = await db.classArm.create({ data: { tenantId: a.id, classGroupId: g2.id, name: "A" } });
  const maths = await db.subject.create({ data: { tenantId: a.id, name: "Maths" } });
  const make = async (name: string, score: number) => {
    const student = await db.studentRecord.create({
      data: { tenantId: a.id, firstName: name, lastName: "Card", dateOfBirth: day("2014-01-01"), admissionNo: uniq("CD/") },
    });
    const enrolment = await db.studentEnrollment.create({
      data: { tenantId: a.id, studentId: student.id, sessionId: s1.id, classArmId: arm1.id },
    });
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: student.id,
        subjectId: maths.id,
        periodId: term.id,
        score,
        maxScore: 100,
        status: "PUBLISHED",
        verificationToken: uniq("tok"),
      },
    });
    return { student, enrolment };
  };
  const high = await make("High", 90);
  const mid = await make("Mid", 70);
  const low = await make("Low", 40);
  const card = async (id: string) =>
    (await api(`/api/v1/schools/${a.code}/people/students/${id}/report-card?periodId=${term.id}`, { ...SAAS, cookie })).json.data as {
      student: { classGroup?: string; classArm?: string };
      summary: { classRank: number | null; classSize: number };
    };

  // Before the promotion: Year 1, ranked 2 of 3.
  expect(await card(mid.student.id)).toMatchObject({
    student: { classGroup: "Year 1", classArm: "A" },
    summary: { classRank: 2, classSize: 3 },
  });

  // The class is rolled: High and Mid move up to Year 2; Low repeats in Year 1. (What a promotion does to enrolments.)
  for (const x of [high, mid]) {
    await db.studentEnrollment.update({ where: { id: x.enrolment.id }, data: { status: "PROMOTED" } });
    await db.studentEnrollment.create({ data: { tenantId: a.id, studentId: x.student.id, sessionId: s2.id, classArmId: arm2.id } });
  }
  await db.studentEnrollment.update({ where: { id: low.enrolment.id }, data: { status: "REPEATED" } });
  await db.studentEnrollment.create({ data: { tenantId: a.id, studentId: low.student.id, sessionId: s2.id, classArmId: arm1.id } });

  // The card of the First Term of 2041/2042 is unchanged: Year 1, rank 2 of 3 (the three who finished the session in that arm), not Year 2 and not a rank among the new classes.
  expect(await card(mid.student.id)).toMatchObject({
    student: { classGroup: "Year 1", classArm: "A" },
    summary: { classRank: 2, classSize: 3 },
  });
  expect(await card(low.student.id)).toMatchObject({ student: { classGroup: "Year 1" }, summary: { classRank: 3, classSize: 3 } });
  expect(await card(high.student.id)).toMatchObject({ summary: { classRank: 1, classSize: 3 } });

  // A pupil who withdrew in that session was never ranked, as before.
  const left = await make("Left", 10);
  await db.studentEnrollment.update({ where: { id: left.enrolment.id }, data: { status: "WITHDRAWN" } });
  expect((await card(mid.student.id)).summary).toMatchObject({ classRank: 2, classSize: 3 });
});
