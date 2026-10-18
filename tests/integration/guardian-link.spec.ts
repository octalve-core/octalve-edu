import "../support/env";
import { NotificationChannel } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { createGuardianLinkToken, verifyGuardianLinkToken, GUARDIAN_LINK_ACTIONS } from "@/lib/communication/guardian-link";

let tenantA: TestTenant;
let tenantB: TestTenant;
let studentAId: string;

const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));

test.beforeAll(async () => {
  await seedInstance();
  tenantA = await createTenant({ name: "Guardian Magic Link School A" });
  tenantB = await createTenant({ name: "Guardian Magic Link School B" });

  // Create a student in Tenant A
  const student = await asSchool(tenantA).transaction((tx) =>
    tx.studentRecord.create({
      data: {
        tenantId: tenantA.id,
        admissionNo: "ADM/2026/G01",
        firstName: "Maryam",
        lastName: "Aliyu",
        dateOfBirth: new Date("2012-05-10"),
      },
    }),
  );
  studentAId = student.id;
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("GuardianLinkToken Generation & Verification", () => {
  test("creates and verifies a magic link token successfully", async () => {
    const tokenResult = await createGuardianLinkToken({
      tenantId: tenantA.id,
      studentId: studentAId,
      channel: NotificationChannel.SMS,
      action: GUARDIAN_LINK_ACTIONS.VIEW_RESULTS,
      expiresInHours: 72,
    });

    expect(tokenResult.rawToken).toHaveLength(64);
    expect(tokenResult.tokenHash).toHaveLength(64);
    expect(tokenResult.urlPath).toBe(`/portal/g/${tokenResult.rawToken}`);
    expect(tokenResult.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Verify token without marking used
    const verifyRes = await verifyGuardianLinkToken(tenantA.id, tokenResult.rawToken, {
      markUsed: false,
    });

    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.tokenRecord?.studentId).toBe(studentAId);
    expect(verifyRes.tokenRecord?.action).toBe(GUARDIAN_LINK_ACTIONS.VIEW_RESULTS);
    expect(verifyRes.tokenRecord?.usedAt).toBeNull();
  });

  test("single-use token cannot be reused after markUsed is set", async () => {
    const tokenResult = await createGuardianLinkToken({
      tenantId: tenantA.id,
      studentId: studentAId,
      channel: NotificationChannel.WHATSAPP,
      action: GUARDIAN_LINK_ACTIONS.VIEW_ATTENDANCE,
    });

    // First use: mark as used
    const firstVerify = await verifyGuardianLinkToken(tenantA.id, tokenResult.rawToken, {
      markUsed: true,
    });
    expect(firstVerify.valid).toBe(true);

    // Second use: should be rejected
    const secondVerify = await verifyGuardianLinkToken(tenantA.id, tokenResult.rawToken);
    expect(secondVerify.valid).toBe(false);
    expect(secondVerify.error).toContain("already been used");
  });

  test("expired tokens are refused", async () => {
    // Create token expiring in the past (-1 hour)
    const tokenResult = await createGuardianLinkToken({
      tenantId: tenantA.id,
      studentId: studentAId,
      channel: NotificationChannel.EMAIL,
      action: GUARDIAN_LINK_ACTIONS.PAY_INVOICE,
      expiresInHours: -1,
    });

    const verifyRes = await verifyGuardianLinkToken(tenantA.id, tokenResult.rawToken);
    expect(verifyRes.valid).toBe(false);
    expect(verifyRes.error).toContain("expired");
  });

  test("tenant boundary: Tenant B cannot verify or discover Tenant A magic token", async () => {
    const tokenResult = await createGuardianLinkToken({
      tenantId: tenantA.id,
      studentId: studentAId,
      channel: NotificationChannel.SMS,
      action: GUARDIAN_LINK_ACTIONS.VIEW_NOTICE,
    });

    // Verification attempt under Tenant B
    const verifyUnderB = await verifyGuardianLinkToken(tenantB.id, tokenResult.rawToken);
    expect(verifyUnderB.valid).toBe(false);
    expect(verifyUnderB.error).toContain("Token not found");
  });
});
