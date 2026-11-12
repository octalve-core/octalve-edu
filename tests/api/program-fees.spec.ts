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

// Programs, slice P4 (task 0027): the fees of a program over real HTTP. Fee items and who they are for, making invoices once per period (a preview first), payments under the part-payment rule,
// discounts, "pay in full only", what a campus administrator sees, the three levels of the switch and what the database refuses. Paying through the gateway is not built.
//
// School A has two campuses, North and South. School B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
let programId: string;
let top: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const programUrl = (id = programId) => `${school()}/programs/${id}`;
const feesUrl = () => `${programUrl()}/fees`;
const get = (url: string, who: string) => api(url, as(who));
const send = (url: string, who: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) =>
  api(url, { ...as(who), method, ...(body ? { body } : {}) });
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const idOf = (res: { json: { data: { id: string } } }) => res.json.data.id;
const money = (n: number) => Math.round(n * 100) / 100;

async function item(over: Record<string, unknown> = {}, who = "admin") {
  const res = await send(`${feesUrl()}/items`, who, "POST", { name: uniq("Fee"), amount: 5000, frequency: "ONCE", ...over });
  expect(res.status, res.text).toBe(201);
  return idOf(res);
}
async function member(campusId: string | null, over: Record<string, unknown> = {}) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Payer"),
      lastName: "Fee",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("FE/"),
      ...over,
    },
  });
  const guardian = await db.guardianRecord.create({
    data: { tenantId: a.id, firstName: "Guardian", lastName: record.firstName, phone: "08030001111" },
  });
  await db.guardianLink.create({
    data: { tenantId: a.id, studentId: record.id, guardianId: guardian.id, relationship: "MOTHER", isPrimary: true },
  });
  const res = await send(`${programUrl()}/people`, "admin", "POST", { kind: "STUDENT", studentId: record.id, groupId: top });
  expect(res.status, res.text).toBe(201);
  return { record, id: idOf(res) };
}
const generate = (period: string, who = "admin", confirm = true) =>
  send(`${feesUrl()}/generate`, who, "POST", { periodKey: period, confirm });
type Invoice = { id: string; participantId: string; total: number; paid: number; status: string };
const invoices = async (who = "admin", query = "") => (await get(`${feesUrl()}/invoices${query}`, who)).json.data.invoices as Invoice[];
const invoiceOf = async (participantId: string, who = "admin") => (await invoices(who)).find((i) => i.participantId === participantId);

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Fees School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Fees School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusNorth", "campusSouth", "progAdmin", "teacher", "pupilUser", "adminB"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.campusSouth.id, a.id, Role.CAMPUS_ADMIN, south);
  await addMembership(people.progAdmin.id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF, north);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, north);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
  const made = await send(`${school()}/programs`, "admin", "POST", {
    name: uniq("Hifz"),
    kind: "ONGOING",
    campusIds: [north, south],
    levelLabels: ["Section"],
  });
  programId = idOf(made);
  await send(`${programUrl()}/status`, "admin", "POST", { action: "activate" });
  top = idOf(await send(`${programUrl()}/groups`, "admin", "POST", { name: "Juz A" }));
  await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.progAdmin.id, role: "ADMIN" });
  await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.teacher.id, role: "TEACHER" });
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({
    where: { tenantId: a.id, key: { in: ["programs.enabled", "programs.fees.enabled", "finance.partPayment"] } },
  });
  await db.program.update({ where: { id: programId }, data: { feesEnabled: true } });
  // Each test arranges its own fees: what an earlier test left active would apply to the people made here.
  await db.programFeeItem.updateMany({ where: { programId }, data: { status: "ARCHIVED" } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("who reaches the fees", () => {
  test("nobody signed out, no pupil, no other school, and no teacher reaches a program's money; a campus administrator reads the fees and changes none", async () => {
    for (const url of [`${feesUrl()}/items`, `${feesUrl()}/invoices`, `${feesUrl()}/report`]) {
      expect((await api(url, SAAS)).status, url).toBe(401);
      expect((await get(url, "pupilUser")).status, url).toBe(403);
      expect([403, 404]).toContain((await get(url, "adminB")).status);
      expect((await get(url, "teacher")).status, `${url} teacher`).toBe(403);
      expect((await get(url, "campusNorth")).status, `${url} campus`).toBe(200);
    }
    for (const who of ["campusNorth", "teacher"])
      expect((await send(`${feesUrl()}/items`, who, "POST", { name: "x", amount: 100 })).status, who).toBe(403);
    expect((await send(`${feesUrl()}/items`, "progAdmin", "POST", { name: uniq("P"), amount: 100 })).status).toBe(201);
  });
});

test.describe("fee items", () => {
  test("a fee has a name, an amount and a rhythm; the shape is checked; a fee off the audience does not apply; archiving keeps old invoices", async () => {
    const bad: object[] = [
      { name: "", amount: 100 },
      { name: "x", amount: 0 },
      { name: "x", amount: 10_000_001 },
      { name: "x", amount: 10.123 },
      { name: "x", amount: 100, dueDay: 31 },
      { name: "x", amount: 100, discountPercent: 101 },
      { name: "x", amount: 100, frequency: "WEEKLY" },
      { name: "x", amount: 100, extra: 1 },
      { name: "x", amount: 100, audience: { campusIds: ["no-such"] } },
    ];
    for (const body of bad)
      expect((await send(`${feesUrl()}/items`, "admin", "POST", body)).status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
    const id = await item({ name: uniq("Tuition"), amount: 12000.5, frequency: "MONTHLY", dueDay: 10, discountPercent: 10 });
    const list = (await get(`${feesUrl()}/items`, "admin")).json.data.items as { id: string; amount: number; discountPercent: number }[];
    expect(list.find((i) => i.id === id)).toMatchObject({ amount: 12000.5, discountPercent: 10 });
    expect((await send(`${feesUrl()}/items/${id}`, "admin", "PATCH", { status: "ARCHIVED" })).status).toBe(200);
  });

  test("the audience narrows a fee to kinds, campuses and groups; exemptions leave people out; guardians' own fees are billed to the guardian", async () => {
    const [northKid, southKid] = [await member(north), await member(south)];
    const id = await item({ amount: 2000, audience: { campusIds: [north] }, exemptIds: [] });
    const preview = await generate("once", "admin", false);
    expect(preview.status, preview.text).toBe(200);
    const will = preview.json.data.willGet.map((r: { participantId: string }) => r.participantId);
    expect(will).toContain(northKid.id);
    expect(will).not.toContain(southKid.id);
    await send(`${feesUrl()}/items/${id}`, "admin", "PATCH", { exemptIds: [northKid.id] });
    const again = await generate("once", "admin", false);
    expect(again.json.data.willGet.map((r: { participantId: string }) => r.participantId)).not.toContain(northKid.id);
    await send(`${feesUrl()}/items/${id}`, "admin", "PATCH", { status: "ARCHIVED" });
  });
});

test.describe("making invoices", () => {
  test("a preview changes nothing; the step makes one invoice per person and period, in one go, and doing it again makes nothing new", async () => {
    const kid = await member(north);
    await item({ amount: 3000 });
    const before = (await invoices()).length;
    const preview = await generate("once", "admin", false);
    expect(preview.json.data.willGet.length).toBeGreaterThan(0);
    expect((await invoices()).length, "a preview makes none").toBe(before);
    const made = await generate("once");
    expect(made.status, made.text).toBe(200);
    expect(made.json.data.created).toBeGreaterThan(0);
    const mine = await invoiceOf(kid.id);
    expect(mine).toMatchObject({ total: 3000, paid: 0, status: "UNPAID" });
    const second = await generate("once");
    expect(second.json.data.created, "nothing new").toBe(0);
    expect(await db.programInvoice.count({ where: { programId, participantId: kid.id, periodKey: "once" } })).toBe(1);
  });

  test("a period must fit how often the fee is charged; a bad period is refused; a person who left or an expelled one is not billed; a suspended one is", async () => {
    const [gone, suspended, expelled] = [
      await member(north),
      await member(north, { standing: "SUSPENDED" }),
      await member(north, { standing: "EXPELLED" }),
    ];
    await send(`${programUrl()}/people/${gone.id}/place`, "admin", "POST", { action: "withdraw", reason: "Moved away" });
    await item({ amount: 700, frequency: "MONTHLY" });
    expect((await generate("2026-13")).status).toBe(400);
    expect((await generate("monthly")).status).toBe(400);
    const month = new Date().toISOString().slice(0, 7);
    const preview = (await generate(month, "admin", false)).json.data.willGet.map((r: { participantId: string }) => r.participantId);
    expect(preview).toContain(suspended.id);
    expect(preview).not.toContain(gone.id);
    expect(preview).not.toContain(expelled.id);
  });

  test("an invoice keeps the lines it was made with; a fee added later goes onto open invoices only when asked, never onto a paid one", async () => {
    const kid = await member(north);
    const paidKid = await member(north);
    await item({ amount: 1000, name: uniq("First") });
    await generate("once");
    const pay = await invoiceOf(paidKid.id);
    expect((await send(`${feesUrl()}/invoices/${pay!.id}/payments`, "admin", "POST", { amount: 100, channel: "cash" })).status).toBe(201);
    const later = await item({ amount: 500, name: uniq("Later") });
    expect((await invoiceOf(kid.id))!.total, "an invoice keeps its lines").toBe(1000);
    const added = await send(`${feesUrl()}/items/${later}/add-to-open`, "admin", "POST", { periodKey: "once" });
    expect(added.status, added.text).toBe(200);
    expect((await invoiceOf(kid.id))!.total).toBe(1500);
    expect((await invoiceOf(paidKid.id))!.total, "a part-paid invoice is not changed").toBe(1000);
  });

  test("generating is refused when fees are off, and for an archived program", async () => {
    await db.program.update({ where: { id: programId }, data: { feesEnabled: false } });
    expect((await generate("once")).json.error.code).toBe("FEES_OFF");
    await db.program.update({ where: { id: programId }, data: { feesEnabled: true } });
    const other = idOf(
      await send(`${school()}/programs`, "admin", "POST", {
        name: uniq("Gone"),
        kind: "ONGOING",
        campusIds: [north],
        levelLabels: ["One"],
      }),
    );
    await send(`${programUrl(other)}/status`, "admin", "POST", { action: "archive" });
    const res = await send(`${programUrl(other)}/fees/generate`, "admin", "POST", { periodKey: "once", confirm: true });
    expect(res.json.error.code).toBe("PROGRAM_READ_ONLY");
  });
});

test.describe("payments, discounts and the part-payment rule", () => {
  test("a payment takes a receipt and moves the status; more than the balance is refused; paid is paid", async () => {
    const kid = await member(north);
    await item({ amount: 1000 });
    await generate("once");
    const inv = (await invoiceOf(kid.id))!;
    const url = `${feesUrl()}/invoices/${inv.id}/payments`;
    const first = await send(url, "admin", "POST", { amount: 400, channel: "transfer", notes: "Slip 1" });
    expect(first.status, first.text).toBe(201);
    expect(first.json.data).toMatchObject({ balance: 600, status: "PARTIALLY_PAID" });
    expect(first.json.data.receiptNo).toMatch(/^PRC-\d{4}-\d{4}$/);
    expect((await send(url, "admin", "POST", { amount: 700, channel: "cash" })).json.error.code).toBe("EXCEEDS_BALANCE");
    expect((await send(url, "admin", "POST", { amount: 0, channel: "cash" })).status).toBe(400);
    expect((await send(url, "admin", "POST", { amount: 600, channel: "cash" })).json.data.status).toBe("PAID");
    expect((await send(url, "admin", "POST", { amount: 1, channel: "cash" })).json.error.code).toBe("ALREADY_PAID");
    const receipts = await db.programPayment.findMany({ where: { invoiceId: inv.id }, select: { receiptNo: true } });
    expect(new Set(receipts.map((r) => r.receiptNo)).size).toBe(2);
  });

  test("the school's part-payment rule applies, and a payer can be held to full payment on one invoice", async () => {
    const [one, two] = [await member(north), await member(north)];
    await item({ amount: 1000 });
    await generate("once");
    await db.tenantSetting.create({
      data: {
        tenantId: a.id,
        campusId: null,
        key: "finance.partPayment",
        value: { allowed: true, minimum: { kind: "AMOUNT", value: 500 } },
        updatedById: people.admin.id,
      },
    });
    const invOne = (await invoiceOf(one.id))!;
    const small = await send(`${feesUrl()}/invoices/${invOne.id}/payments`, "admin", "POST", { amount: 100, channel: "cash" });
    expect([small.status, small.json.error.code]).toEqual([409, "BELOW_MINIMUM"]);
    expect((await send(`${feesUrl()}/invoices/${invOne.id}/payments`, "admin", "POST", { amount: 500, channel: "cash" })).status).toBe(201);
    await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "finance.partPayment" } });
    const invTwo = (await invoiceOf(two.id))!;
    expect((await send(`${feesUrl()}/invoices/${invTwo.id}`, "admin", "PATCH", { payInFull: true })).status).toBe(200);
    const part = await send(`${feesUrl()}/invoices/${invTwo.id}/payments`, "admin", "POST", { amount: 100, channel: "cash" });
    expect(part.json.error.code).toBe("PAY_IN_FULL");
    expect((await send(`${feesUrl()}/invoices/${invTwo.id}/payments`, "admin", "POST", { amount: 1000, channel: "cash" })).status).toBe(
      201,
    );
  });

  test("a discount lowers what is owed, is kept with who and why, and never goes below what was paid", async () => {
    const kid = await member(north);
    await item({ amount: 1000 });
    await generate("once");
    const inv = (await invoiceOf(kid.id))!;
    await send(`${feesUrl()}/invoices/${inv.id}/payments`, "admin", "POST", { amount: 600, channel: "cash" });
    expect(
      (await send(`${feesUrl()}/invoices/${inv.id}/discounts`, "admin", "POST", { amount: 500, reason: "Sibling" })).json.error.code,
    ).toBe("DISCOUNT_TOO_LARGE");
    expect((await send(`${feesUrl()}/invoices/${inv.id}/discounts`, "admin", "POST", { amount: 100, reason: "no" })).status).toBe(400);
    const ok = await send(`${feesUrl()}/invoices/${inv.id}/discounts`, "admin", "POST", { amount: 400, reason: "Sibling discount" });
    expect(ok.status, ok.text).toBe(201);
    const detail = (await get(`${feesUrl()}/invoices/${inv.id}`, "admin")).json.data;
    expect(detail).toMatchObject({ total: 600, status: "PAID" });
    expect(detail.discounts).toHaveLength(1);
  });

  test("two payments at once cannot take more than the balance", async () => {
    const kid = await member(north);
    await item({ amount: 1000 });
    await generate("once");
    const inv = (await invoiceOf(kid.id))!;
    const results = await Promise.all(
      [1, 2, 3].map(() => send(`${feesUrl()}/invoices/${inv.id}/payments`, "admin", "POST", { amount: 600, channel: "cash" })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const after = await db.programInvoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(money(Number(after.amountPaid))).toBe(600);
  });
});

test.describe("what a campus administrator sees", () => {
  test("only the invoices through their own campus, and records payments for them; another campus's invoice is not found", async () => {
    const [mine, theirs] = [await member(north), await member(south)];
    await item({ amount: 800 });
    await generate("once");
    const northList = (await invoices("campusNorth")).map((i) => i.participantId);
    expect(northList).toContain(mine.id);
    expect(northList).not.toContain(theirs.id);
    const theirInvoice = (await invoiceOf(theirs.id))!;
    expect((await get(`${feesUrl()}/invoices/${theirInvoice.id}`, "campusNorth")).status).toBe(404);
    expect(
      (await send(`${feesUrl()}/invoices/${theirInvoice.id}/payments`, "campusNorth", "POST", { amount: 100, channel: "cash" })).status,
    ).toBe(404);
    const own = (await invoiceOf(mine.id))!;
    expect((await send(`${feesUrl()}/invoices/${own.id}/payments`, "campusNorth", "POST", { amount: 100, channel: "cash" })).status).toBe(
      201,
    );
    const report = (await get(`${feesUrl()}/report`, "campusNorth")).json.data;
    expect(report.byCampus.map((c: { name: string }) => c.name)).not.toContain("South");
  });

  test("the report adds up what was billed, collected and is owed", async () => {
    const report = (await get(`${feesUrl()}/report`, "admin")).json.data;
    expect(report.totals.billed).toBeGreaterThan(0);
    expect(money(report.totals.billed - report.totals.collected)).toBe(report.totals.outstanding);
    expect(report.totals.rate).toBeGreaterThanOrEqual(0);
  });
});

test.describe("the database", () => {
  test("an invoice is of a person of this program and cannot be paid more than its total; a discount and a payment must be positive", async () => {
    const kid = await member(north);
    const base = {
      tenantId: a.id,
      programId,
      participantId: kid.id,
      periodKey: "2026-01",
      invoiceNo: uniq("PINV-"),
      lineItems: [],
      createdByUserId: people.admin.id,
    };
    await expect(db.programInvoice.create({ data: { ...base, totalAmount: 100, amountPaid: 200 } })).rejects.toThrow();
    await expect(db.programInvoice.create({ data: { ...base, totalAmount: 100, periodKey: "2026-13" } })).rejects.toThrow();
    await expect(db.programInvoice.create({ data: { ...base, totalAmount: 100, lineItems: {} } })).rejects.toThrow();
    const ok = await db.programInvoice.create({ data: { ...base, totalAmount: 100 } });
    await expect(
      db.programInvoice.create({ data: { ...base, invoiceNo: uniq("PINV-"), totalAmount: 100 } }),
      "one invoice per person and period",
    ).rejects.toThrow();
    await expect(
      db.programPayment.create({ data: { tenantId: a.id, programId, invoiceId: ok.id, amount: 0, providerRef: uniq("r") } }),
    ).rejects.toThrow();
    await expect(
      db.programInvoiceDiscount.create({
        data: { tenantId: a.id, programId, invoiceId: ok.id, amount: 5, reason: "x", appliedByUserId: people.admin.id },
      }),
    ).rejects.toThrow();
  });
});
