import "../support/env";
import { NotificationChannel, NotificationDispatchStatus, ResultStatus, PeriodKind } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import {
  triggerAttendanceAbsenceAlerts,
  triggerResultsPublishedAlerts,
  triggerInvoiceIssuedAlerts,
} from "@/lib/communication/event-triggers";
import { closeQueues } from "@/lib/queue/definitions";
import { closeQueueRedisClient } from "@/lib/queue/redis";

let tenant: TestTenant;
let studentId: string;
let classArmId: string;
let periodId: string;

const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));

test.beforeAll(async () => {
  await seedInstance();
  tenant = await createTenant({ name: "Event Trigger School" });

  await asSchool(tenant).transaction(async (tx) => {
    // 1. Session and period
    const session = await tx.academicSession.create({
      data: {
        tenantId: tenant.id,
        label: "2026/2027",
        status: "ACTIVE",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-31"),
      },
    });

    const period = await tx.academicPeriod.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        kind: PeriodKind.TERM,
        ordinal: 1,
        label: "First Term",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
      },
    });
    periodId = period.id;

    // 2. Class Group and Arm
    const classGroup = await tx.classGroup.create({
      data: {
        tenantId: tenant.id,
        name: "Primary 4",
      },
    });

    const arm = await tx.classArm.create({
      data: {
        tenantId: tenant.id,
        classGroupId: classGroup.id,
        name: "Primary 4 Gold",
      },
    });
    classArmId = arm.id;

    // 3. Student
    const student = await tx.studentRecord.create({
      data: {
        tenantId: tenant.id,
        admissionNo: "ADM/2026/EV01",
        firstName: "Tariq",
        lastName: "Nasir",
        dateOfBirth: new Date("2014-03-12"),
      },
    });
    studentId = student.id;

    // 4. Guardian and Primary Link
    const guardian = await tx.guardianRecord.create({
      data: {
        tenantId: tenant.id,
        firstName: "Nasir",
        lastName: "Bello",
        phone: "+2348022223333",
        email: "nasir.bello@example.com",
      },
    });

    await tx.guardianLink.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        guardianId: guardian.id,
        relationship: "FATHER",
        isPrimary: true,
        status: "APPROVED",
      },
    });
  });
});

test.afterAll(async () => {
  await closeQueues();
  await closeQueueRedisClient();
  await removeCreatedTenants();
});

test.describe("Domain Event Notification Triggers", () => {
  test("triggerAttendanceAbsenceAlerts enqueues SMS and Email alerts for absent students", async () => {
    const res = await asSchool(tenant).transaction(async (tx) => {
      return triggerAttendanceAbsenceAlerts(tx, {
        tenantId: tenant.id,
        classArmId,
        dateStr: "2026-10-16",
        absentStudentIds: [studentId],
        actorUserId: "teacher-user-1",
      });
    });

    // 2 dispatches: 1 SMS + 1 Email
    expect(res.dispatched).toBe(2);

    // Verify dispatches in database under tenant RLS
    const dispatches = await asSchool(tenant).transaction(async (tx) => {
      return tx.notificationDispatch.findMany({
        where: {
          tenantId: tenant.id,
          metadata: { path: ["studentId"], equals: studentId },
        },
      });
    });

    expect(dispatches.length).toBe(2);

    const smsDispatch = dispatches.find((d) => d.channel === NotificationChannel.SMS);
    expect(smsDispatch).toBeTruthy();
    expect(smsDispatch?.status).toBe(NotificationDispatchStatus.QUEUED);
    expect(smsDispatch?.recipientAddress).toBe("+2348022223333");
    expect(smsDispatch?.body).toContain("Tariq Nasir");
    expect(smsDispatch?.body).toContain("Primary 4 Gold");

    const emailDispatch = dispatches.find((d) => d.channel === NotificationChannel.EMAIL);
    expect(emailDispatch).toBeTruthy();
    expect(emailDispatch?.recipientAddress).toBe("nasir.bello@example.com");
    expect(emailDispatch?.subject).toContain("Absence Notice: Tariq Nasir");
  });

  test("triggerResultsPublishedAlerts generates magic token and enqueues notification", async () => {
    // Create a result for the student
    let resultId = "";
    await asSchool(tenant).transaction(async (tx) => {
      const subject = await tx.subject.create({
        data: {
          tenantId: tenant.id,
          name: "Mathematics",
          code: "MTHP4",
        },
      });

      const res = await tx.result.create({
        data: {
          tenantId: tenant.id,
          studentId,
          subjectId: subject.id,
          periodId,
          score: 88,
          maxScore: 100,
          gradeLetter: "A",
          status: ResultStatus.PUBLISHED,
          enteredByStaffId: "staff-1",
        },
      });
      resultId = res.id;
    });

    const triggerRes = await asSchool(tenant).transaction(async (tx) => {
      return triggerResultsPublishedAlerts(tx, {
        tenantId: tenant.id,
        resultIds: [resultId],
        actorUserId: "admin-1",
      });
    });

    expect(triggerRes.dispatched).toBeGreaterThanOrEqual(1);

    // Verify magic link token was generated for guardian
    const magicTokens = await asSchool(tenant).transaction(async (tx) => {
      return tx.guardianLinkToken.findMany({
        where: { tenantId: tenant.id, studentId, action: "VIEW_RESULTS" },
      });
    });
    expect(magicTokens.length).toBeGreaterThanOrEqual(1);

    // Verify dispatch mentions report card link
    const dispatches = await asSchool(tenant).transaction(async (tx) => {
      return tx.notificationDispatch.findMany({
        where: {
          tenantId: tenant.id,
          metadata: { path: ["studentId"], equals: studentId },
        },
      });
    });
    expect(dispatches.length).toBeGreaterThanOrEqual(1);
    expect(dispatches.some((d) => d.body.includes("report card"))).toBe(true);
  });

  test("triggerInvoiceIssuedAlerts generates payment magic token and enqueues invoice alert", async () => {
    let invoiceId = "";
    await asSchool(tenant).transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          tenantId: tenant.id,
          studentId,
          periodId,
          invoiceNo: "INV-2026-TEST01",
          totalAmount: 45000,
          amountPaid: 0,
          status: "UNPAID",
          lineItems: [{ name: "Tuition", amount: "45000" }],
        },
      });
      invoiceId = inv.id;
    });

    const triggerRes = await asSchool(tenant).transaction(async (tx) => {
      return triggerInvoiceIssuedAlerts(tx, {
        tenantId: tenant.id,
        invoiceIds: [invoiceId],
        actorUserId: "bursar-1",
      });
    });

    expect(triggerRes.dispatched).toBeGreaterThanOrEqual(1);

    // Verify payment magic token was generated
    const payTokens = await asSchool(tenant).transaction(async (tx) => {
      return tx.guardianLinkToken.findMany({
        where: { tenantId: tenant.id, studentId, action: "PAY_INVOICE" },
      });
    });
    expect(payTokens.length).toBeGreaterThanOrEqual(1);

    // Verify dispatch body mentions amount and payment link
    const invDispatches = await asSchool(tenant).transaction(async (tx) => {
      return tx.notificationDispatch.findMany({
        where: {
          tenantId: tenant.id,
          metadata: { path: ["invoiceId"], equals: invoiceId },
        },
      });
    });
    expect(invDispatches.length).toBeGreaterThanOrEqual(1);
    expect(invDispatches[0].body).toContain("45,000");
  });
});
