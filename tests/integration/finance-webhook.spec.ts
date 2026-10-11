import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { InvoiceStatus, Role } from "@prisma/client";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { mockPaystack } from "@/lib/finance/mock-paystack";
import { MOCK_PAYSTACK_SECRET } from "@/lib/finance/paystack";
import { initializePayment, processPaystackWebhook } from "@/lib/finance/service";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// Webhook behaviour in-process (plan "Fix design - Phase 1 review findings", F2 and F3): an unsigned delivery writes nothing, the same body is
// the same event, a transient failure asks for a retry and the retry fulfils exactly once, a deliberate refusal is recorded and not retried.

const SECRET = process.env.PAYSTACK_SECRET_KEY || MOCK_PAYSTACK_SECRET;
const sign = (body: string) => crypto.createHmac("sha512", SECRET).update(body).digest("hex");
let counter = 0;

let school: TestTenant;
let payer: { email: string };

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Webhook Academy" });
  const parent = await createUser({ name: "Payer Parent" });
  await addMembership(parent.id, school.id, Role.PARENT);
  payer = parent;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

async function invoice(total = 50000) {
  const session = await db.academicSession.create({
    data: {
      tenantId: school.id,
      label: `S${++counter}-${Date.now()}`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "PLANNED",
    },
  });
  const period = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
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
      tenantId: school.id,
      firstName: "Ada",
      lastName: "Webhook",
      admissionNo: `WH-${Date.now()}-${++counter}`,
      dateOfBirth: new Date("2012-01-01"),
    },
  });
  return db.invoice.create({
    data: {
      tenantId: school.id,
      studentId: student.id,
      periodId: period.id,
      invoiceNo: `INV-WH-${Date.now()}-${++counter}`,
      totalAmount: total,
      amountPaid: 0,
      status: InvoiceStatus.UNPAID,
    },
  });
}

const chargeBody = (reference: string, amount: number, id = Date.now() + ++counter) =>
  JSON.stringify({ event: "charge.success", data: { id, reference, amount, status: "success", metadata: { tenantId: school.id } } });

test.describe("Paystack webhook service", () => {
  test("an unsigned or wrongly signed delivery writes nothing", async () => {
    const body = chargeBody("oct_pay_unsigned_x", 1000, 777000111);
    const before = await db.paymentWebhookEvent.count();

    expect((await processPaystackWebhook(body, "deadbeef", SECRET)).status).toBe("invalid_signature");
    expect((await processPaystackWebhook(body, null, SECRET)).status).toBe("invalid_signature");
    expect((await processPaystackWebhook(body, sign(body), "some-other-secret")).status).toBe("invalid_signature");

    expect(await db.paymentWebhookEvent.count()).toBe(before);
  });

  test("a delivery that names no id is identified by its content, never by the clock", async () => {
    const body = JSON.stringify({ event: "ping", data: {} });
    const first = await processPaystackWebhook(body, sign(body), SECRET);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await processPaystackWebhook(body, sign(body), SECRET);

    expect(first.eventId).toMatch(/^sha256:[0-9a-f]{32}$/);
    expect(second.eventId).toBe(first.eventId);
    expect(await db.paymentWebhookEvent.count({ where: { eventId: first.eventId } })).toBe(1);
  });

  test("a transient failure asks for a retry, keeps the event unprocessed, and the retry fulfils exactly once", async () => {
    const inv = await invoice(50000);
    const init = await initializePayment(trustedTenantId(school.id), inv.id, payer.email, 50000);
    const body = chargeBody(init.reference, 5000000, 880000222);

    const original = mockPaystack.verifyTransaction.bind(mockPaystack);
    let failures = 1;
    mockPaystack.verifyTransaction = async (ref: string) => {
      if (failures-- > 0) throw new Error("connect ETIMEDOUT paystack");
      return original(ref);
    };
    try {
      const first = await processPaystackWebhook(body, sign(body), SECRET);
      expect(first.status).toBe("retry");
      const row = await db.paymentWebhookEvent.findFirstOrThrow({ where: { eventId: "880000222" } });
      expect(row.processedAt).toBeNull();
      expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaid)).toBe(0);

      const retry = await processPaystackWebhook(body, sign(body), SECRET);
      expect(retry.status).toBe("processed");
      const paid = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(paid.status).toBe(InvoiceStatus.PAID);
      expect(Number(paid.amountPaid)).toBe(50000);

      const third = await processPaystackWebhook(body, sign(body), SECRET);
      expect(third).toMatchObject({ status: "processed", duplicate: true });
      expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaid)).toBe(50000); // not credited twice
    } finally {
      mockPaystack.verifyTransaction = original;
    }
  });

  test("a deliberate refusal (amount mismatch) is recorded on the event and is NOT a retry", async () => {
    const inv = await invoice(50000);
    const init = await initializePayment(trustedTenantId(school.id), inv.id, payer.email, 50000);
    mockPaystack.simulatePaymentCompletion(init.reference, "success", 1000);
    const body = chargeBody(init.reference, 1000, 990000333);

    const result = await processPaystackWebhook(body, sign(body), SECRET);

    expect(result.status).toBe("refused");
    expect("error" in result && result.error).toMatch(/Amount mismatch/i);
    const row = await db.paymentWebhookEvent.findFirstOrThrow({ where: { eventId: "990000333" } });
    expect(row.error).toMatch(/Amount mismatch/i);
    expect(row.processedAt).toBeNull();
    expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amountPaid)).toBe(0);
  });
});
