import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { NotificationChannel, NotificationDispatchStatus, Role } from "@prisma/client";
import { addMembership, createTenant, createUser, removeCreatedTenants, seedInstance, type TestTenant, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

let a: TestTenant;
let b: TestTenant;
let adminA: TestUser;
let campusAdminA: TestUser;
let teacherA: TestUser;
let studentA: TestUser;
let adminB: TestUser;

const cookie: Record<string, string> = {};

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, { baseUrl: SAAS_URL });
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Communication Academy", campuses: ["Main Campus"] });
  b = await createTenant({ name: "Beta Communication School" });

  adminA = await createUser();
  campusAdminA = await createUser();
  teacherA = await createUser();
  studentA = await createUser();
  adminB = await createUser();

  await addMembership(adminA.id, a.id, Role.ADMIN);
  await addMembership(campusAdminA.id, a.id, Role.CAMPUS_ADMIN, a.campuses[0].id);
  await addMembership(teacherA.id, a.id, Role.TEACHING_STAFF);
  await addMembership(studentA.id, a.id, Role.STUDENT);
  await addMembership(adminB.id, b.id, Role.ADMIN);

  cookie.adminA = await cookieFor(adminA);
  cookie.campusAdminA = await cookieFor(campusAdminA);
  cookie.teacherA = await cookieFor(teacherA);
  cookie.studentA = await cookieFor(studentA);
  cookie.adminB = await cookieFor(adminB);

  // Seed sample guardian and student in tenant A for audience resolution
  await forTenant(trustedTenantId(a.id)).transaction(async (tx) => {
    const student = await tx.studentRecord.create({
      data: {
        tenantId: a.id,
        admissionNo: "ADM/COMM/001",
        firstName: "Amina",
        lastName: "Bello",
        dateOfBirth: new Date("2015-05-15"),
      },
    });

    const guardian = await tx.guardianRecord.create({
      data: {
        tenantId: a.id,
        firstName: "Suleiman",
        lastName: "Bello",
        phone: "+2348033334444",
        email: "suleiman.bello@example.com",
      },
    });

    await tx.guardianLink.create({
      data: {
        tenantId: a.id,
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
  await removeCreatedTenants();
});

test.describe("Communication API Endpoints & Role Guards", () => {
  let createdTemplateId: string;
  let failedDispatchId: string;

  test("admin can list notification templates and seeds default system templates", async () => {
    const res = await api(`/api/v1/schools/${a.code}/communication/templates`, {
      method: "GET",
      cookie: cookie.adminA,
      baseUrl: SAAS_URL,
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.data)).toBe(true);
    expect(res.json.data.length).toBeGreaterThanOrEqual(5);

    // Verify system templates present
    const codes = res.json.data.map((t: { code: string }) => t.code);
    expect(codes).toContain("ATTENDANCE_ABSENCE");
    expect(codes).toContain("RESULTS_PUBLISHED");
    expect(codes).toContain("FEE_INVOICE_ISSUED");
  });

  test("admin can create a custom notification template", async () => {
    const res = await api(`/api/v1/schools/${a.code}/communication/templates`, {
      method: "POST",
      body: {
        code: "EXCURSION_PERMISSION",
        name: "Excursion Permission Slip",
        channel: NotificationChannel.SMS,
        bodyTemplate: "Dear Guardian, please authorize {{student_name}} for the excursion on {{date}}.",
        variables: ["student_name", "date"],
      },
      cookie: cookie.adminA,
      baseUrl: SAAS_URL,
    });

    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({
      code: "EXCURSION_PERMISSION",
      name: "Excursion Permission Slip",
      channel: "SMS",
      isSystem: false,
    });
    createdTemplateId = res.json.data.id;
  });

  test("admin can update an existing template", async () => {
    const res = await api(`/api/v1/schools/${a.code}/communication/templates/${createdTemplateId}`, {
      method: "PATCH",
      body: {
        name: "Excursion Permission Slip (Updated)",
        bodyTemplate: "Notice: Please approve excursion for {{student_name}} before {{date}}.",
      },
      cookie: cookie.adminA,
      baseUrl: SAAS_URL,
    });

    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({
      id: createdTemplateId,
      name: "Excursion Permission Slip (Updated)",
      bodyTemplate: "Notice: Please approve excursion for {{student_name}} before {{date}}.",
    });
  });

  test("campus admin can read templates but cannot create templates", async () => {
    const getRes = await api(`/api/v1/schools/${a.code}/communication/templates`, {
      method: "GET",
      cookie: cookie.campusAdminA,
      baseUrl: SAAS_URL,
    });
    expect(getRes.status).toBe(200);

    const postRes = await api(`/api/v1/schools/${a.code}/communication/templates`, {
      method: "POST",
      body: {
        code: "UNAUTHORIZED_TMPL",
        name: "Unauthorized Template",
        channel: NotificationChannel.SMS,
        bodyTemplate: "Test body",
      },
      cookie: cookie.campusAdminA,
      baseUrl: SAAS_URL,
    });
    expect(postRes.status).toBe(403);
  });

  test("unauthorized roles (teacher, student) receive 403 on templates route", async () => {
    const teacherRes = await api(`/api/v1/schools/${a.code}/communication/templates`, {
      method: "GET",
      cookie: cookie.teacherA,
      baseUrl: SAAS_URL,
    });
    expect(teacherRes.status).toBe(403);

    const studentRes = await api(`/api/v1/schools/${a.code}/communication/templates`, {
      method: "GET",
      cookie: cookie.studentA,
      baseUrl: SAAS_URL,
    });
    expect(studentRes.status).toBe(403);
  });

  test("admin can trigger a broadcast notification to guardians", async () => {
    const res = await api(`/api/v1/schools/${a.code}/communication/broadcast`, {
      method: "POST",
      body: {
        channel: NotificationChannel.SMS,
        audienceRole: "GUARDIAN",
        body: "School will close early on Friday at 1:00 PM for staff development.",
      },
      cookie: cookie.adminA,
      baseUrl: SAAS_URL,
    });

    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({
      channel: "SMS",
      count: 1, // Suleiman Bello
    });
  });

  test("admin can list dispatches and filter by status and channel", async () => {
    const res = await api(`/api/v1/schools/${a.code}/communication/dispatches?channel=SMS`, {
      method: "GET",
      cookie: cookie.adminA,
      baseUrl: SAAS_URL,
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.data)).toBe(true);
    expect(res.json.data.length).toBeGreaterThanOrEqual(1);
    expect(res.json.meta).toMatchObject({
      page: 1,
      limit: 50,
    });
  });

  test("admin can retry a failed dispatch", async () => {
    // Manually create a failed dispatch in DB for Tenant A
    const failedDispatch = await forTenant(trustedTenantId(a.id)).transaction(async (tx) => {
      return tx.notificationDispatch.create({
        data: {
          tenantId: a.id,
          channel: NotificationChannel.SMS,
          recipientAddress: "+2348011112222",
          body: "Test failed message",
          status: NotificationDispatchStatus.FAILED,
          lastError: "Termii gateway timeout",
          attempts: 3,
        },
      });
    });
    failedDispatchId = failedDispatch.id;

    const res = await api(`/api/v1/schools/${a.code}/communication/dispatches/${failedDispatchId}/retry`, {
      method: "POST",
      cookie: cookie.adminA,
      baseUrl: SAAS_URL,
    });

    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({
      retried: true,
      dispatchId: failedDispatchId,
    });

    // Check DB status is now QUEUED
    const updated = await forTenant(trustedTenantId(a.id)).transaction(async (tx) => {
      return tx.notificationDispatch.findUnique({
        where: { tenantId_id: { tenantId: a.id, id: failedDispatchId } },
      });
    });
    expect(updated?.status).toBe(NotificationDispatchStatus.QUEUED);
    expect(updated?.lastError).toBeNull();
  });

  test("cross-tenant isolation: Tenant B admin cannot access Tenant A templates or dispatches", async () => {
    const tmplRes = await api(`/api/v1/schools/${a.code}/communication/templates/${createdTemplateId}`, {
      method: "GET",
      cookie: cookie.adminB,
      baseUrl: SAAS_URL,
    });
    expect(tmplRes.status).toBe(403);

    const retryRes = await api(`/api/v1/schools/${a.code}/communication/dispatches/${failedDispatchId}/retry`, {
      method: "POST",
      cookie: cookie.adminB,
      baseUrl: SAAS_URL,
    });
    expect(retryRes.status).toBe(403);
  });
});
