import "../support/env";
import { test, expect } from "@playwright/test";
import { InvoiceStatus, Role } from "@prisma/client";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { mockPaystack } from "@/lib/finance/mock-paystack";
import { fulfillPayment, initializePayment, recordManualPayment } from "@/lib/finance/service";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// Receipt numbers (plan "Fix design - Phase 1 review findings", F1): per-school, per-year counter taken under the row lock in the
// fulfilment transaction; a unique index per school; a supplied receipt number must be unique.

let school: TestTenant;
let other: TestTenant;
let parent: { id: string; email: string };
let admin: { id: string };
let counter = 0;

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Receipt Academy" });
  other = await createTenant({ name: "Other Receipts" });
  parent = await createUser({ name: "Receipt Parent" });
  admin = await createUser({ name: "Receipt Bursar" });
  await addMembership(parent.id, school.id, Role.PARENT);
  await addMembership(admin.id, school.id, Role.ADMIN);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

async function invoiceIn(tenant: TestTenant, total = 10000) {
  const session = await db.academicSession.create({
    data: {
      tenantId: tenant.id,
      label: `R${++counter}-${Date.now()}`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "PLANNED",
    },
  });
  const period = await db.academicPeriod.create({
    data: {
      tenantId: tenant.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "Term 1",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
    },
  });
  const student = await db.studentRecord.create({
    data: {
      tenantId: tenant.id,
      firstName: "Rita",
      lastName: "Receipt",
      admissionNo: `RC-${Date.now()}-${++counter}`,
      dateOfBirth: new Date("2012-01-01"),
    },
  });
  return db.invoice.create({
    data: {
      tenantId: tenant.id,
      studentId: student.id,
      periodId: period.id,
      invoiceNo: `INV-RC-${Date.now()}-${++counter}`,
      totalAmount: total,
      amountPaid: 0,
      status: InvoiceStatus.UNPAID,
    },
  });
}

test.describe("receipt numbers", () => {
  test("25 concurrent fulfilments in one school get 25 DIFFERENT receipt numbers", async () => {
    const references: string[] = [];
    for (let i = 0; i < 25; i++) {
      const inv = await invoiceIn(school, 10000);
      const init = await initializePayment(trustedTenantId(school.id), inv.id, parent.email, 10000);
      mockPaystack.simulatePaymentCompletion(init.reference, "success", 1000000);
      references.push(init.reference);
    }

    const results = await Promise.allSettled(
      references.map((reference) => fulfillPayment(reference, { expectedAmountKobo: 1000000, tenantIdOverride: school.id })),
    );
    expect(results.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);

    const payments = await db.payment.findMany({
      where: { tenantId: school.id, providerRef: { in: references } },
      select: { receiptNo: true },
    });
    const numbers = payments.map((p) => p.receiptNo);
    expect(numbers.every(Boolean)).toBe(true);
    expect(new Set(numbers).size).toBe(25);
  });

  test("each school and each year counts for itself", async () => {
    const a = await invoiceIn(other, 5000);
    const init = await initializePayment(trustedTenantId(other.id), a.id, parent.email, 5000);
    mockPaystack.simulatePaymentCompletion(init.reference, "success", 500000);
    await fulfillPayment(init.reference, { expectedAmountKobo: 500000, tenantIdOverride: other.id });
    const payment = await db.payment.findFirstOrThrow({ where: { tenantId: other.id, providerRef: init.reference } });
    expect(payment.receiptNo).toMatch(/-0001$/); // the first receipt of the other school is 0001 whatever the first school has issued
  });

  test("a manual payment takes its number from the same counter, and a supplied number must be unused", async () => {
    const inv = await invoiceIn(school, 40000);
    const auto = await recordManualPayment(trustedTenantId(school.id), school.code, inv.id, { amount: 1000, channel: "cash" }, admin.id);
    const taken = await db.payment.count({ where: { tenantId: school.id, receiptNo: auto.receiptNo } });
    expect(taken).toBe(1);

    await expect(
      recordManualPayment(
        trustedTenantId(school.id),
        school.code,
        inv.id,
        { amount: 1000, channel: "cash", receiptNo: auto.receiptNo ?? "" },
        admin.id,
      ),
    ).rejects.toMatchObject({ name: "FinanceConflict" });

    const own = await recordManualPayment(
      trustedTenantId(school.id),
      school.code,
      inv.id,
      { amount: 1000, channel: "cash", receiptNo: "BOOK-7/0042" },
      admin.id,
    );
    expect(own.receiptNo).toBe("BOOK-7/0042");
  });

  test("the database refuses two payments of one school with the same receipt number (the index, not just the code)", async () => {
    const inv = await invoiceIn(school, 10000);
    const base = {
      tenantId: school.id,
      invoiceId: inv.id,
      amount: 10,
      provider: "PAYSTACK" as const,
      status: "SUCCESS" as const,
      receiptNo: `DUP-${Date.now()}`,
    };
    await db.payment.create({ data: { ...base, providerRef: `ref-a-${Date.now()}` } });
    await expect(db.payment.create({ data: { ...base, providerRef: `ref-b-${Date.now()}` } })).rejects.toThrow(
      /Unique constraint|duplicate key/i,
    );
    // another school may use the same number
    const inv2 = await invoiceIn(other, 10000);
    await db.payment.create({ data: { ...base, tenantId: other.id, invoiceId: inv2.id, providerRef: `ref-c-${Date.now()}` } });
  });
});
