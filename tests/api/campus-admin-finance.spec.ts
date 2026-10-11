import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
  Role,
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

// A campus administrator and FINANCE over real HTTP (plan C1-C4, ADR 0016, slice B3): they see the invoices of THEIR campus's students and record a
// manual payment on them; they do not generate invoices, configure fee structures, give discounts or pay online. An invoice of another campus's
// student - or of a student with no campus - is "no such invoice" (a 404 identical to an unknown id): money records are not "visible but
// off-limits" the way a school-wide class is. An ADMIN is unchanged.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let admin: TestUser;
let campusAdmin: TestUser; // CAMPUS_ADMIN of North
let parent: TestUser; // parent of the North pupil only
let teacher: TestUser;
const cookie: Record<string, string> = {};
let north: string;
let south: string;
let periodId: string;

const finance = () => `/api/v1/schools/${a.code}/finance`;
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

/// A student of `campusId` with an unpaid invoice of 10 000 for the shared period.
async function invoiced(campusId: string | null) {
  const student = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Pupil"),
      lastName: "Fees",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("FN/"),
    },
  });
  const invoice = await db.invoice.create({
    data: { tenantId: a.id, studentId: student.id, periodId, invoiceNo: uniq("INV-"), totalAmount: 10000, lineItems: [] },
  });
  return { student, invoice };
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Campus Finance School", campuses: ["North", "South"] });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  [admin, campusAdmin, parent, teacher] = await Promise.all(
    ["Ada Admin", "Cam Campusadmin", "Pat Parent", "Tola Teacher"].map((name) => createUser({ name })),
  );
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(campusAdmin.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(parent.id, a.id, Role.PARENT);
  await addMembership(teacher.id, a.id, Role.TEACHING_STAFF, north);
  for (const [who, user] of Object.entries({ admin, campusAdmin, parent, teacher })) cookie[who] = await cookieFor(user);

  const session = await db.academicSession.create({
    data: { tenantId: a.id, campusId: null, label: "2041", startDate: new Date("2041-09-01"), endDate: new Date("2042-07-01") },
  });
  periodId = (
    await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId: session.id,
        kind: "TERM",
        ordinal: 1,
        label: "First term",
        startDate: new Date("2041-09-02"),
        endDate: new Date("2041-12-20"),
      },
    })
  ).id;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("reading invoices", () => {
  test("the list holds the campus administrator's own campus's invoices and no one else's - not another campus's, not a student with no campus", async () => {
    const [mine, theirs, wide] = [await invoiced(north), await invoiced(south), await invoiced(null)];
    const res = await api(`${finance()}/invoices?pageSize=100`, as("campusAdmin"));
    expect(res.status).toBe(200);
    const ids = (res.json.data.items as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(mine.invoice.id);
    expect(ids).not.toContain(theirs.invoice.id);
    expect(ids).not.toContain(wide.invoice.id);
    const all = ((await api(`${finance()}/invoices?pageSize=100`, as("admin"))).json.data.items as { id: string }[]).map((i) => i.id);
    expect(all).toEqual(expect.arrayContaining([mine.invoice.id, theirs.invoice.id, wide.invoice.id])); // an ADMIN is unchanged
    // naming another campus's student in the filter does not get round it
    const named = await api(`${finance()}/invoices?studentId=${theirs.student.id}`, as("campusAdmin"));
    expect([named.status, named.json.data.items]).toEqual([200, []]);
  });

  test("one invoice: own campus is readable; another campus, no campus, or an unknown id are the same 404", async () => {
    const [mine, theirs, wide] = [await invoiced(north), await invoiced(south), await invoiced(null)];
    expect((await api(`${finance()}/invoices/${mine.invoice.id}`, as("campusAdmin"))).status).toBe(200);
    const unknown = await api(`${finance()}/invoices/no-such-invoice`, as("campusAdmin"));
    expect(unknown.status).toBe(404);
    for (const row of [theirs, wide]) {
      const res = await api(`${finance()}/invoices/${row.invoice.id}`, as("campusAdmin"));
      expect([res.status, res.json.error.code]).toEqual([404, unknown.json.error.code]);
    }
  });

  test("a parent still sees only their own child's invoice (and a teacher is not given the school's invoices by this change)", async () => {
    const [kid, other] = [await invoiced(north), await invoiced(north)];
    const guardian = await db.guardianRecord.create({ data: { tenantId: a.id, userId: parent.id, firstName: "Pat", lastName: "Parent" } });
    await db.guardianLink.create({
      data: { tenantId: a.id, studentId: kid.student.id, guardianId: guardian.id, relationship: "MOTHER", status: "APPROVED", isPrimary: true },
    });
    expect((await api(`${finance()}/invoices/${kid.invoice.id}`, as("parent"))).status).toBe(200);
    expect((await api(`${finance()}/invoices/${other.invoice.id}`, as("parent"))).status).toBe(404);
    const list = await api(`${finance()}/invoices?pageSize=100`, as("parent"));
    const ids = (list.json.data.items as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(kid.invoice.id);
    expect(ids, "a parent's list must not hold another family's invoice").not.toContain(other.invoice.id);
  });
});

test.describe("recording money", () => {
  const pay = (invoiceId: string, who = "campusAdmin", amount = 2500) =>
    api(`${finance()}/invoices/${invoiceId}/manual-payment`, as(who, { method: "POST", body: { amount, channel: "cash" } }));

  test("a campus administrator records a manual payment on their own campus's invoice, and the invoice moves", async () => {
    const mine = await invoiced(north);
    const res = await pay(mine.invoice.id);
    expect(res.status).toBe(201);
    const row = await db.invoice.findUniqueOrThrow({ where: { id: mine.invoice.id } });
    expect([Number(row.amountPaid), row.status]).toEqual([2500, "PARTIALLY_PAID"]);
    expect(await db.payment.count({ where: { invoiceId: mine.invoice.id, status: "SUCCESS" } })).toBe(1);
  });

  test("another campus's invoice, a student with no campus, and an unknown id are the same 404; nothing is written", async () => {
    const [theirs, wide] = [await invoiced(south), await invoiced(null)];
    const unknown = await pay("no-such-invoice");
    expect(unknown.status).toBe(404);
    for (const row of [theirs, wide]) {
      const res = await pay(row.invoice.id);
      expect([res.status, res.json.error.code]).toEqual([404, unknown.json.error.code]);
      expect(await db.payment.count({ where: { invoiceId: row.invoice.id } })).toBe(0);
      expect(Number((await db.invoice.findUniqueOrThrow({ where: { id: row.invoice.id } })).amountPaid)).toBe(0);
    }
    expect((await pay(theirs.invoice.id, "admin")).status).toBe(201); // an ADMIN is unchanged
  });

  test("a teacher and a parent still cannot record a payment", async () => {
    const mine = await invoiced(north);
    for (const who of ["teacher", "parent"]) expect((await pay(mine.invoice.id, who)).status, who).toBe(403);
  });
});

test.describe("what stays with the school administrator", () => {
  test("generating invoices, fee structures, discounts and online payment are refused to a campus administrator", async () => {
    const mine = await invoiced(north);
    const refused: [string, string, object?][] = [
      ["POST", `/invoices`, { periodId }],
      ["POST", `/fee-structures`, { periodId, name: "Hacked levy", amount: 100 }],
      ["GET", `/fee-structures?periodId=${periodId}`],
      ["POST", `/invoices/${mine.invoice.id}/discount`, { amount: 100, reason: "Hacked" }],
      ["POST", `/invoices/${mine.invoice.id}/pay`, {}],
    ];
    for (const [method, path, body] of refused) {
      const res = await api(`${finance()}${path}`, as("campusAdmin", { method, body }));
      expect([res.status, method, path], path).toEqual([403, method, path]);
    }
    expect(await db.feeStructure.count({ where: { tenantId: a.id, name: "Hacked levy" } })).toBe(0);
    expect(await db.invoiceDiscount.count({ where: { invoiceId: mine.invoice.id } })).toBe(0);
  });
});
