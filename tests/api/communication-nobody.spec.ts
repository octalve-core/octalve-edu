import "../support/env";
import { test, expect } from "@playwright/test";
import { NotificationChannel, Role } from "@prisma/client";
import { SAAS_URL } from "../support/env";
import { activeSession, classArm, member, type Person } from "../support/qbank-world";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api } from "../support/http";

// Task 0069: a broadcast with no one to go to used to answer `201 { count: 0 }` and the composer called that a success. The answer now also says how many PEOPLE in the audience have no address for the
// channel (`withoutAddress`: an email address for an email, a phone number for an SMS or a WhatsApp message), each person once. A school with parents whose phone numbers it recorded and whose email
// addresses it did not: who is reached by which channel, who is not, and that nothing is queued when no one is reached. Read back from the database.

test.describe.configure({ timeout: 120_000 });

const tag = `N${Date.now().toString(36)}`;
// phone numbers are digits only (the database refuses any other shape)
const digits = Date.now().toString().slice(-7);
let school: TestTenant;
let admin: Person;
let armX: string;
let armY: string;
let armEmpty: string;

async function pupilIn(arm: string, name: string) {
  const student = await db.studentRecord.create({
    data: { tenantId: school.id, firstName: name, lastName: tag, dateOfBirth: new Date("2012-05-05"), admissionNo: `${tag}/${name}` },
  });
  await db.studentEnrollment.create({
    data: { tenantId: school.id, sessionId: await activeSession(school), classArmId: arm, studentId: student.id, status: "ACTIVE" },
  });
  return student.id;
}
async function guardianOf(name: string, studentIds: string[], contact: { email?: string; phone?: string }) {
  const record = await db.guardianRecord.create({ data: { tenantId: school.id, firstName: "Parent", lastName: name, ...contact } });
  for (const studentId of studentIds) {
    // not primary: the database allows one primary guardian per pupil and this spec needs none
    await db.guardianLink.create({
      data: { tenantId: school.id, studentId, guardianId: record.id, relationship: "GUARDIAN", status: "APPROVED", isPrimary: false },
    });
  }
}

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: `${tag} Nobody School` });
  admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  armX = (await classArm(school, null, `${tag} X`)).armId;
  armY = (await classArm(school, null, `${tag} Y`)).armId;
  armEmpty = (await classArm(school, null, `${tag} Empty`)).armId;
  // a phone number and no email, and TWO children in class X (so a count of people must not count them twice)
  await guardianOf("phone", [await pupilIn(armX, "Ann"), await pupilIn(armX, "Ben")], { phone: `0801${digits}` });
  // neither an email nor a phone number
  await guardianOf("none", [await pupilIn(armX, "Cy")], {});
  // both
  await guardianOf("both", [await pupilIn(armY, "Di")], { email: `both.${tag.toLowerCase()}@nobody.test`, phone: `0802${digits}` });
  await db.staffRecord.create({
    data: {
      tenantId: school.id,
      category: "TEACHING",
      firstName: "Staff",
      lastName: "mail",
      email: `staff.${tag.toLowerCase()}@nobody.test`,
    },
  });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.notificationDispatch.deleteMany({ where: { tenantId: school.id } });
});

const send = (body: Record<string, unknown>) =>
  api(`/api/v1/schools/${school.code}/communication/broadcast`, {
    method: "POST",
    baseUrl: SAAS_URL,
    cookie: admin.cookie,
    body: { channel: NotificationChannel.EMAIL, audienceRole: "GUARDIAN", subject: "Hello", body: "Hello everyone.", ...body },
  });
const queued = () => db.notificationDispatch.count({ where: { tenantId: school.id } });

test("an email to the guardians reaches only those with an email address, and says how many people have none", async () => {
  const res = await send({});
  expect(res.status).toBe(201);
  expect(res.json.data).toMatchObject({ count: 1, channel: "EMAIL", withoutAddress: 2 });
  expect(await queued()).toBe(1);
});

test("a class whose guardians have no email address gets nothing, says how many people that is (each once), and queues nothing", async () => {
  const res = await send({ classArmId: armX });
  expect(res.status).toBe(201);
  // the guardian of two children in the class and the guardian with no contact at all: two people, not three
  expect(res.json.data).toMatchObject({ count: 0, channel: "EMAIL", withoutAddress: 2 });
  expect(await queued()).toBe(0);
});

test("the same class by SMS reaches the guardian with a phone number, and the one with none is counted", async () => {
  const res = await send({ classArmId: armX, channel: NotificationChannel.SMS, subject: undefined });
  expect(res.status).toBe(201);
  expect(res.json.data).toMatchObject({ count: 1, channel: "SMS", withoutAddress: 1 });
  expect(await queued()).toBe(1);
});

test("an email to the staff reaches the member of staff with an address and counts no one as missing", async () => {
  const res = await send({ audienceRole: "STAFF" });
  expect(res.status).toBe(201);
  expect(res.json.data).toMatchObject({ count: 1, channel: "EMAIL", withoutAddress: 0 });
});

test("a class with no pupils has nobody in it: nothing sent and no one missing an address", async () => {
  const res = await send({ classArmId: armEmpty });
  expect(res.status).toBe(201);
  expect(res.json.data).toMatchObject({ count: 0, channel: "EMAIL", withoutAddress: 0 });
  expect(await queued()).toBe(0);
});

test("everyone by SMS counts both the guardian with no phone number and the member of staff with none", async () => {
  const res = await send({ audienceRole: "ALL", channel: NotificationChannel.SMS, subject: undefined });
  expect(res.status).toBe(201);
  // phone numbers: the guardian "phone" and the guardian "both"; no phone number: the guardian "none" and the member of staff
  expect(res.json.data).toMatchObject({ count: 2, channel: "SMS", withoutAddress: 2 });
});
