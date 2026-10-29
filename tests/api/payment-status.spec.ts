import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role } from "@prisma/client";
import {
  addMembership,
  createTenant,
  createUser,
  db,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// ISS-0029: GET /finance/payments/[ref]/status confirms a payment with the gateway and fulfils it. Who may do that for which reference, and what an unknown or foreign
// reference shows, were not decided: any member of the school could confirm any reference of the school (a pupil or a teacher got the payment and invoice ids of another
// family's payment), and a reference of ANOTHER school answered 404 where an unknown one answered 400 (so it showed that the reference exists). The rule now: the member must be
// allowed to see the payment's invoice (finance staff all, a pupil or a guardian their own), and a reference that is unknown, another school's, or not theirs gets the one
// refusal of an unconfirmed payment, and the gateway is not asked.

const SAAS = { baseUrl: SAAS_URL };
const REFUSAL = { code: "REFUSED", message: "The payment could not be confirmed." };

let a: TestTenant;
let b: TestTenant;
const user: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let refA: string; // a fulfilled payment of pupil A's invoice, school A
let refB: string; // a fulfilled payment in school B
let pendingRef: string; // a payment of pupil A's invoice that the gateway has not confirmed

const statusRoute = (code: string, ref: string) => `/api/v1/schools/${code}/finance/payments/${ref}/status`;
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });

async function school(tenant: TestTenant, label: string) {
  const session = await db.academicSession.create({
    data: { tenantId: tenant.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: {
      tenantId: tenant.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { tenantId: tenant.id, name: "JSS 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId: tenant.id, classGroupId: group.id, name: "Emerald" } });
  const pupil = async (n: number, owner?: TestUser) => {
    const student = await db.studentRecord.create({
      data: {
        tenantId: tenant.id,
        firstName: `${label}${n}`,
        lastName: "Payer",
        dateOfBirth: new Date("2012-03-14"),
        admissionNo: `${label}/2026/00${n}`,
        userId: owner?.id ?? null,
      },
    });
    await db.studentEnrollment.create({
      data: { tenantId: tenant.id, sessionId: session.id, classArmId: arm.id, studentId: student.id, status: "ACTIVE" },
    });
    return student;
  };
  const invoiceFor = (studentId: string, n: number) =>
    db.invoice.create({
      data: {
        tenantId: tenant.id,
        studentId,
        periodId: period.id,
        invoiceNo: `INV-${label}-2026-000${n}`,
        totalAmount: 40000,
        amountPaid: 0,
        status: "UNPAID",
      },
    });
  const guardian = async (studentId: string, parent: TestUser, n: number) => {
    const record = await db.guardianRecord.create({
      data: { tenantId: tenant.id, userId: parent.id, firstName: `Parent${n}`, lastName: "Payer" },
    });
    await db.guardianLink.create({
      data: { tenantId: tenant.id, studentId, guardianId: record.id, relationship: "MOTHER", status: "APPROVED", isPrimary: true },
    });
  };
  return { pupil, invoiceFor, guardian };
}

/// Starts a payment as `who` and has the gateway confirm it through the signed webhook (the mock gateway learns the reference from it), so the payment is fulfilled.
async function payAndConfirm(tenant: TestTenant, who: string, invoiceId: string, amount: number) {
  const init = await api(`/api/v1/schools/${tenant.code}/finance/invoices/${invoiceId}/pay`, {
    ...as(who),
    method: "POST",
    body: { amount },
  });
  expect(init.status, init.text.slice(0, 200)).toBe(200);
  const ref = init.json.data.reference as string;
  const raw = JSON.stringify({
    event: "charge.success",
    data: {
      id: Math.floor(Math.random() * 1e9),
      reference: ref,
      amount: amount * 100,
      status: "success",
      channel: "card",
      paid_at: new Date().toISOString(),
      metadata: { tenantId: tenant.id },
    },
  });
  const signature = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "mock_sk_test_octalve_secret")
    .update(raw)
    .digest("hex");
  const hook = await api("/api/v1/webhooks/paystack", {
    ...SAAS,
    method: "POST",
    origin: null,
    headers: { "x-paystack-signature": signature, "content-type": "application/json" },
    rawBody: raw,
  });
  expect(hook.status, hook.text.slice(0, 200)).toBe(200);
  return ref;
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Status Academy" });
  b = await createTenant({ name: "Other Status School" });
  for (const who of ["adminA", "parentA", "parentOther", "pupilOther", "teacherA", "adminB", "parentB"])
    user[who] = await createUser({ name: who });
  await addMembership(user.adminA.id, a.id, Role.ADMIN);
  await addMembership(user.parentA.id, a.id, Role.PARENT);
  await addMembership(user.parentOther.id, a.id, Role.PARENT);
  await addMembership(user.pupilOther.id, a.id, Role.STUDENT);
  await addMembership(user.teacherA.id, a.id, Role.TEACHING_STAFF);
  await addMembership(user.adminB.id, b.id, Role.ADMIN);
  await addMembership(user.parentB.id, b.id, Role.PARENT);
  for (const who of Object.keys(user)) {
    const res = await loginAs(user[who], SAAS);
    expect(res.status).toBe(200);
    cookie[who] = cookieHeader(res.token!);
  }

  const sa = await school(a, "PSA");
  const pupilA = await sa.pupil(1);
  const pupilOther = await sa.pupil(2, user.pupilOther);
  await sa.guardian(pupilA.id, user.parentA, 1);
  await sa.guardian(pupilOther.id, user.parentOther, 2);
  const invoiceA = await sa.invoiceFor(pupilA.id, 1);
  refA = await payAndConfirm(a, "parentA", invoiceA.id, 15000);

  const sb = await school(b, "PSB");
  const pupilB = await sb.pupil(1);
  await sb.guardian(pupilB.id, user.parentB, 1);
  const invoiceB = await sb.invoiceFor(pupilB.id, 1);
  refB = await payAndConfirm(b, "parentB", invoiceB.id, 15000);

  // a second, unconfirmed payment of pupil A's invoice: started, never paid at the gateway
  const init = await api(`/api/v1/schools/${a.code}/finance/invoices/${invoiceA.id}/pay`, {
    ...as("parentA"),
    method: "POST",
    body: { amount: 5000 },
  });
  expect(init.status, init.text.slice(0, 200)).toBe(200);
  pendingRef = init.json.data.reference;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const expectRefused = (res: Awaited<ReturnType<typeof api>>, what: string) => {
  expect(res.status, `${what}: ${res.text.slice(0, 200)}`).toBe(400);
  expect(res.json.error, what).toMatchObject(REFUSAL);
  // a refusal shows nothing about the payment: no ids, no invoice
  expect(res.json.data, what).toBeNull();
};

test.describe("who may confirm which payment reference", () => {
  test("the guardian of the pupil, and the school's administrator, get the payment's state", async () => {
    for (const who of ["parentA", "adminA"]) {
      const res = await api(statusRoute(a.code, refA), as(who));
      expect(res.status, `${who}: ${res.text.slice(0, 200)}`).toBe(200);
      expect(res.json.data).toMatchObject({ success: true, alreadyFulfilled: true });
      expect(res.json.data.paymentId).toBeTruthy();
      expect(res.json.data.invoiceId).toBeTruthy();
    }
  });

  test("another family's guardian, another pupil and a teacher get the one refusal of an unconfirmed payment, and no ids", async () => {
    for (const who of ["parentOther", "pupilOther", "teacherA"]) expectRefused(await api(statusRoute(a.code, refA), as(who)), who);
  });

  test("a reference of ANOTHER school is the same refusal as an unknown one (it is not shown to exist)", async () => {
    const foreign = await api(statusRoute(a.code, refB), as("adminA"));
    expectRefused(foreign, "another school's reference, asked by this school's administrator");
    const unknown = await api(statusRoute(a.code, "oct_pay_0_unknown"), as("adminA"));
    expectRefused(unknown, "an unknown reference");
    expect(foreign.json).toEqual(unknown.json);
  });

  test("control: a payment the gateway has not confirmed is refused for its own guardian too, and stays pending", async () => {
    const res = await api(statusRoute(a.code, pendingRef), as("parentA"));
    expectRefused(res, "an unconfirmed payment");
    expect(await db.payment.findFirst({ where: { providerRef: pendingRef } })).toMatchObject({ status: "PENDING" });
  });
});
