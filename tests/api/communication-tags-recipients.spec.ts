import "../support/env";
import { test, expect } from "@playwright/test";
import { NotificationChannel, Role } from "@prisma/client";
import { SAAS_URL } from "../support/env";
import { addMembership, createTenant, createUser, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { messageDate } from "@/lib/communication/tags";

// Task 0056, through the real API: the tags of a broadcast are filled in per recipient (the school's name, today's date, and for a guardian their children's names and classes), and what cannot
// work is refused with its reason before anything is queued. The rules of the input check are unit-tested in tests/unit/communication-tags.spec.ts. The queue is not consumed in any test (nothing
// consumes it anywhere, task 0054), so what is checked is what was QUEUED: the NotificationDispatch rows the broadcast made.

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

let school: TestTenant;
let cookie = "";
let year1A = "";

type Rows = Array<{ recipientAddress: string; subject: string | null; body: string; channel: string }>;
const queued = (): Promise<Rows> =>
  forTenant(trustedTenantId(school.id)).transaction((tx) =>
    tx.notificationDispatch.findMany({
      where: { tenantId: school.id },
      select: { recipientAddress: true, subject: true, body: true, channel: true },
      orderBy: { recipientAddress: "asc" },
    }),
  );
const rowFor = (rows: Rows, address: string) => {
  const row = rows.find((r) => r.recipientAddress === address);
  expect(row, `a queued message for ${address}`).toBeDefined();
  return row!;
};
const broadcast = (body: Record<string, unknown>) =>
  api(`/api/v1/schools/${school.code}/communication/broadcast`, { method: "POST", body, cookie, baseUrl: SAAS_URL });

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Crescent Test School" });
  const admin = await createUser();
  await addMembership(admin.id, school.id, Role.ADMIN);
  cookie = cookieHeader((await loginAs(admin, { baseUrl: SAAS_URL })).token!);

  await forTenant(trustedTenantId(school.id)).transaction(async (tx) => {
    const session = await tx.academicSession.create({
      data: { tenantId: school.id, label: "2051/2052", startDate: day("2051-09-01"), endDate: day("2052-07-20"), status: "ACTIVE" },
    });
    const closed = await tx.academicSession.create({
      data: { tenantId: school.id, label: "2050/2051", startDate: day("2050-09-01"), endDate: day("2051-07-20"), status: "CLOSED" },
    });
    const y1 = await tx.classGroup.create({ data: { tenantId: school.id, name: "Year 1", sortOrder: 1 } });
    const y3 = await tx.classGroup.create({ data: { tenantId: school.id, name: "Year 3", sortOrder: 3 } });
    const armA = await tx.classArm.create({ data: { tenantId: school.id, classGroupId: y1.id, name: "A" } });
    const armB = await tx.classArm.create({ data: { tenantId: school.id, classGroupId: y3.id, name: "B" } });
    year1A = armA.id;

    const pupil = (firstName: string, lastName: string, n: number, archived = false) =>
      tx.studentRecord.create({
        data: {
          tenantId: school.id,
          admissionNo: `ADM/TAGS/${n}`,
          firstName,
          lastName,
          dateOfBirth: day("2015-05-15"),
          ...(archived ? { archivedAt: new Date() } : {}),
        },
      });
    const guardian = (firstName: string, lastName: string, phone: string, email: string) =>
      tx.guardianRecord.create({ data: { tenantId: school.id, firstName, lastName, phone, email } });
    const link = (studentId: string, guardianId: string, status: "APPROVED" | "PENDING" = "APPROVED") =>
      tx.guardianLink.create({ data: { tenantId: school.id, studentId, guardianId, relationship: "FATHER", status } });
    const enrol = (studentId: string, sessionId: string, classArmId: string, status: "ACTIVE" | "PROMOTED" = "ACTIVE") =>
      tx.studentEnrollment.create({ data: { tenantId: school.id, studentId, sessionId, classArmId, status } });

    const amina = await pupil("Amina", "Bello", 1);
    const ibrahim = await pupil("Ibrahim", "Sani", 2);
    const fatima = await pupil("Fatima", "Musa", 3);
    const sean = await pupil("Sean", "O'Neil", 4);
    const leftSchool = await pupil("Old", "Pupil", 5, true);
    await enrol(amina.id, session.id, armA.id);
    await enrol(ibrahim.id, session.id, armB.id);
    await enrol(fatima.id, closed.id, armA.id, "PROMOTED"); // enrolled only in a session that has closed (and was moved on)
    await enrol(sean.id, session.id, armA.id);

    const g1 = await guardian("Hauwa", "Bello", "08010000001", "hauwa.parent@example.com"); // Amina (Year 1 A) and Ibrahim (Year 3 B)
    await link(amina.id, g1.id);
    await link(ibrahim.id, g1.id);
    await link(leftSchool.id, g1.id); // an archived pupil is not named
    const g2 = await guardian("Musa", "Fatima", "08010000002", "musa.parent@example.com"); // Fatima, no class this session
    await link(fatima.id, g2.id);
    await guardian("Nobody", "Linked", "08010000003", "nobody.parent@example.com"); // no child at all
    const g4 = await guardian("Pending", "Link", "08010000004", "pending.parent@example.com"); // a link that is not approved is not a child
    await link(amina.id, g4.id, "PENDING");
    const g5 = await guardian("Oneil", "Parent", "08010000005", "oneil.parent@example.com");
    await link(sean.id, g5.id);

    const staff = (firstName: string, phone: string | null, email: string | null) =>
      tx.staffRecord.create({ data: { tenantId: school.id, category: "TEACHING", firstName, lastName: "Staff", phone, email } });
    await staff("Ngozi", "08020000001", "ngozi.staff@example.com");
    await staff("Dayo", null, "dayo.staff@example.com"); // no phone
  });
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeEach(async () => {
  await forTenant(trustedTenantId(school.id)).transaction((tx) => tx.notificationDispatch.deleteMany({ where: { tenantId: school.id } }));
});

test.describe("the tags of a broadcast are filled in, per recipient", () => {
  test("a guardian's message names their children and their classes now, the school and today's date", async () => {
    const zone = await forTenant(trustedTenantId(school.id)).transaction(
      async (tx) => (await tx.schoolSettings.findUnique({ where: { tenantId: school.id } }))!.timeZone,
    );
    const before = messageDate(new Date(), zone);
    const res = await broadcast({
      channel: NotificationChannel.SMS,
      audienceRole: "GUARDIAN",
      body: "Dear Guardian, {{student_name}} ({{class_arm}}) at {{school_name}}, {{date}}.",
    });
    const after = messageDate(new Date(), zone);
    expect(res.status).toBe(201);
    expect(res.json.data.count).toBe(5);

    const rows = await queued();
    const expected = (names: string, classes: string) =>
      [before, after].map((d) => `Dear Guardian, ${names} (${classes}) at Crescent Test School, ${d}.`);
    // two children in two classes, each class once; an archived pupil is not named
    expect(expected("Amina Bello and Ibrahim Sani", "Year 1 A and Year 3 B")).toContain(rowFor(rows, "08010000001").body);
    // a pupil enrolled only in a closed session has no class now
    expect(expected("Fatima Musa", "their class")).toContain(rowFor(rows, "08010000002").body);
    // no child at all
    expect(expected("your child", "their class")).toContain(rowFor(rows, "08010000003").body);
    // a link that is not approved is not a child
    expect(expected("your child", "their class")).toContain(rowFor(rows, "08010000004").body);
    for (const row of rows) expect(row.body).not.toContain("{{");
  });

  test("a class arm narrows the children a guardian's tags name to that arm", async () => {
    const res = await broadcast({
      channel: NotificationChannel.SMS,
      audienceRole: "GUARDIAN",
      classArmId: year1A,
      body: "{{student_name}} is in {{class_arm}}.",
    });
    expect(res.status).toBe(201);
    const rows = await queued();
    // Year 1 A holds Amina and Sean (Fatima's enrolment is in a closed session); Hauwa's other child is in Year 3 B and is not named
    expect(rowFor(rows, "08010000001").body).toBe("Amina Bello is in Year 1 A.");
    expect(rowFor(rows, "08010000005").body).toBe("Sean O'Neil is in Year 1 A.");
    expect(rows.map((r) => r.recipientAddress)).toEqual(["08010000001", "08010000005"]);
  });

  test("the subject is filled in too, and for Email the values are HTML-escaped", async () => {
    const res = await broadcast({
      channel: NotificationChannel.EMAIL,
      audienceRole: "GUARDIAN",
      classArmId: year1A,
      subject: "About {{student_name}} at {{school_name}}",
      body: "Hello {{student_name}}",
    });
    expect(res.status).toBe(201);
    const rows = await queued();
    const parent = rowFor(rows, "oneil.parent@example.com");
    expect(parent.subject).toBe("About Sean O&#039;Neil at Crescent Test School");
    expect(parent.body).toBe("Hello Sean O&#039;Neil");
    expect(parent.body).not.toContain("O'Neil");
  });

  test("staff and the whole community get the school's name and the date", async () => {
    const res = await broadcast({
      channel: NotificationChannel.EMAIL,
      audienceRole: "STAFF",
      subject: "Staff meeting",
      body: "{{school_name}} staff meeting, {{date}}",
    });
    expect(res.status).toBe(201);
    const rows = await queued();
    expect(rows.map((r) => r.recipientAddress)).toEqual(["dayo.staff@example.com", "ngozi.staff@example.com"]);
    for (const row of rows) {
      expect(row.body).toContain("Crescent Test School staff meeting, ");
      expect(row.body).not.toContain("{{");
    }
    const all = await broadcast({
      channel: NotificationChannel.EMAIL,
      audienceRole: "ALL",
      subject: "For everyone",
      body: "From {{school_name}}",
    });
    expect(all.status).toBe(201);
    const everyone = (await queued()).filter((r) => r.subject === "For everyone");
    expect(everyone.length).toBeGreaterThan(2); // the guardians and the staff
    for (const row of everyone) expect(row.body).toBe("From Crescent Test School");
  });

  test("a message with no tag is queued exactly as typed", async () => {
    const res = await broadcast({ channel: NotificationChannel.SMS, audienceRole: "STAFF", body: "School closes at 1:00 PM." });
    expect(res.status).toBe(201);
    expect(res.json.data.count).toBe(1); // only the staff member with a phone
    expect((await queued()).map((r) => [r.recipientAddress, r.body])).toEqual([["08020000001", "School closes at 1:00 PM."]]);
  });
});

test.describe("what cannot work is refused before anything is queued", () => {
  const refused = [
    {
      what: "an In-App message",
      body: { channel: NotificationChannel.IN_APP, audienceRole: "STAFF", body: "Hello" },
      message: "In-App messages are sent from Announcements: nothing here shows them to the person.",
    },
    {
      what: "the Students audience",
      body: { channel: NotificationChannel.SMS, audienceRole: "STUDENT", body: "Hello" },
      message: "Students are reached through their guardians: send to Parents / Guardians.",
    },
    {
      what: "a tag with no source (due_date) for guardians",
      body: { channel: NotificationChannel.EMAIL, audienceRole: "GUARDIAN", subject: "Fees", body: "Fees due {{due_date}}" },
      message: "These tags cannot be filled for guardians: {{due_date}}. Remove them or choose another audience.",
    },
    {
      what: "a pupil tag for staff",
      body: { channel: NotificationChannel.EMAIL, audienceRole: "STAFF", subject: "Note", body: "About {{student_name}}" },
      message: "These tags cannot be filled for staff: {{student_name}}. Remove them or choose another audience.",
    },
    {
      what: "a pupil tag for the whole community",
      body: { channel: NotificationChannel.SMS, audienceRole: "ALL", body: "About {{class_arm}}" },
      message:
        "These tags cannot be filled for the whole community (staff have no pupil): {{class_arm}}. Remove them or choose another audience.",
    },
    {
      what: "an unfillable tag in the subject",
      body: { channel: NotificationChannel.EMAIL, audienceRole: "GUARDIAN", subject: "Re {{unknown}}", body: "Hello" },
      message: "These tags cannot be filled for guardians: {{unknown}}. Remove them or choose another audience.",
    },
  ];
  for (const { what, body, message } of refused) {
    test(`${what}: 400 with the reason, and nothing queued`, async () => {
      const res = await broadcast(body);
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
      expect(res.json.error.details[0].message).toBe(message);
      expect(await queued()).toEqual([]);
    });
  }
});
