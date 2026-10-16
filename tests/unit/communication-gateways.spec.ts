import "../support/env";
import { NotificationChannel } from "@prisma/client";
import { test, expect } from "@playwright/test";
import {
  normalizeNigerianPhoneNumber,
  isValidPhoneNumber,
  sendTermiiMessage,
  getMockTermiiMessages,
  clearMockTermiiMessages,
} from "@/lib/communication/gateways/termii";
import { isValidEmail, sendEmail, sendBatchEmails } from "@/lib/communication/gateways/email";
import { defaultNotificationDispatcher } from "@/lib/communication/gateways/dispatcher";

test.describe("Phone Number Normalization & Validation (Termii)", () => {
  test("normalizeNigerianPhoneNumber converts local Nigerian formats to 234 prefix", () => {
    expect(normalizeNigerianPhoneNumber("08012345678")).toBe("2348012345678");
    expect(normalizeNigerianPhoneNumber("07098765432")).toBe("2347098765432");
    expect(normalizeNigerianPhoneNumber("09011112222")).toBe("2349011112222");
    expect(normalizeNigerianPhoneNumber("+2348012345678")).toBe("2348012345678");
    expect(normalizeNigerianPhoneNumber("2348012345678")).toBe("2348012345678");
    expect(normalizeNigerianPhoneNumber("+234 (801) 234-5678")).toBe("2348012345678");
  });

  test("isValidPhoneNumber detects valid Nigerian and international numbers", () => {
    expect(isValidPhoneNumber("08012345678")).toBe(true);
    expect(isValidPhoneNumber("+2348012345678")).toBe(true);
    expect(isValidPhoneNumber("2348012345678")).toBe(true);
    expect(isValidPhoneNumber("+447911123456")).toBe(true); // UK valid international

    expect(isValidPhoneNumber("1234")).toBe(false); // too short
    expect(isValidPhoneNumber("abc12345678")).toBe(false);
  });

  test("sendTermiiMessage routes through mock delivery in test environment", async () => {
    clearMockTermiiMessages();

    const res = await sendTermiiMessage({
      to: "08012345678",
      message: "Attendance alert: Ahmad is absent.",
      channel: "generic",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toContain("termii-mock-");

    const sent = getMockTermiiMessages();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe("2348012345678");
    expect(sent[0].message).toContain("Ahmad is absent");
    expect(sent[0].channel).toBe("generic");
  });

  test("sendTermiiMessage rejects invalid phone numbers", async () => {
    const res = await sendTermiiMessage({
      to: "not-a-number",
      message: "Invalid number test",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Invalid phone number");
  });
});

test.describe("Email Gateway (Resend & Mock)", () => {
  test("isValidEmail identifies valid vs invalid addresses", () => {
    expect(isValidEmail("parent@example.com")).toBe(true);
    expect(isValidEmail("guardian.first-last@school.edu.ng")).toBe(true);
    expect(isValidEmail("invalid-email")).toBe(false);
    expect(isValidEmail("@missing-user.com")).toBe(false);
  });

  test("sendEmail sends via mock mode in test environment", async () => {
    const res = await sendEmail({
      to: "guardian@example.com",
      subject: "Test Term Report",
      body: "Your child's results are ready.",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toContain("resend-mock-");
  });

  test("sendBatchEmails dispatches batch of emails", async () => {
    const batch = [
      { to: "g1@example.com", subject: "Notice 1", body: "Body 1" },
      { to: "g2@example.com", subject: "Notice 2", body: "Body 2" },
    ];

    const res = await sendBatchEmails(batch);
    expect(res.success).toBe(true);
    expect(res.sentCount).toBe(2);
    expect(res.errors).toEqual([]);
  });
});

test.describe("Unified Notification Dispatcher", () => {
  test("routes EMAIL channel to email gateway", async () => {
    const res = await defaultNotificationDispatcher({
      dispatchId: "disp-1",
      tenantId: "tenant-1",
      channel: NotificationChannel.EMAIL,
      recipientAddress: "test@example.com",
      subject: "Important Notice",
      body: "Email message body",
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toContain("resend-mock-");
  });

  test("routes SMS channel to Termii SMS gateway", async () => {
    const res = await defaultNotificationDispatcher({
      dispatchId: "disp-2",
      tenantId: "tenant-1",
      channel: NotificationChannel.SMS,
      recipientAddress: "08033334444",
      body: "SMS text",
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toContain("termii-mock-");
  });

  test("routes WHATSAPP channel to Termii WhatsApp gateway", async () => {
    const res = await defaultNotificationDispatcher({
      dispatchId: "disp-3",
      tenantId: "tenant-1",
      channel: NotificationChannel.WHATSAPP,
      recipientAddress: "08055556666",
      body: "WhatsApp formatted text",
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toContain("termii-mock-");
  });

  test("routes IN_APP channel directly", async () => {
    const res = await defaultNotificationDispatcher({
      dispatchId: "disp-4",
      tenantId: "tenant-1",
      channel: NotificationChannel.IN_APP,
      recipientAddress: "user-123",
      recipientUserId: "user-123",
      body: "In-app feed alert",
    });

    expect(res.success).toBe(true);
    expect(res.externalId).toBe("inapp-disp-4");
  });
});
