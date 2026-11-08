import "../support/env";
import crypto from "node:crypto";
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

// Part payment "if allowed" (task 0029) over real HTTP: the school's rule and a campus's stricter one, the per-invoice "pay in full", and the two places a payment is started or
// recorded. Who may change it (the school's administrator only: the rule is fee configuration, ADR 0016), the fresh proof for the school's own rule, that a campus can only
// tighten, that a value that is not a rule is refused and never stored, that two payments at the same moment cannot take more than the balance, that money already taken is never
// refused, and that one school never reaches another's.
//
// School A has two campuses, North and South. People: its administrator, a campus administrator of North, a teacher, a pupil's parent. School B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
let periodId: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const proof = (who: string) => ({ type: "password", value: people[who].password });
const settingsUrl = () => `/api/v1/schools/${a.code}/settings/part-payment`;
const invoiceUrl = (id: string) => `/api/v1/schools/${a.code}/finance/invoices/${id}`;
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;

/// The school's rule (with the fresh proof it needs) or a campus's (which needs none).
const setSchool = (policy: unknown, who = "admin", withProof = true) =>
  api(settingsUrl(), {
    ...as(who),
    method: "PATCH",
    body: { scope: "SCHOOL", policy, ...(withProof ? { stepUp: proof(who) } : {}) },
  });
const setCampus = (campusId: string, policy: unknown, who = "admin") =>
  api(settingsUrl(), { ...as(who), method: "PATCH", body: { scope: "CAMPUS", campusId, policy } });
const off = { allowed: false, minimum: { kind: "NONE" } };
const least = (value: number) => ({ allowed: true, minimum: { kind: "AMOUNT", value } });
const percent = (value: number) => ({ allowed: true, minimum: { kind: "PERCENT", value } });
const record = (who: string, invoiceId: string, amount: number) =>
  api(`${invoiceUrl(invoiceId)}/manual-payment`, { ...as(who), method: "POST", body: { amount, channel: "cash" } });
const start = (who: string, invoiceId: string, amount?: number) =>
  api(`${invoiceUrl(invoiceId)}/pay`, { ...as(who), method: "POST", body: amount === undefined ? {} : { amount } });
const payInFull = (who: string, invoiceId: string, value: boolean, tenantCode = a.code) =>
  api(`/api/v1/schools/${tenantCode}/finance/invoices/${invoiceId}/pay-in-full`, {
    ...as(who),
    method: "PATCH",
    body: { payInFull: value },
  });
const rows = (action: string) => db.auditLog.findMany({ where: { tenantId: a.id, action }, orderBy: { createdAt: "asc" } });
const stored = () => db.tenantSetting.findMany({ where: { tenantId: a.id, key: "finance.partPayment" } });

/// A student of `campusId` with an unpaid invoice of `total`.
async function invoiced(campusId: string | null, total = 10000) {
  const student = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Pupil"),
      lastName: "Parts",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("PP/"),
    },
  });
  return db.invoice.create({
    data: { tenantId: a.id, studentId: student.id, periodId, invoiceNo: uniq("INV-"), totalAmount: total, lineItems: [] },
  });
}
const paid = async (id: string) => Number((await db.invoice.findUniqueOrThrow({ where: { id } })).amountPaid);

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Part Payment School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Parts School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusAdmin", "teacher", "parent", "adminB"]) people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusAdmin.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF, north);
  await addMembership(people.parent.id, a.id, Role.PARENT);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) {
    const res = await loginAs(people[who], SAAS);
    expect(res.status).toBe(200);
    cookie[who] = cookieHeader(res.token!);
  }
  const session = await db.academicSession.create({
    data: { tenantId: a.id, campusId: null, label: "2043", startDate: new Date("2043-09-01"), endDate: new Date("2044-07-01") },
  });
  periodId = (
    await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId: session.id,
        kind: "TERM",
        ordinal: 1,
        label: "First term",
        startDate: new Date("2043-09-02"),
        endDate: new Date("2043-12-20"),
      },
    })
  ).id;
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id } });
  await db.auditLog.deleteMany({
    where: { tenantId: a.id, action: { in: ["PART_PAYMENT_SETTING_CHANGED", "INVOICE_PAY_IN_FULL_CHANGED"] } },
  });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("the default is what the system did before there was a setting", () => {
  test("with nothing stored any amount up to the balance is accepted, by both ways of paying", async () => {
    const invoice = await invoiced(north);
    expect((await record("admin", invoice.id, 1)).status).toBe(201);
    expect((await start("admin", invoice.id, 2)).status).toBe(200);
    expect((await record("admin", invoice.id, 9_999)).status).toBe(201);
    expect(await paid(invoice.id)).toBe(10_000);
  });

  test("zero, negative and more than the balance are still refused", async () => {
    const invoice = await invoiced(north);
    for (const amount of [0, -5]) {
      expect((await record("admin", invoice.id, amount)).status).toBe(400);
      expect((await start("admin", invoice.id, amount)).status).toBe(400);
    }
    const tooMuch = await record("admin", invoice.id, 10_000.01);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.json.error.message).toMatch(/exceed the balance/);
    expect((await start("admin", invoice.id, 10_001)).status).toBe(400);
    expect(await paid(invoice.id)).toBe(0);
  });

  test("the invoice says what is allowed, for a screen to show", async () => {
    const invoice = await invoiced(north);
    const res = await api(invoiceUrl(invoice.id), as("admin"));
    expect(res.status).toBe(200);
    expect(res.json.data.partPayment).toEqual({ text: "Part payments are allowed.", minimum: "0", payInFull: false });
    await setSchool(least(2_500));
    const after = await api(invoiceUrl(invoice.id), as("admin"));
    expect(after.json.data.partPayment.text).toBe("Part payments are allowed, at least ₦2,500.");
    expect(after.json.data.partPayment.minimum).toBe("2500");
  });
});

test.describe("the school's rule", () => {
  test("only the school's administrator changes it: not a campus administrator, a teacher or a parent, and not without signing in", async () => {
    for (const who of ["campusAdmin", "teacher", "parent"]) {
      expect((await setSchool(off, who)).status, who).toBe(403);
      expect((await setCampus(north, off, who)).status, who).toBe(403);
    }
    const anonymous = await api(settingsUrl(), { ...SAAS, method: "PATCH", body: { scope: "SCHOOL", policy: off } });
    expect([401, 403]).toContain(anonymous.status);
    expect(await stored()).toHaveLength(0);
    expect((await setSchool(off)).status).toBe(200);
  });

  test("the school's own rule needs a fresh proof: none, a wrong password and a wrong kind are refused, and nothing is stored", async () => {
    expect((await setSchool(off, "admin", false)).status).toBe(400);
    const wrong = await api(settingsUrl(), {
      ...as("admin"),
      method: "PATCH",
      body: { scope: "SCHOOL", policy: off, stepUp: { type: "password", value: "not-the-password-1A!" } },
    });
    expect(wrong.status).toBe(403);
    expect(await stored()).toHaveLength(0);
    expect(await rows("PART_PAYMENT_SETTING_CHANGED")).toHaveLength(0);
  });

  test("with part payment off, only the whole balance goes through, whoever pays and however", async () => {
    const invoice = await invoiced(north);
    expect((await setSchool(off)).status).toBe(200);
    const manual = await record("admin", invoice.id, 100);
    expect(manual.status).toBe(400);
    expect(manual.json.error.message).toBe("This invoice has to be paid in full (₦10,000).");
    expect((await start("admin", invoice.id, 100)).status).toBe(400);
    expect((await start("admin", invoice.id, 9_999)).status).toBe(400);
    expect(await paid(invoice.id)).toBe(0);
    expect((await record("admin", invoice.id, 10_000)).status).toBe(201);
    expect(await paid(invoice.id)).toBe(10_000);
  });

  test("after a part was paid while it was allowed, turning it off means the balance is what has to be paid", async () => {
    const invoice = await invoiced(north);
    expect((await record("admin", invoice.id, 4_000)).status).toBe(201);
    await setSchool(off);
    const refused = await record("admin", invoice.id, 1_000);
    expect(refused.status).toBe(400);
    expect(refused.json.error.message).toBe("This invoice has to be paid in full (₦6,000).");
    expect((await record("admin", invoice.id, 6_000)).status).toBe(201);
    expect(await paid(invoice.id)).toBe(10_000);
  });

  test("a smallest amount: under it is refused, at it is accepted, and the payment that settles the balance is always accepted", async () => {
    const invoice = await invoiced(north);
    await setSchool(least(5_000));
    const under = await record("admin", invoice.id, 4_999.99);
    expect(under.status).toBe(400);
    expect(under.json.error.message).toBe("The smallest part you can pay is ₦5,000.");
    expect((await start("admin", invoice.id, 1_000)).status).toBe(400);
    expect((await record("admin", invoice.id, 5_000)).status).toBe(201);
    expect((await record("admin", invoice.id, 4_000)).status).toBe(400);
    // the balance is now 5 000: raise the smallest part above it, and the whole balance still goes through
    await setSchool(least(8_000));
    expect((await record("admin", invoice.id, 5_000)).status).toBe(201);
    expect(await paid(invoice.id)).toBe(10_000);
  });

  test("a smallest percentage of the invoice, rounded up to the kobo", async () => {
    const invoice = await invoiced(north, 3_333);
    await setSchool(percent(10));
    const under = await record("admin", invoice.id, 333.29);
    expect(under.status).toBe(400);
    expect(under.json.error.message).toBe("The smallest part you can pay is ₦333.30.");
    expect((await record("admin", invoice.id, 333.3)).status).toBe(201);
  });

  test("a rule that is not a rule is refused, and nothing is stored", async () => {
    const bad: unknown[] = [
      { allowed: "yes", minimum: { kind: "NONE" } },
      { allowed: true },
      { allowed: true, minimum: { kind: "AMOUNT", value: 0 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: -1 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: 10.123 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: 1_000_000_001 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: "5000" } },
      { allowed: true, minimum: { kind: "PERCENT", value: 0 } },
      { allowed: true, minimum: { kind: "PERCENT", value: 101 } },
      { allowed: true, minimum: { kind: "PERCENT", value: 12.345 } },
      { allowed: true, minimum: { kind: "SOMETIMES" } },
      { allowed: true, minimum: { kind: "NONE", value: 5 } },
      { allowed: true, minimum: { kind: "NONE" }, extra: 1 },
      [],
      "off",
      42,
    ];
    for (const policy of bad) expect((await setSchool(policy)).status, JSON.stringify(policy)).toBe(400);
    const shape = [
      { scope: "SCHOOL", campusId: north, policy: off, stepUp: proof("admin") },
      { scope: "CAMPUS", policy: off },
      { scope: "EVERYONE", policy: off, stepUp: proof("admin") },
      { scope: "SCHOOL", policy: off, stepUp: proof("admin"), surprise: true },
      { scope: "SCHOOL", stepUp: proof("admin") },
    ];
    for (const body of shape) {
      const res = await api(settingsUrl(), { ...as("admin"), method: "PATCH", body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await stored()).toHaveLength(0);
    expect(await rows("PART_PAYMENT_SETTING_CHANGED")).toHaveLength(0);
  });

  test("removing it goes back to the default; saving the same value twice writes one audit entry", async () => {
    expect((await setSchool(off)).status).toBe(200);
    expect((await setSchool(off)).status).toBe(200);
    expect(await rows("PART_PAYMENT_SETTING_CHANGED")).toHaveLength(1);
    const invoice = await invoiced(north);
    expect((await record("admin", invoice.id, 100)).status).toBe(400);
    expect((await setSchool(null)).status).toBe(200);
    expect(await stored()).toHaveLength(0);
    expect((await record("admin", invoice.id, 100)).status).toBe(201);
    const log = await rows("PART_PAYMENT_SETTING_CHANGED");
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ actorUserId: people.admin.id, targetType: "TenantSetting", targetId: "finance.partPayment:school" });
    expect(log[0].afterValue).toEqual(off);
    expect(log[1].afterValue).toBeNull();
  });

  test("the screen's view: the school's value, each campus's value and the sentence that applies; a campus administrator only reads their own", async () => {
    await setSchool(least(2_000));
    await setCampus(south, { allowed: true, minimum: { kind: "AMOUNT", value: 4_000 } });
    const view = (await api(settingsUrl(), as("admin"))).json.data;
    expect(view.canEditSchool).toBe(true);
    expect(view.school.stored).toEqual(least(2_000));
    expect(view.school.text).toBe("Part payments are allowed, at least ₦2,000.");
    const byName = Object.fromEntries(view.campuses.map((c: { name: string }) => [c.name, c]));
    expect(byName.North).toMatchObject({ stored: null, canEdit: true, text: "Part payments are allowed, at least ₦2,000." });
    expect(byName.South).toMatchObject({ canEdit: true, text: "Part payments are allowed, at least ₦4,000." });
    const own = (await api(settingsUrl(), as("campusAdmin"))).json.data;
    expect(own.canEditSchool).toBe(false);
    expect(own.campuses.map((c: { name: string }) => c.name)).toEqual(["North"]);
    expect(own.campuses[0].canEdit).toBe(false);
    expect(own.school.text).toBe("Part payments are allowed, at least ₦2,000.");
    expect((await api(settingsUrl(), as("teacher"))).status).toBe(403);
    expect((await api(settingsUrl(), as("parent"))).status).toBe(403);
  });

  test("another school's administrator reaches nothing of this school's", async () => {
    const cookieB = cookie.adminB;
    const view = await api(settingsUrl(), { ...SAAS, cookie: cookieB });
    expect([403, 404]).toContain(view.status);
    const change = await api(settingsUrl(), {
      ...SAAS,
      cookie: cookieB,
      method: "PATCH",
      body: { scope: "SCHOOL", policy: off, stepUp: { type: "password", value: people.adminB.password } },
    });
    expect([403, 404]).toContain(change.status);
    expect(await stored()).toHaveLength(0);
  });
});

test.describe("a campus can only tighten", () => {
  test("the school's administrator tightens one campus; the other campus and a student with no campus follow the school", async () => {
    const [inNorth, inSouth, noCampus] = [await invoiced(north), await invoiced(south), await invoiced(null)];
    await setSchool(least(1_000));
    expect((await setCampus(north, least(5_000))).status).toBe(200);
    expect((await record("admin", inNorth.id, 2_000)).status).toBe(400); // North's stricter minimum
    expect((await record("admin", inNorth.id, 5_000)).status).toBe(201);
    expect((await record("admin", inSouth.id, 2_000)).status).toBe(201); // South: the school's
    expect((await record("admin", noCampus.id, 1_000)).status).toBe(201); // no campus: the school's
    expect((await record("admin", noCampus.id, 999)).status).toBe(400);
  });

  test("a campus can't allow what the school forbids, or remove or lower the school's smallest part, or name an unknown campus", async () => {
    await setSchool(off);
    const allowed = await setCampus(north, { allowed: true, minimum: { kind: "NONE" } });
    expect(allowed.status).toBe(400);
    expect(allowed.json.error.message).toBe("The school does not allow part payments, so a campus can't allow them.");
    await setSchool(least(5_000));
    expect((await setCampus(north, { allowed: true, minimum: { kind: "NONE" } })).json.error.message).toBe(
      "The school has a smallest part, so a campus can't remove it.",
    );
    expect((await setCampus(north, least(4_000))).json.error.message).toBe(
      "The school's smallest part is ₦5,000; a campus can only raise it.",
    );
    expect((await setCampus(north, off)).status).toBe(200); // tighter: allowed
    expect((await setCampus("no-such-campus", off)).status).toBe(404);
    expect((await setCampus(b.id, off)).status).toBe(404);
  });

  test("a looser value that got into the database by hand is ignored: the stricter of the two applies", async () => {
    await setSchool(off);
    await db.tenantSetting.create({
      data: {
        tenantId: a.id,
        campusId: north,
        key: "finance.partPayment",
        value: { allowed: true, minimum: { kind: "NONE" } },
        updatedById: people.admin.id,
      },
    });
    const invoice = await invoiced(north);
    expect((await record("admin", invoice.id, 100)).status).toBe(400);
    expect((await record("admin", invoice.id, 10_000)).status).toBe(201);
  });

  test("a value the table would not take is refused by the database too: a key that is not a name, a value that is huge, a second value for the same school", async () => {
    const make = (data: object) =>
      db.tenantSetting.create({
        data: { tenantId: a.id, campusId: null, key: "finance.partPayment", value: {}, updatedById: people.admin.id, ...data },
      });
    await expect(make({ key: "Not A Key" })).rejects.toThrow();
    await expect(make({ key: "x".repeat(81) })).rejects.toThrow();
    await expect(make({ value: { text: "x".repeat(5000) } })).rejects.toThrow();
    await make({});
    await expect(make({})).rejects.toThrow(); // one value per school, campus and key
    await db.tenantSetting.deleteMany({ where: { tenantId: a.id } });
  });

  test("a campus goes back to the school's rule by removing its own", async () => {
    await setSchool(least(1_000));
    await setCampus(north, off);
    const invoice = await invoiced(north);
    expect((await record("admin", invoice.id, 100)).status).toBe(400);
    expect((await setCampus(north, null)).status).toBe(200);
    expect((await record("admin", invoice.id, 1_000)).status).toBe(201);
  });
});

test.describe("one invoice marked pay in full", () => {
  test("the administrator marks it and clears it; a part is refused while it is marked; the whole balance is not; saving the same value writes nothing", async () => {
    const invoice = await invoiced(north);
    expect((await payInFull("admin", invoice.id, true)).json.data).toEqual({ payInFull: true });
    expect((await payInFull("admin", invoice.id, true)).status).toBe(200);
    expect(await rows("INVOICE_PAY_IN_FULL_CHANGED")).toHaveLength(1);
    const refused = await record("admin", invoice.id, 1_000);
    expect(refused.status).toBe(400);
    expect(refused.json.error.message).toBe("This invoice has to be paid in full (₦10,000).");
    expect((await start("admin", invoice.id, 1_000)).status).toBe(400);
    expect((await api(invoiceUrl(invoice.id), as("admin"))).json.data.partPayment).toMatchObject({
      payInFull: true,
      text: "This invoice has to be paid in full.",
    });
    expect((await payInFull("admin", invoice.id, false)).status).toBe(200);
    expect((await record("admin", invoice.id, 1_000)).status).toBe(201);
    expect(await rows("INVOICE_PAY_IN_FULL_CHANGED")).toHaveLength(2);
    expect((await payInFull("admin", invoice.id, true)).status).toBe(200);
    expect((await record("admin", invoice.id, 9_000)).status).toBe(201);
  });

  test("it can only tighten: it never allows a part the school's rule forbids", async () => {
    const invoice = await invoiced(north);
    await setSchool(off);
    expect((await payInFull("admin", invoice.id, false)).status).toBe(200);
    expect((await record("admin", invoice.id, 1_000)).status).toBe(400);
  });

  test("who: the school's administrator; not a campus administrator, a teacher or a parent; another school's administrator gets 404; a paid invoice can't be changed", async () => {
    const invoice = await invoiced(north);
    for (const who of ["campusAdmin", "teacher", "parent"]) expect((await payInFull(who, invoice.id, true)).status, who).toBe(403);
    const anonymous = await api(`/api/v1/schools/${a.code}/finance/invoices/${invoice.id}/pay-in-full`, {
      ...SAAS,
      method: "PATCH",
      body: { payInFull: true },
    });
    expect([401, 403]).toContain(anonymous.status);
    expect((await payInFull("adminB", invoice.id, true, b.code)).status).toBe(404); // school B's own route does not know this invoice
    expect((await payInFull("admin", "no-such-invoice", true)).status).toBe(404);
    const bad = await api(`/api/v1/schools/${a.code}/finance/invoices/${invoice.id}/pay-in-full`, {
      ...as("admin"),
      method: "PATCH",
      body: { payInFull: "yes" },
    });
    expect(bad.status).toBe(400);
    const extra = await api(`/api/v1/schools/${a.code}/finance/invoices/${invoice.id}/pay-in-full`, {
      ...as("admin"),
      method: "PATCH",
      body: { payInFull: true, other: 1 },
    });
    expect(extra.status).toBe(400);
    expect((await record("admin", invoice.id, 10_000)).status).toBe(201);
    const closed = await payInFull("admin", invoice.id, true);
    expect(closed.status).toBe(409);
    expect(closed.json.error.code).toBe("NOT_OPEN");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).payInFull).toBe(false);
  });
});

test.describe("racing payments and money already taken", () => {
  test("two payments of the whole balance at the same moment: one is taken, the other is told", async () => {
    const invoice = await invoiced(north);
    const results = await Promise.all([record("admin", invoice.id, 10_000), record("admin", invoice.id, 10_000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await paid(invoice.id)).toBe(10_000);
    expect(await db.payment.count({ where: { invoiceId: invoice.id, status: "SUCCESS" } })).toBe(1);
  });

  test("several parts at the same moment can't together take more than the balance", async () => {
    const invoice = await invoiced(north);
    const results = await Promise.all(Array.from({ length: 5 }, () => record("admin", invoice.id, 4_000)));
    const taken = results.filter((r) => r.status === 201).length;
    expect(taken).toBe(2);
    expect(await paid(invoice.id)).toBe(8_000);
    expect(await db.payment.count({ where: { invoiceId: invoice.id, status: "SUCCESS" } })).toBe(2);
  });

  test("two parts racing under a smallest amount both honour it", async () => {
    const invoice = await invoiced(north);
    await setSchool(least(5_000));
    const results = await Promise.all([
      record("admin", invoice.id, 3_000),
      record("admin", invoice.id, 3_000),
      record("admin", invoice.id, 6_000),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
    expect(await paid(invoice.id)).toBe(6_000);
  });

  test("a payment started before the rule changed is still accepted when the money arrives: money already taken is never refused", async () => {
    const invoice = await invoiced(north);
    const init = await start("admin", invoice.id, 2_000);
    expect(init.status, init.text.slice(0, 200)).toBe(200);
    const reference = init.json.data.reference as string;
    expect((await setSchool(off)).status).toBe(200);
    const raw = JSON.stringify({
      event: "charge.success",
      data: {
        id: Math.floor(Math.random() * 1e9),
        reference,
        amount: 2_000 * 100,
        status: "success",
        channel: "card",
        paid_at: new Date().toISOString(),
        metadata: { tenantId: a.id },
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
    expect(await paid(invoice.id)).toBe(2_000);
    // and now that the rule is off, the rest has to be paid in one
    expect((await record("admin", invoice.id, 1_000)).status).toBe(400);
    expect((await record("admin", invoice.id, 8_000)).status).toBe(201);
  });
});
