import "../support/env";
import { test, expect } from "@playwright/test";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { generateInvoicesForPeriod } from "@/lib/finance/service";

// ISS-0030: invoice numbers were taken from a count of the school's invoices, so two bill runs at the same moment took the same number and one of them failed on the unique
// index (or, with the index gone, two invoices would carry one number). A bill run now takes the school's invoice-number lock first and takes the next number that is free.
//
// One school, two terms of one session, six pupils in one class, a fee for each term.

let school: TestTenant;
let term1: { id: string };
let term2: { id: string };
const STUDENTS = 6;
const year = new Date().getFullYear();

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Numbering Academy" });
  const tenantId = school.id;

  const session = await db.academicSession.create({
    data: { tenantId, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = (ordinal: number) =>
    db.academicPeriod.create({
      data: {
        tenantId,
        sessionId: session.id,
        kind: "TERM",
        ordinal,
        label: `Term ${ordinal}`,
        startDate: new Date(ordinal === 1 ? "2026-09-01" : "2027-01-10"),
        endDate: new Date(ordinal === 1 ? "2026-12-15" : "2027-04-01"),
        isCurrent: ordinal === 1,
      },
    });
  term1 = await period(1);
  term2 = await period(2);

  const group = await db.classGroup.create({ data: { tenantId, name: "JSS 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId, classGroupId: group.id, name: "Emerald" } });
  for (let n = 1; n <= STUDENTS; n++) {
    const student = await db.studentRecord.create({
      data: { tenantId, firstName: `Pupil${n}`, lastName: "Numbered", dateOfBirth: new Date("2012-03-14"), admissionNo: `NUM/2026/00${n}` },
    });
    await db.studentEnrollment.create({
      data: { tenantId, sessionId: session.id, classArmId: arm.id, studentId: student.id, status: "ACTIVE" },
    });
  }
  for (const periodId of [term1.id, term2.id]) {
    await db.feeStructure.create({ data: { tenantId, periodId, name: "Tuition", amount: 50000 } });
  }
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeEach(async () => {
  await db.invoice.deleteMany({ where: { tenantId: school.id } });
});

const bill = (periodId: string) => generateInvoicesForPeriod(trustedTenantId(school.id), school.code, periodId);
const numbersHeld = async () =>
  (await db.invoice.findMany({ where: { tenantId: school.id }, select: { invoiceNo: true }, orderBy: { invoiceNo: "asc" } })).map(
    (i) => i.invoiceNo,
  );
const numberAt = (seq: number) => `INV-${school.code.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${year}-${String(seq).padStart(4, "0")}`;

test("two bill runs for different terms at the same moment both succeed, and every invoice has its own number", async () => {
  const runs = await Promise.allSettled([bill(term1.id), bill(term2.id)]);
  expect(
    runs.map((r) => (r.status === "fulfilled" ? r.value : String((r as PromiseRejectedResult).reason))),
    "neither run may fail",
  ).toEqual([
    { created: STUDENTS, skipped: 0 },
    { created: STUDENTS, skipped: 0 },
  ]);

  const held = await numbersHeld();
  expect(held).toHaveLength(STUDENTS * 2);
  expect(new Set(held).size, "no number is used twice").toBe(STUDENTS * 2);
  expect(held, "and they run on without a gap").toEqual(Array.from({ length: STUDENTS * 2 }, (_, i) => numberAt(i + 1)));
});

test("two bill runs for the same term at the same moment: one bills the pupils, the other finds them already billed", async () => {
  const runs = await Promise.allSettled([bill(term1.id), bill(term1.id)]);
  expect(
    runs.every((r) => r.status === "fulfilled"),
    "neither run may fail",
  ).toBe(true);
  const results = runs.map((r) => (r as PromiseFulfilledResult<{ created: number; skipped: number }>).value);
  expect(results.reduce((n, r) => n + r.created, 0)).toBe(STUDENTS);
  expect(results.reduce((n, r) => n + r.skipped, 0)).toBe(STUDENTS);

  expect(await numbersHeld()).toEqual(Array.from({ length: STUDENTS }, (_, i) => numberAt(i + 1)));
});

test("a number that is already used (typed by hand, or left by an invoice that was removed) is skipped, not an error", async () => {
  // One invoice that holds the third number: with it in the school the count says 1, so the first new invoice takes 2, the next would take 3 and must pass over it.
  const first = await db.studentRecord.findFirstOrThrow({ where: { tenantId: school.id }, select: { id: true } });
  await db.invoice.create({
    data: {
      tenantId: school.id,
      studentId: first.id,
      periodId: term2.id,
      invoiceNo: numberAt(3),
      totalAmount: 1,
      amountPaid: 0,
      status: "UNPAID",
    },
  });

  const result = await bill(term1.id);
  expect(result.created).toBe(STUDENTS);

  const held = await numbersHeld();
  expect(new Set(held).size).toBe(STUDENTS + 1);
  expect(held).toEqual([2, 3, 4, 5, 6, 7, 8].map(numberAt));
});
