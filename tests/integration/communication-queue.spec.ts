import "../support/env";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { processDispatchLifecycle, sanitizeErrorMessage, type DispatchHandler } from "@/lib/queue/dispatch-worker";
import { QUEUE_NAMES, getNotificationDispatchQueue, closeQueues } from "@/lib/queue/definitions";
import { closeQueueRedisClient } from "@/lib/queue/redis";

let tenantA: TestTenant;
let tenantB: TestTenant;

const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));
const asRecord = (val: unknown): Record<string, unknown> => (val && typeof val === "object" ? (val as Record<string, unknown>) : {});

test.beforeAll(async () => {
  await seedInstance();
  tenantA = await createTenant({ name: "Queue School A" });
  tenantB = await createTenant({ name: "Queue School B" });
});

test.afterAll(async () => {
  await closeQueues();
  await closeQueueRedisClient();
  await removeCreatedTenants();
});

test.describe("Error Sanitization & DLQ Protection", () => {
  test("sanitizeErrorMessage redacts sensitive credentials and truncates long stack traces", () => {
    const errorWithToken = new Error("Failed to send via Termii: Bearer sk_live_secret123456789 was rejected");
    const sanitized = sanitizeErrorMessage(errorWithToken);
    expect(sanitized).toContain("Bearer [REDACTED]");
    expect(sanitized).not.toContain("sk_live_secret123456789");

    const errorWithPassword = new Error("Connection failed with password: 'my-super-secret-password'");
    const sanitizedPw = sanitizeErrorMessage(errorWithPassword);
    expect(sanitizedPw).toContain("password=[REDACTED]");
    expect(sanitizedPw).not.toContain("my-super-secret-password");

    const veryLongError = new Error("A".repeat(1000));
    const truncated = sanitizeErrorMessage(veryLongError);
    expect(truncated.length).toBeLessThanOrEqual(500);
    expect(truncated.endsWith("...")).toBe(true);
  });
});

test.describe("Dispatch Worker Lifecycle & State Transitions", () => {
  test("successful dispatch transitions to SENT and creates DISPATCH_SENT audit log", async () => {
    // 1. Create a QUEUED dispatch record under Tenant A context
    const dispatch = await asSchool(tenantA).transaction((tx) =>
      tx.notificationDispatch.create({
        data: {
          tenantId: tenantA.id,
          channel: NotificationChannel.SMS,
          recipientAddress: "+2348011112222",
          body: "Test success message",
          status: NotificationDispatchStatus.QUEUED,
        },
      }),
    );

    const mockHandler: DispatchHandler = async (job) => {
      expect(job.dispatchId).toBe(dispatch.id);
      return { success: true, externalId: "MSG-12345" };
    };

    // 2. Execute process lifecycle (attempt 0 of 3)
    const result = await processDispatchLifecycle(
      {
        dispatchId: dispatch.id,
        tenantId: tenantA.id,
        channel: NotificationChannel.SMS,
        recipientAddress: "+2348011112222",
        body: "Test success message",
      },
      mockHandler,
      0, // attemptsMade
      3, // maxAttempts
    );

    expect(result.success).toBe(true);

    // 3. Verify record updated to SENT
    const updated = await asSchool(tenantA).transaction((tx) =>
      tx.notificationDispatch.findUnique({
        where: { id: dispatch.id },
      }),
    );
    expect(updated?.status).toBe(NotificationDispatchStatus.SENT);
    expect(updated?.sentAt).toBeTruthy();
    expect(updated?.attempts).toBe(1);
    expect(updated?.lastError).toBeNull();

    // 4. Verify audit log entry
    const auditLogs = await asSchool(tenantA).transaction((tx) =>
      tx.notificationAuditLog.findMany({
        where: { dispatchId: dispatch.id },
      }),
    );
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].event).toBe("DISPATCH_SENT");
    expect(auditLogs[0].channel).toBe(NotificationChannel.SMS);
    expect(asRecord(auditLogs[0].details).externalId).toBe("MSG-12345");
  });

  test("transient failure transitions to RETRYING with sanitized error and DISPATCH_RETRYING audit log", async () => {
    const dispatch = await asSchool(tenantA).transaction((tx) =>
      tx.notificationDispatch.create({
        data: {
          tenantId: tenantA.id,
          channel: NotificationChannel.EMAIL,
          recipientAddress: "parent@example.com",
          body: "Test retry message",
          status: NotificationDispatchStatus.QUEUED,
        },
      }),
    );

    const failingHandler: DispatchHandler = async () => {
      throw new Error("Temporary gateway timeout: api_key='secret-key-xyz'");
    };

    // Attempt 0 of 3 (transient failure, 2 remaining)
    await expect(
      processDispatchLifecycle(
        {
          dispatchId: dispatch.id,
          tenantId: tenantA.id,
          channel: NotificationChannel.EMAIL,
          recipientAddress: "parent@example.com",
          body: "Test retry message",
        },
        failingHandler,
        0, // attemptsMade
        3, // maxAttempts
      ),
    ).rejects.toThrow();

    // Verify record updated to RETRYING
    const updated = await asSchool(tenantA).transaction((tx) =>
      tx.notificationDispatch.findUnique({
        where: { id: dispatch.id },
      }),
    );
    expect(updated?.status).toBe(NotificationDispatchStatus.RETRYING);
    expect(updated?.attempts).toBe(1);
    expect(updated?.lastError).toContain("Temporary gateway timeout");
    expect(updated?.lastError).not.toContain("secret-key-xyz");

    // Verify audit log
    const audit = await asSchool(tenantA).transaction((tx) =>
      tx.notificationAuditLog.findFirst({
        where: { dispatchId: dispatch.id, event: "DISPATCH_RETRYING" },
      }),
    );
    expect(audit).toBeTruthy();
    expect(asRecord(audit?.details).maxAttempts).toBe(3);
  });

  test("terminal failure (exhausted retries) dead-letters to FAILED with DISPATCH_FAILED audit log", async () => {
    const dispatch = await asSchool(tenantA).transaction((tx) =>
      tx.notificationDispatch.create({
        data: {
          tenantId: tenantA.id,
          channel: NotificationChannel.WHATSAPP,
          recipientAddress: "+2348099998888",
          body: "Final attempt message",
          status: NotificationDispatchStatus.RETRYING,
          attempts: 2,
        },
      }),
    );

    const failingHandler: DispatchHandler = async () => {
      throw new Error("Recipient phone number is inactive or blocked");
    };

    // Attempt 2 of 3 (this is the 3rd and final attempt: attemptsMade = 2)
    await expect(
      processDispatchLifecycle(
        {
          dispatchId: dispatch.id,
          tenantId: tenantA.id,
          channel: NotificationChannel.WHATSAPP,
          recipientAddress: "+2348099998888",
          body: "Final attempt message",
        },
        failingHandler,
        2, // attemptsMade: 2, with maxAttempts: 3 -> this will be attempt #3
        3, // maxAttempts
      ),
    ).rejects.toThrow();

    // Verify record transitioned to FAILED (Dead-letter status)
    const updated = await asSchool(tenantA).transaction((tx) =>
      tx.notificationDispatch.findUnique({
        where: { id: dispatch.id },
      }),
    );
    expect(updated?.status).toBe(NotificationDispatchStatus.FAILED);
    expect(updated?.attempts).toBe(3);
    expect(updated?.lastError).toContain("Recipient phone number is inactive");

    // Verify terminal audit log
    const audit = await asSchool(tenantA).transaction((tx) =>
      tx.notificationAuditLog.findFirst({
        where: { dispatchId: dispatch.id, event: "DISPATCH_FAILED" },
      }),
    );
    expect(audit).toBeTruthy();
    expect(asRecord(audit?.details).attempts).toBe(3);
  });

  test("tenant boundary: lifecycle processing for tenant A cannot touch tenant B record", async () => {
    // Record in Tenant B
    const dispatchB = await asSchool(tenantB).transaction((tx) =>
      tx.notificationDispatch.create({
        data: {
          tenantId: tenantB.id,
          channel: NotificationChannel.SMS,
          recipientAddress: "+2348000000000",
          body: "Tenant B message",
          status: NotificationDispatchStatus.QUEUED,
        },
      }),
    );

    const handler: DispatchHandler = async () => ({ success: true });

    // Running with Tenant A's tenantId will execute under Tenant A RLS context
    // Tenant A's RLS policy cannot see or update Tenant B's record
    await processDispatchLifecycle(
      {
        dispatchId: dispatchB.id,
        tenantId: tenantA.id, // Mismatched tenant
        channel: NotificationChannel.SMS,
        recipientAddress: "+2348000000000",
        body: "Tenant B message",
      },
      handler,
      0,
      3,
    );

    // Tenant B's record remains QUEUED
    const checkB = await asSchool(tenantB).transaction((tx) =>
      tx.notificationDispatch.findUnique({
        where: { id: dispatchB.id },
      }),
    );
    expect(checkB?.status).toBe(NotificationDispatchStatus.QUEUED);
  });

  test("queue definitions and queue names are correctly configured", () => {
    expect(QUEUE_NAMES.NOTIFICATION_DISPATCH).toBe("notification-dispatch-queue");
    expect(QUEUE_NAMES.BULK_BROADCAST).toBe("bulk-broadcast-queue");

    const queue = getNotificationDispatchQueue();
    expect(queue.name).toBe(QUEUE_NAMES.NOTIFICATION_DISPATCH);
  });
});
