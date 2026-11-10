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

// The payment gate on report cards (task 0037) over real HTTP: off until the school turns it on, who is held (a pupil and a parent, never staff), what counts as owed, the school's value and a
// campus's own (a campus can hold more and never release what the school holds), who may change it and with what proof, and the audit.
//
// School A has two campuses, North and South. Every test builds its own pupils; the school's switch is put back to its default after each test.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let session: { id: string };
let periods: { id: string }[];
let armNorth: { id: string };
let subject: { id: string };
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Gate School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Gate School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusNorth", "campusSouth", "clerk", "teacher", "adminB"]) people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.campusSouth.id, a.id, Role.CAMPUS_ADMIN, south);
  await addMembership(people.clerk.id, a.id, Role.NON_TEACHING_STAFF);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);

  session = await db.academicSession.create({
    data: { tenantId: a.id, label: uniq("GS"), startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  periods = [];
  for (const n of [1, 2, 3])
    periods.push(
      await db.academicPeriod.create({
        data: {
          tenantId: a.id,
          sessionId: session.id,
          kind: "TERM",
          ordinal: n,
          label: `Term ${n}`,
          startDate: new Date(`2026-0${8 + n}-02`),
          endDate: new Date(`2026-0${8 + n}-25`),
          isCurrent: n === 1,
        },
      }),
    );
  const group = await db.classGroup.create({ data: { tenantId: a.id, name: uniq("JSS1-"), sortOrder: 1 } });
  armNorth = await db.classArm.create({ data: { tenantId: a.id, classGroupId: group.id, name: "A" } });
  subject = await db.subject.create({ data: { tenantId: a.id, name: uniq("Maths") } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.afterEach(async () => {
  // The school's and the campuses' switch back to the default (nothing stored).
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "results.reportCardsOpen" } });
});

type InvoiceSpec = { status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "WAIVED"; total: number; paid?: number; due?: number | null };
type Viewer = { key: string; id: string };
async function viewer(role: Role): Promise<Viewer> {
  const created = await createUser({ name: uniq("v") });
  await addMembership(created.id, a.id, role);
  const key = uniq("viewer");
  cookie[key] = cookieHeader((await loginAs(created, SAAS)).token!);
  return { key, id: created.id };
}

/// A pupil of a campus on the roll of the arm with a published mark, who can sign in, with a guardian who can, and the given invoices (one per term, at most three).
async function pupil(campusId: string | null, invoices: InvoiceSpec[] = []) {
  const pupilV = await viewer(Role.STUDENT);
  const parentV = await viewer(Role.PARENT);
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId,
      firstName: uniq("Pu"),
      lastName: "Gate",
      dateOfBirth: new Date("2014-05-05"),
      admissionNo: uniq("GT/"),
      userId: pupilV.id,
    },
  });
  await db.studentEnrollment.create({
    data: { tenantId: a.id, sessionId: session.id, classArmId: armNorth.id, studentId: record.id, status: "ACTIVE" },
  });
  await db.result.create({
    data: {
      tenantId: a.id,
      studentId: record.id,
      subjectId: subject.id,
      periodId: periods[0].id,
      score: 70,
      status: "PUBLISHED",
      verificationToken: uniq("tok"),
    },
  });
  const guardian = await db.guardianRecord.create({ data: { tenantId: a.id, userId: parentV.id, firstName: "Amina", lastName: "Gate" } });
  await db.guardianLink.create({
    data: { tenantId: a.id, studentId: record.id, guardianId: guardian.id, relationship: "MOTHER", status: "APPROVED", isPrimary: true },
  });
  for (const [i, spec] of invoices.entries())
    await db.invoice.create({
      data: {
        tenantId: a.id,
        studentId: record.id,
        periodId: periods[i].id,
        invoiceNo: uniq("INV-"),
        totalAmount: spec.total,
        amountPaid: spec.paid ?? (spec.status === "PAID" ? spec.total : 0),
        status: spec.status,
        dueDate: spec.due === null ? null : new Date(day(spec.due ?? -10)),
      },
    });
  return { id: record.id, pupil: pupilV.key, parent: parentV.key };
}

const card = (who: string, studentId: string) =>
  api(`${school()}/people/students/${studentId}/report-card?periodId=${periods[0].id}`, as(who));
const url = () => `${school()}/settings/report-cards`;
const proof = (who: string) => ({ type: "password", value: people[who].password });
const set = (who: string, body: object) => api(url(), { ...as(who), method: "PATCH", body });
const holdForSchool = () => set("admin", { scope: "SCHOOL", enabled: false, stepUp: proof("admin") });
const WITHHELD = (amount: string) =>
  `This report card is being held until the outstanding school fees of ${amount} are paid. Please contact the school office.`;

test.describe("off until the school turns it on", () => {
  test("by default a pupil and a parent read the card whatever is owed, and staff are told nothing", async () => {
    const p = await pupil(north, [{ status: "UNPAID", total: 50000 }]);
    for (const who of [p.pupil, p.parent]) expect((await card(who, p.id)).status, who).toBe(200);
    expect((await card("admin", p.id)).json.data.feeHold).toBeNull();
    expect((await api(url(), as("admin"))).json.data.school).toEqual({ stored: null, effective: true });
  });
});

test.describe("held for a pupil and a parent when the school turns it off", () => {
  test("a pupil and a parent are refused with the amount and what to do; staff read the card and are told what holds it", async () => {
    const p = await pupil(north, [{ status: "UNPAID", total: 50000 }]);
    expect((await holdForSchool()).status).toBe(200);
    for (const who of [p.pupil, p.parent]) {
      const res = await card(who, p.id);
      expect(res.status, `${who}: ${res.text}`).toBe(403);
      expect(res.json.error).toEqual({ code: "REPORT_CARD_WITHHELD", message: WITHHELD("₦50,000") });
      expect(res.text, "no mark or remark leaks in the refusal").not.toMatch(/subjects|remarks|score/);
    }
    for (const who of ["admin", "clerk"]) {
      const res = await card(who, p.id);
      expect(res.status, who).toBe(200);
      expect(res.json.data.feeHold).toEqual({ outstanding: 50000 });
      expect(res.json.data.subjects).toHaveLength(1);
    }
  });

  test("a pupil who owes nothing is not held: no invoice, paid, waived, or an overpayment", async () => {
    await holdForSchool();
    for (const invoices of [
      [],
      [{ status: "PAID", total: 40000 }],
      [{ status: "WAIVED", total: 40000 }],
      [
        { status: "PAID", total: 40000 },
        { status: "WAIVED", total: 10000 },
      ],
    ] as InvoiceSpec[][]) {
      const p = await pupil(north, invoices);
      for (const who of [p.pupil, p.parent]) expect((await card(who, p.id)).status, `${JSON.stringify(invoices)} ${who}`).toBe(200);
      expect((await card("admin", p.id)).json.data.feeHold).toBeNull();
    }
  });

  test("what counts: the balance of a part-paid invoice, every due invoice added up, a due date today or past, no due date; not an invoice that is not yet due", async () => {
    await holdForSchool();
    const part = await pupil(north, [{ status: "PARTIALLY_PAID", total: 50000, paid: 20000 }]);
    expect((await card(part.pupil, part.id)).json.error.message).toBe(WITHHELD("₦30,000"));
    const sum = await pupil(north, [
      { status: "UNPAID", total: 10000, due: null },
      { status: "PARTIALLY_PAID", total: 20000, paid: 5000, due: 0 },
      { status: "UNPAID", total: 1000.5, due: -30 },
    ]);
    expect((await card(sum.parent, sum.id)).json.error.message).toBe(WITHHELD("₦26,000.50"));
    const advance = await pupil(north, [{ status: "UNPAID", total: 90000, due: 45 }]);
    expect((await card(advance.pupil, advance.id)).status, "next term's bill, not yet due").toBe(200);
    expect((await card("admin", advance.id)).json.data.feeHold).toBeNull();
    const mixed = await pupil(north, [
      { status: "UNPAID", total: 90000, due: 45 },
      { status: "UNPAID", total: 7000, due: -1 },
    ]);
    expect((await card(mixed.pupil, mixed.id)).json.error.message).toBe(WITHHELD("₦7,000"));
  });

  test("it is judged in the pupil's own right: a pupil who owes is held, their classmate who does not is not", async () => {
    await holdForSchool();
    const owes = await pupil(north, [{ status: "UNPAID", total: 100 }]);
    const clear = await pupil(north, [{ status: "PAID", total: 100 }]);
    expect((await card(owes.pupil, owes.id)).status).toBe(403);
    expect((await card(clear.pupil, clear.id)).status).toBe(200);
    // Nobody reads another pupil's card by way of the gate: the usual 403 for someone else's child comes first.
    expect((await card(clear.pupil, owes.id)).status).toBe(403);
  });

  test("turning the setting back on releases the card at once; it is judged on every read", async () => {
    const p = await pupil(north, [{ status: "UNPAID", total: 5000 }]);
    await holdForSchool();
    expect((await card(p.pupil, p.id)).status).toBe(403);
    expect((await set("admin", { scope: "SCHOOL", enabled: true, stepUp: proof("admin") })).status).toBe(200);
    expect((await card(p.pupil, p.id)).status).toBe(200);
    await holdForSchool();
    await db.invoice.updateMany({ where: { studentId: p.id }, data: { status: "PAID", amountPaid: 5000 } }); // the parent pays
    expect((await card(p.pupil, p.id)).status, "paid: released without anyone doing anything").toBe(200);
  });

  test("a pupil with no campus follows the school's value alone", async () => {
    const p = await pupil(null, [{ status: "UNPAID", total: 2500 }]);
    await holdForSchool();
    expect((await card(p.pupil, p.id)).status).toBe(403);
  });
});

test.describe("a campus can hold more and never release what the school holds", () => {
  test("a campus that turns it off holds its own pupils' cards while the school's others stay open", async () => {
    const n = await pupil(north, [{ status: "UNPAID", total: 8000 }]);
    const s = await pupil(south, [{ status: "UNPAID", total: 8000 }]);
    const off = await set("campusNorth", { scope: "CAMPUS", campusId: north, enabled: false });
    expect(off.status, off.text).toBe(200);
    expect((await card(n.pupil, n.id)).status).toBe(403);
    expect((await card(n.parent, n.id)).json.error.message).toBe(WITHHELD("₦8,000"));
    expect((await card(s.pupil, s.id)).status, "the other campus is untouched").toBe(200);
    expect((await card("admin", n.id)).json.data.feeHold).toEqual({ outstanding: 8000 });
    expect((await card("admin", s.id)).json.data.feeHold).toBeNull();
  });

  test("a campus cannot release what the school holds; another campus's setting is not theirs", async () => {
    await holdForSchool();
    const on = await set("campusNorth", { scope: "CAMPUS", campusId: north, enabled: true });
    expect(on.status).toBe(400);
    expect(on.json.error.message).toMatch(/can only turn this off/);
    const p = await pupil(north, [{ status: "UNPAID", total: 100 }]);
    expect((await card(p.pupil, p.id)).status).toBe(403);
    const other = await set("campusNorth", { scope: "CAMPUS", campusId: south, enabled: false });
    expect(other.status).toBe(404);
    expect(await db.tenantSetting.count({ where: { tenantId: a.id, key: "results.reportCardsOpen", campusId: south } })).toBe(0);
  });
});

test.describe("who may change it, and the audit", () => {
  test("the school's value needs the school's administrator and a fresh proof; a campus administrator, staff and another school's administrator cannot", async () => {
    expect((await set("admin", { scope: "SCHOOL", enabled: false })).status, "no proof").toBe(400);
    const wrong = await set("admin", { scope: "SCHOOL", enabled: false, stepUp: { type: "password", value: "not-the-password-1A!" } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(await db.tenantSetting.count({ where: { tenantId: a.id, key: "results.reportCardsOpen" } })).toBe(0);
    expect((await set("campusNorth", { scope: "SCHOOL", enabled: false, stepUp: proof("campusNorth") })).status).toBe(403);
    for (const who of ["clerk", "teacher"]) {
      expect((await set(who, { scope: "SCHOOL", enabled: false, stepUp: proof(who) })).status, who).toBe(403);
      expect((await api(url(), as(who))).status, `${who} reads`).toBe(403);
    }
    expect((await api(url(), { ...SAAS })).status).toBe(401);
    expect((await api(url(), as("adminB"))).status).toBe(403);
    expect(await db.tenantSetting.count({ where: { tenantId: a.id, key: "results.reportCardsOpen" } })).toBe(0);
  });

  test("a value that is not a yes or a no, an unknown key, or a school value naming a campus is refused", async () => {
    for (const bad of [
      { scope: "SCHOOL", enabled: "no", stepUp: proof("admin") },
      { scope: "SCHOOL", enabled: false, stepUp: proof("admin"), surprise: 1 },
      { scope: "SCHOOL", campusId: north, enabled: false, stepUp: proof("admin") },
      { scope: "CAMPUS", enabled: false },
    ])
      expect((await set("admin", bad)).status, JSON.stringify(bad)).toBe(400);
  });

  test("every change is audited with its before and after; a save that changes nothing writes nothing; null puts the default back", async () => {
    const audits = () =>
      db.auditLog.findMany({ where: { tenantId: a.id, action: "REPORT_CARD_GATE_CHANGED" }, orderBy: { createdAt: "asc" } });
    const before = (await audits()).length;
    expect((await holdForSchool()).status).toBe(200);
    expect((await audits()).length).toBe(before + 1);
    expect((await audits()).at(-1)).toMatchObject({
      actorUserId: people.admin.id,
      targetType: "TenantSetting",
      beforeValue: null,
      afterValue: false,
    });
    expect((await holdForSchool()).status).toBe(200);
    expect((await audits()).length, "the same value again is no change").toBe(before + 1);
    const back = await set("admin", { scope: "SCHOOL", enabled: null, stepUp: proof("admin") });
    expect(back.json.data.school).toEqual({ stored: null, effective: true });
    expect((await audits()).length).toBe(before + 2);
  });

  test("the administrator sees every campus's value; a campus administrator only their own", async () => {
    await set("campusNorth", { scope: "CAMPUS", campusId: north, enabled: false });
    const all = (await api(url(), as("admin"))).json.data;
    expect(all.campuses.map((c: { name: string; stored: boolean | null }) => [c.name, c.stored]).sort()).toEqual([
      ["North", false],
      ["South", null],
    ]);
    expect(all.canEditSchool).toBe(true);
    const mine = (await api(url(), as("campusSouth"))).json.data;
    expect(mine.campuses.map((c: { name: string }) => c.name)).toEqual(["South"]);
    expect(mine.canEditSchool).toBe(false);
  });
});
