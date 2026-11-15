import "../support/env";
import { test, expect } from "@playwright/test";
import { NotificationChannel, NotificationDispatchStatus, Role } from "@prisma/client";
import { SAAS_URL } from "../support/env";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api } from "../support/http";
import { classArm, member, type Person } from "../support/qbank-world";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { triggerAttendanceAbsenceAlerts } from "@/lib/communication/event-triggers";

// Task 0068: a campus administrator is "scoped exclusively to their physical campus" (HANDOVER 1), but the broadcast ignored their campus (a campus administrator could message every guardian and member of staff
// of the school, or any other campus), the campus choice never narrowed the guardians for anyone, a dispatch carried no campus, and the delivery log and its retry showed and re-queued every message of the school.
// A school with two campuses, a pupil and a member of staff on each and a pupil and a member of staff on none (the whole school), plus a guardian whose two children are on different campuses. Every claim is read
// back from the database: who a broadcast was queued for, the campus each queued message carries, and what the log shows and may retry.

test.describe.configure({ timeout: 120_000 });

const tag = `C${Date.now().toString(36)}`;
let school: TestTenant;
let north: string;
let south: string;
let admin: Person;
let campusAdminNorth: Person;
let campusAdminSouth: Person;
let armNorth: string;
let armSouth: string;
let northPupil: string;
let southPupil: string;
let wholeSchoolPupil: string;

const addr = (who: string) => `${who}.${tag.toLowerCase()}@campus.test`;
const ADDRESSES = {
  guardianNorth: addr("gnorth"),
  guardianSouth: addr("gsouth"),
  guardianWhole: addr("gwhole"),
  guardianBoth: addr("gboth"),
  staffNorth: addr("snorth"),
  staffSouth: addr("ssouth"),
  staffWhole: addr("swhole"),
};

async function pupilOn(campusId: string | null, name: string) {
  return (
    await db.studentRecord.create({
      data: {
        tenantId: school.id,
        campusId,
        firstName: name,
        lastName: tag,
        dateOfBirth: new Date("2012-05-05"),
        admissionNo: `${tag}/${name}`,
      },
    })
  ).id;
}
async function guardianFor(email: string, studentIds: string[], primary = true) {
  const record = await db.guardianRecord.create({
    data: { tenantId: school.id, firstName: "Parent", lastName: email.split("@")[0], email },
  });
  for (const [index, studentId] of studentIds.entries()) {
    await db.guardianLink.create({
      data: {
        tenantId: school.id,
        studentId,
        guardianId: record.id,
        relationship: "GUARDIAN",
        status: "APPROVED",
        isPrimary: primary && index === 0,
      },
    });
  }
  return record.id;
}
const staffOn = (campusId: string | null, email: string) =>
  db.staffRecord.create({
    data: { tenantId: school.id, campusId, category: "TEACHING", firstName: "Staff", lastName: email.split("@")[0], email },
  });

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: `${tag} Campus School`, campuses: ["North", "South"] });
  [north, south] = [school.campuses[0].id, school.campuses[1].id];
  admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  campusAdminNorth = await member(school, Role.CAMPUS_ADMIN, north, `${tag} North Admin`);
  campusAdminSouth = await member(school, Role.CAMPUS_ADMIN, south, `${tag} South Admin`);
  armNorth = (await classArm(school, north, `${tag} North class`)).armId;
  armSouth = (await classArm(school, south, `${tag} South class`)).armId;
  northPupil = await pupilOn(north, "Nora");
  southPupil = await pupilOn(south, "Sam");
  wholeSchoolPupil = await pupilOn(null, "Wale");
  await guardianFor(ADDRESSES.guardianNorth, [northPupil]);
  await guardianFor(ADDRESSES.guardianSouth, [southPupil]);
  await guardianFor(ADDRESSES.guardianWhole, [wholeSchoolPupil]);
  // not the primary guardian of either child (the database allows one primary guardian per pupil)
  await guardianFor(ADDRESSES.guardianBoth, [northPupil, southPupil], false);
  await staffOn(north, ADDRESSES.staffNorth);
  await staffOn(south, ADDRESSES.staffSouth);
  await staffOn(null, ADDRESSES.staffWhole);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.notificationDispatch.deleteMany({ where: { tenantId: school.id } });
});

const send = (who: Person, body: Record<string, unknown>) =>
  api(`/api/v1/schools/${school.code}/communication/broadcast`, {
    method: "POST",
    baseUrl: SAAS_URL,
    cookie: who.cookie,
    body: { channel: NotificationChannel.EMAIL, audienceRole: "ALL", subject: "Hello", body: "Hello everyone.", ...body },
  });
const queuedAddresses = async () =>
  (await db.notificationDispatch.findMany({ where: { tenantId: school.id }, select: { recipientAddress: true } }))
    .map((row) => row.recipientAddress)
    .sort();
const sorted = (...list: string[]) => [...list].sort();
const log = (who: Person, query = "") =>
  api(`/api/v1/schools/${school.code}/communication/dispatches?limit=100${query}`, { baseUrl: SAAS_URL, cookie: who.cookie });
const logged = (res: { json: { data: { recipientAddress: string }[] } }) => res.json.data.map((row) => row.recipientAddress).sort();

test("a campus administrator who names no campus reaches the guardians and staff of their own campus and no one else", async () => {
  const res = await send(campusAdminNorth, {});
  expect(res.status).toBe(201);
  expect(res.json.data.count).toBe(3);
  // North's guardian, the guardian with a child on North, and North's member of staff. Not South's, not the whole school's.
  expect(await queuedAddresses()).toEqual(sorted(ADDRESSES.guardianNorth, ADDRESSES.guardianBoth, ADDRESSES.staffNorth));
});

test("a campus administrator cannot name another campus, and cannot name a class arm of another campus", async () => {
  const other = await send(campusAdminNorth, { campusId: south });
  expect(other.status).toBe(403);
  const arm = await send(campusAdminNorth, { classArmId: armSouth });
  expect(arm.status).toBe(404);
  expect(await queuedAddresses(), "nothing was queued by either refused broadcast").toEqual([]);
  // their own campus named is the same as naming none
  expect((await send(campusAdminNorth, { campusId: north, audienceRole: "STAFF" })).status).toBe(201);
  expect(await queuedAddresses()).toEqual([ADDRESSES.staffNorth]);
});

test("the school's administrator who chooses a campus reaches that campus's guardians as well as its staff", async () => {
  expect((await send(admin, { campusId: north })).status).toBe(201);
  expect(await queuedAddresses()).toEqual(sorted(ADDRESSES.guardianNorth, ADDRESSES.guardianBoth, ADDRESSES.staffNorth));
  await db.notificationDispatch.deleteMany({ where: { tenantId: school.id } });
  expect((await send(admin, { campusId: south, audienceRole: "GUARDIAN" })).status).toBe(201);
  expect(await queuedAddresses()).toEqual(sorted(ADDRESSES.guardianSouth, ADDRESSES.guardianBoth));
});

test("the school's administrator with no campus chosen reaches everyone, including the people of no campus", async () => {
  const res = await send(admin, {});
  expect(res.status).toBe(201);
  expect(res.json.data.count).toBe(7);
  expect(await queuedAddresses()).toEqual(Object.values(ADDRESSES).sort());
});

test("every queued message carries the campuses of the people it is about", async () => {
  expect((await send(admin, {})).status).toBe(201);
  const campusIdsOf = async (address: string) =>
    (
      (await db.notificationDispatch.findFirstOrThrow({ where: { tenantId: school.id, recipientAddress: address } })).metadata as {
        campusIds?: string[];
      } | null
    )?.campusIds;
  expect(await campusIdsOf(ADDRESSES.guardianNorth)).toEqual([north]);
  expect(await campusIdsOf(ADDRESSES.guardianSouth)).toEqual([south]);
  expect((await campusIdsOf(ADDRESSES.guardianBoth))?.sort()).toEqual([north, south].sort());
  expect(await campusIdsOf(ADDRESSES.guardianWhole)).toEqual([]);
  expect(await campusIdsOf(ADDRESSES.staffNorth)).toEqual([north]);
  expect(await campusIdsOf(ADDRESSES.staffWhole)).toEqual([]);
});

test("an absence notice carries the campus of the absent pupil", async () => {
  await forTenant(trustedTenantId(school.id)).transaction((tx) =>
    triggerAttendanceAbsenceAlerts(tx, {
      tenantId: school.id,
      classArmId: armNorth,
      dateStr: "2046-10-16",
      absentStudentIds: [northPupil, wholeSchoolPupil],
      actorUserId: admin.user.id,
    }),
  );
  const rows = await db.notificationDispatch.findMany({ where: { tenantId: school.id, channel: NotificationChannel.EMAIL } });
  const campusIdsOf = (address: string) =>
    (rows.find((row) => row.recipientAddress === address)?.metadata as { campusIds?: string[] } | null)?.campusIds;
  expect(campusIdsOf(ADDRESSES.guardianNorth)).toEqual([north]);
  expect(campusIdsOf(ADDRESSES.guardianWhole)).toEqual([]);
});

test("the delivery log shows a campus administrator the messages of their campus only; the school's administrator sees all of them", async () => {
  expect((await send(admin, {})).status).toBe(201);
  // a message made before the campus was recorded: no `campusIds` at all
  await db.notificationDispatch.create({
    data: {
      tenantId: school.id,
      channel: NotificationChannel.EMAIL,
      recipientAddress: addr("old"),
      body: "an old message",
      status: NotificationDispatchStatus.SENT,
    },
  });
  const north = await log(campusAdminNorth);
  expect(north.status).toBe(200);
  expect(logged(north)).toEqual(sorted(ADDRESSES.guardianNorth, ADDRESSES.guardianBoth, ADDRESSES.staffNorth));
  expect(north.json.meta.total).toBe(3);
  expect(logged(await log(campusAdminSouth))).toEqual(sorted(ADDRESSES.guardianSouth, ADDRESSES.guardianBoth, ADDRESSES.staffSouth));
  // the filters work inside the scope: another campus's address searched for is not found
  expect(logged(await log(campusAdminNorth, `&recipient=${encodeURIComponent(ADDRESSES.guardianSouth)}`))).toEqual([]);
  const all = await log(admin);
  expect(logged(all)).toEqual([...Object.values(ADDRESSES), addr("old")].sort());
  expect(all.json.meta.total).toBe(8);
});

test("a campus administrator can retry a failed message of their campus, and not one of another campus or an old one", async () => {
  const failed = async (address: string, campusIds: string[] | null) =>
    (
      await db.notificationDispatch.create({
        data: {
          tenantId: school.id,
          channel: NotificationChannel.EMAIL,
          recipientAddress: address,
          body: "failed",
          status: NotificationDispatchStatus.FAILED,
          lastError: "boom",
          ...(campusIds ? { metadata: { campusIds } } : {}),
        },
      })
    ).id;
  const own = await failed(ADDRESSES.guardianNorth, [north]);
  const foreign = await failed(ADDRESSES.guardianSouth, [south]);
  const old = await failed(addr("old"), null);
  const retry = (who: Person, id: string) =>
    api(`/api/v1/schools/${school.code}/communication/dispatches/${id}/retry`, { method: "POST", baseUrl: SAAS_URL, cookie: who.cookie });
  const statusOf = async (id: string) => (await db.notificationDispatch.findUniqueOrThrow({ where: { id } })).status;

  expect((await retry(campusAdminNorth, foreign)).status, "another campus's message").toBe(400);
  expect((await retry(campusAdminNorth, old)).status, "a message with no campus").toBe(400);
  expect(await statusOf(foreign)).toBe(NotificationDispatchStatus.FAILED);
  expect(await statusOf(old)).toBe(NotificationDispatchStatus.FAILED);
  expect((await retry(campusAdminNorth, own)).status, "their own campus's message").toBe(200);
  expect(await statusOf(own)).toBe(NotificationDispatchStatus.QUEUED);
  // the school's administrator may retry any of them
  expect((await retry(admin, foreign)).status).toBe(200);
  expect((await retry(admin, old)).status).toBe(200);
});
