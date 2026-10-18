import "../support/env";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

let school: TestTenant;
let other: TestTenant;

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Comm School A" });
  other = await createTenant({ name: "Comm School B" });
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));

test.describe("NotificationTemplate RLS & Constraints", () => {
  test("tenant A creates a template; tenant B cannot read it, nor create one for tenant A", async () => {
    const tmpl = await asSchool(school).transaction((tx) =>
      tx.notificationTemplate.create({
        data: {
          tenantId: school.id,
          code: "ATTENDANCE_ABSENCE",
          name: "Absence Notice",
          channel: NotificationChannel.SMS,
          bodyTemplate: "Dear Parent, {{student_name}} was marked absent today.",
        },
      }),
    );

    // Tenant B cannot see Tenant A's template
    const otherTemplates = await asSchool(other).transaction((tx) => tx.notificationTemplate.findMany());
    expect(otherTemplates).toEqual([]);

    // Tenant B cannot insert for Tenant A
    await expect(
      asSchool(other).transaction((tx) =>
        tx.notificationTemplate.create({
          data: {
            tenantId: school.id,
            code: "ATTENDANCE_ABSENCE_2",
            name: "Hacked Notice",
            channel: NotificationChannel.EMAIL,
            bodyTemplate: "Illegal",
          },
        }),
      ),
    ).rejects.toThrow(/row-level security|policy/i);

    // Tenant A reads its template
    const myTemplates = await asSchool(school).transaction((tx) => tx.notificationTemplate.findMany());
    expect(myTemplates.map((t) => t.id)).toContain(tmpl.id);
  });

  test("unique constraint enforces one template per (tenantId, code, channel)", async () => {
    await expect(
      asSchool(school).transaction((tx) =>
        tx.notificationTemplate.create({
          data: {
            tenantId: school.id,
            code: "ATTENDANCE_ABSENCE",
            name: "Duplicate SMS Absence",
            channel: NotificationChannel.SMS,
            bodyTemplate: "Duplicate content",
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

test.describe("NotificationDispatch RLS", () => {
  test("dispatches are tenant-scoped and isolated", async () => {
    const dispatch = await asSchool(school).transaction((tx) =>
      tx.notificationDispatch.create({
        data: {
          tenantId: school.id,
          channel: NotificationChannel.SMS,
          recipientAddress: "+2348012345678",
          body: "Attendance alert test",
          status: NotificationDispatchStatus.QUEUED,
        },
      }),
    );

    // Tenant B sees nothing
    const otherDispatches = await asSchool(other).transaction((tx) => tx.notificationDispatch.findMany());
    expect(otherDispatches).toEqual([]);

    // Tenant A reads it
    const myDispatches = await asSchool(school).transaction((tx) => tx.notificationDispatch.findMany());
    expect(myDispatches.map((d) => d.id)).toContain(dispatch.id);

    // Cross-tenant update blocked
    await expect(
      asSchool(other).transaction((tx) =>
        tx.notificationDispatch.updateMany({
          where: { id: dispatch.id },
          data: { status: NotificationDispatchStatus.SENT },
        }),
      ),
    ).resolves.toEqual({ count: 0 });
  });
});

test.describe("GuardianLinkToken RLS", () => {
  test("tokens require a student in the same tenant and remain isolated", async () => {
    // Create a student in School A
    const student = await asSchool(school).transaction((tx) =>
      tx.studentRecord.create({
        data: {
          tenantId: school.id,
          admissionNo: "STU/2026/001",
          firstName: "Zainab",
          lastName: "Aliyu",
          dateOfBirth: new Date("2015-05-10"),
        },
      }),
    );

    const token = await asSchool(school).transaction((tx) =>
      tx.guardianLinkToken.create({
        data: {
          tenantId: school.id,
          studentId: student.id,
          tokenHash: "hash-token-1234567890",
          channel: NotificationChannel.WHATSAPP,
          action: "VIEW_ATTENDANCE",
          expiresAt: new Date(Date.now() + 86400_000),
        },
      }),
    );

    // Tenant B cannot read token
    expect(await asSchool(other).transaction((tx) => tx.guardianLinkToken.findMany())).toEqual([]);

    // Tenant A reads token
    const myTokens = await asSchool(school).transaction((tx) => tx.guardianLinkToken.findMany());
    expect(myTokens.map((t) => t.id)).toContain(token.id);

    // Cross-tenant student linking fails with foreign key check
    await expect(
      asSchool(other).transaction((tx) =>
        tx.guardianLinkToken.create({
          data: {
            tenantId: other.id,
            studentId: student.id,
            tokenHash: "hash-token-cross-tenant",
            channel: NotificationChannel.SMS,
            action: "VIEW_ATTENDANCE",
            expiresAt: new Date(Date.now() + 86400_000),
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

test.describe("NotificationAuditLog Append-Only Enforcement", () => {
  test("audit rows are isolated and strictly append-only (cannot update or delete)", async () => {
    const audit = await asSchool(school).transaction((tx) =>
      tx.notificationAuditLog.create({
        data: {
          tenantId: school.id,
          event: "ENQUEUED",
          channel: NotificationChannel.SMS,
          recipient: "+2348098765432",
          details: { message: "Test audit entry" },
        },
      }),
    );

    // Tenant B cannot see it
    expect(await asSchool(other).transaction((tx) => tx.notificationAuditLog.findMany())).toEqual([]);

    // Tenant A reads it
    const logs = await asSchool(school).transaction((tx) => tx.notificationAuditLog.findMany());
    expect(logs.map((l) => l.id)).toContain(audit.id);

    // Update throws immutable trigger exception
    await expect(
      asSchool(school).transaction((tx) =>
        tx.notificationAuditLog.updateMany({
          where: { id: audit.id },
          data: { event: "TAMPERED" },
        }),
      ),
    ).rejects.toThrow(/notification_audit_log_immutable|permission denied/i);

    // Delete throws immutable trigger exception
    await expect(
      asSchool(school).transaction((tx) =>
        tx.notificationAuditLog.deleteMany({
          where: { id: audit.id },
        }),
      ),
    ).rejects.toThrow(/notification_audit_log_immutable|permission denied/i);
  });
});
