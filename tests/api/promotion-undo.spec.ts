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

// Undoing a roll (task 0040) over real HTTP: a roll that was a mistake is taken back as a NEW recorded fact (the roll itself is never edited): every pupil's place in the source session is ACTIVE
// again and the new place a promotion or a repeat made is CANCELLED. Whole roll or nothing: a pupil whose place was changed or used stops it, by name, and nothing moves. The school's administrator
// only, with a fresh proof and a reason. The class can be rolled again, or a pupil enrolled by hand, into the cancelled place.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const promo = (path: string) => `${school()}/academics/promotion/${path}`;
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const proof = (who: string) => ({ type: "password", value: people[who].password });

type World = {
  s1: string;
  s2: string;
  s2Periods: string[];
  subject: string;
  periods: string[];
  year: number;
  cls: Record<string, string>;
  arms: Record<string, string>;
};

/// A fresh calendar (a finished session with three terms, and the next one with two) and a fresh ladder for school A. `ladder` is [key, rung]; every class gets arms A and B.
async function world(ladder: [string, number][]): Promise<World> {
  await db.classGroup.updateMany({ where: { tenantId: a.id, archivedAt: null }, data: { archivedAt: new Date() } });
  await db.academicSession.updateMany({ where: { tenantId: a.id, archivedAt: null }, data: { status: "CLOSED", archivedAt: new Date() } });
  const year = 2040 + (counter % 40);
  const session = (n: number, status: "ACTIVE" | "PLANNED") =>
    db.academicSession.create({
      data: { tenantId: a.id, label: uniq(`U${n}-`), startDate: day(`${year + n}-09-01`), endDate: day(`${year + n + 1}-07-31`), status },
    });
  const [s1, s2] = [await session(0, "ACTIVE"), await session(1, "PLANNED")];
  const term = (sessionId: string, n: number, y: number, current = false) =>
    db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId,
        kind: "TERM",
        ordinal: n,
        label: `Term ${n}`,
        startDate: day(`${y}-${String(8 + n).padStart(2, "0")}-02`),
        endDate: day(`${y}-${String(8 + n).padStart(2, "0")}-25`),
        isCurrent: current,
      },
    });
  const periods: string[] = [];
  for (let n = 1; n <= 3; n++) periods.push((await term(s1.id, n, year, n === 3)).id);
  const s2Periods = [(await term(s2.id, 1, year + 1)).id, (await term(s2.id, 2, year + 1)).id];
  const cls: Record<string, string> = {};
  const arms: Record<string, string> = {};
  for (const [key, sortOrder] of ladder) {
    const g = await db.classGroup.create({ data: { tenantId: a.id, name: uniq(`${key}-`), sortOrder } });
    cls[key] = g.id;
    for (const name of ["A", "B"])
      arms[`${key}:${name}`] = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: g.id, name } })).id;
  }
  const subject = (await db.subject.create({ data: { tenantId: a.id, name: uniq("Maths") } })).id;
  return { s1: s1.id, s2: s2.id, s2Periods, subject, periods, year, cls, arms };
}

/// A pupil on the roll of an arm for the first session with this average in every term (null = no published result: the rule says repeat).
async function pupil(w: World, arm: string, average: number | null, name = uniq("Pu")) {
  const record = await db.studentRecord.create({
    data: { tenantId: a.id, firstName: name, lastName: "Undo", dateOfBirth: day("2014-03-03"), admissionNo: uniq("UN/") },
  });
  const enrolment = await db.studentEnrollment.create({
    data: { tenantId: a.id, studentId: record.id, sessionId: w.s1, classArmId: w.arms[arm] },
  });
  if (average !== null)
    for (const periodId of w.periods)
      await db.result.create({
        data: {
          tenantId: a.id,
          studentId: record.id,
          subjectId: w.subject,
          periodId,
          score: average,
          maxScore: 100,
          status: "PUBLISHED",
          verificationToken: uniq("tok"),
        },
      });
  return { id: record.id, name, adm: record.admissionNo, enrolment: enrolment.id };
}
type Pupil = Awaited<ReturnType<typeof pupil>>;

const roll = (w: World, cls: string, extra: Record<string, unknown> = {}) =>
  api(promo("execute"), {
    ...as("admin"),
    method: "POST",
    body: { sourceSessionId: w.s1, targetSessionId: w.s2, sourceClassGroupId: w.cls[cls], ...extra },
  });
const rolled = async (w: World, cls: string, extra: Record<string, unknown> = {}) => {
  const res = await roll(w, cls, extra);
  expect(res.status, res.text.slice(0, 300)).toBe(201);
  return res.json.data.batch.id as string;
};
const undo = (who: string, batchId: string, body: Record<string, unknown> = {}, code = a.code) =>
  api(`${school(code)}/academics/promotion/batches/${batchId}/undo`, {
    ...as(who),
    method: "POST",
    body: { reason: "Rolled the wrong class.", stepUp: proof(who), ...body },
  });
/// Every enrolment of school A and its status: what must not move when an undo is refused.
const places = async () =>
  Object.fromEntries(
    (await db.studentEnrollment.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" } })).map((e) => [e.id, e.status]),
  );
const status = async (id: string) => (await db.studentEnrollment.findUniqueOrThrow({ where: { id } })).status;
/// The undos (and their audit rows) of the rolls of THIS world's session: the school is shared by every test here, so a count of the whole school would include the others'.
const batchesOf = async (w: World) =>
  (await db.promotionBatch.findMany({ where: { tenantId: a.id, sourceSessionId: w.s1 }, select: { id: true } })).map((x) => x.id);
const reversals = async (w: World) => db.promotionReversal.findMany({ where: { tenantId: a.id, batchId: { in: await batchesOf(w) } } });
const reversalAudits = async (w: World) =>
  db.auditLog.count({ where: { tenantId: a.id, action: "PROMOTION_REVERSED", targetId: { in: await batchesOf(w) } } });
const targetOf = async (batchId: string, studentId: string) =>
  (await db.promotionRecord.findFirstOrThrow({ where: { tenantId: a.id, batchId, studentId } })).targetEnrollmentId;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Undo School" });
  b = await createTenant({ name: "Other Undo School" });
  for (const who of ["admin", "adminB", "teacher", "student", "campusAdmin"]) people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(people.student.id, a.id, Role.STUDENT);
  const campus = await db.campus.create({ data: { tenantId: a.id, name: "North" } });
  await addMembership(people.campusAdmin.id, a.id, Role.CAMPUS_ADMIN, campus.id);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("undoing a roll", () => {
  test("every pupil goes back and the new places are cancelled; the roll and its records are untouched; the undo is recorded", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    const p1 = await pupil(w, "F1:A", 80);
    const p2 = await pupil(w, "F1:B", 90);
    const p3 = await pupil(w, "F1:A", null); // no published result: repeats
    const p4 = await pupil(w, "F1:A", 85); // overridden below: leaves
    const batchId = await rolled(w, "F1", { overrides: [{ studentId: p4.id, decision: "WITHDRAWN", overrideReason: "Left the school" }] });
    const before = await db.promotionBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect([before.totalPromoted, before.totalRepeated, before.totalWithdrawn]).toEqual([2, 1, 1]);
    const targets = [await targetOf(batchId, p1.id), await targetOf(batchId, p2.id), await targetOf(batchId, p3.id)] as string[];
    expect((await status(p1.enrolment)) + (await status(p3.enrolment)) + (await status(p4.enrolment))).toBe("PROMOTEDREPEATEDWITHDRAWN");

    const res = await undo("admin", batchId);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.reversal).toMatchObject({ batchId, restored: 4, cancelled: 3, reason: "Rolled the wrong class." });

    // Every pupil is back where they were; the new places are cancelled, still there as rows (a record points at them), none deleted.
    for (const p of [p1, p2, p3, p4]) expect(await status(p.enrolment), p.name).toBe("ACTIVE");
    for (const t of targets) expect(await status(t)).toBe("CANCELLED");
    expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2 } })).toBe(3);
    expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2, status: "ACTIVE" } })).toBe(0);

    // The roll itself is exactly as it was.
    const after = await db.promotionBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(after).toEqual(before);
    expect(await db.promotionRecord.count({ where: { tenantId: a.id, batchId } })).toBe(4);

    // The undo is a fact of its own, once, with the audit row and no pupil's name in it.
    const rows = await reversals(w);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      batchId,
      reversedByUserId: people.admin.id,
      reason: "Rolled the wrong class.",
      restored: 4,
      cancelled: 3,
    });
    const audit = await db.auditLog.findFirstOrThrow({ where: { tenantId: a.id, action: "PROMOTION_REVERSED", targetId: batchId } });
    expect(audit.actorUserId).toBe(people.admin.id);
    expect(audit.afterValue).toMatchObject({
      reason: "Rolled the wrong class.",
      restored: 4,
      cancelled: 3,
      sourceSessionId: w.s1,
      targetSessionId: w.s2,
    });
    expect(JSON.stringify(audit.afterValue)).not.toContain(p1.name);
    expect(JSON.stringify(audit.afterValue)).not.toContain(p1.adm);

    // The history shows it as undone, with who and why, in the list and in the roll's own view.
    const list = (await api(promo("batches"), as("admin"))).json.data.batches.find((x: { id: string }) => x.id === batchId);
    expect(list.reversal).toMatchObject({
      reason: "Rolled the wrong class.",
      restored: 4,
      cancelled: 3,
      by: { id: people.admin.id, name: "admin" },
    });
    const one = (await api(promo(`batches/${batchId}`), as("admin"))).json.data;
    expect(one.batch.reversal.reason).toBe("Rolled the wrong class.");
    // The preview sees them all on the roll again, none already placed.
    const prev = (
      await api(
        `${promo("preview")}?${new URLSearchParams({ sourceSessionId: w.s1, targetSessionId: w.s2, sourceClassGroupId: w.cls.F1 })}`,
        as("admin"),
      )
    ).json.data.preview;
    expect(prev.students).toHaveLength(4);
    expect(prev.students.every((s: { alreadyEnrolledInTarget: boolean }) => !s.alreadyEnrolledInTarget)).toBe(true);
  });

  test("a class that graduated is put back too: there is no new place to cancel", async () => {
    const w = await world([["F3", 3]]);
    const p1 = await pupil(w, "F3:A", 80);
    const p2 = await pupil(w, "F3:B", 70);
    const batchId = await rolled(w, "F3");
    expect(await status(p1.enrolment)).toBe("ALUMNI");
    const res = await undo("admin", batchId);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.reversal).toMatchObject({ restored: 2, cancelled: 0 });
    expect([await status(p1.enrolment), await status(p2.enrolment)]).toEqual(["ACTIVE", "ACTIVE"]);
    expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2 } })).toBe(0);
  });

  test("the class can be rolled again: the cancelled place is revived, not duplicated, and the new roll can be undone in its turn", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    const p1 = await pupil(w, "F1:A", 80);
    const p2 = await pupil(w, "F1:B", null);
    const first = await rolled(w, "F1");
    const t1 = (await targetOf(first, p1.id))!;
    const t2 = (await targetOf(first, p2.id))!;
    expect((await undo("admin", first)).status).toBe(200);

    const second = await rolled(w, "F1");
    expect(second).not.toBe(first);
    // The same rows are alive again (an enrolment is unique per pupil and session), in the arms the new roll chose; no duplicate was made.
    expect(await targetOf(second, p1.id)).toBe(t1);
    expect(await targetOf(second, p2.id)).toBe(t2);
    expect([await status(t1), await status(t2), await status(p1.enrolment), await status(p2.enrolment)]).toEqual([
      "ACTIVE",
      "ACTIVE",
      "PROMOTED",
      "REPEATED",
    ]);
    expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2 } })).toBe(2);
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: t1 } })).classArmId).toBe(w.arms["F2:A"]);

    // The first undo is still the first roll's, once; the second roll can be undone as well.
    expect(await reversals(w)).toHaveLength(1);
    expect((await undo("admin", second)).status).toBe(200);
    expect(await reversals(w)).toHaveLength(2);
    expect([await status(t1), await status(p1.enrolment)]).toEqual(["CANCELLED", "ACTIVE"]);
  });

  test("a pupil enrolled by hand into the cancelled place brings it back to life; a roll leaves that pupil alone", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    const p1 = await pupil(w, "F1:A", 80);
    const p2 = await pupil(w, "F1:A", 82);
    const first = await rolled(w, "F1");
    const t1 = (await targetOf(first, p1.id))!;
    expect((await undo("admin", first)).status).toBe(200);

    const enrol = await api(`${school()}/people/students/${p1.id}/enrolments`, {
      ...as("admin"),
      method: "POST",
      body: { sessionId: w.s2, classArmId: w.arms["F2:B"] },
    });
    expect(enrol.status, enrol.text).toBe(200);
    expect(enrol.json.data.reenrolled).toBe(true);
    expect(await status(t1)).toBe("ACTIVE");
    const revived = await db.auditLog.findFirstOrThrow({ where: { tenantId: a.id, action: "ENROLMENT_REACTIVATED", targetId: t1 } });
    expect(revived.beforeValue).toMatchObject({ status: "CANCELLED" });

    // Rolling again: p1 has a place in the target session now (put there by hand) and is left alone; p2 is rolled normally.
    const second = await api(promo("execute"), {
      ...as("admin"),
      method: "POST",
      body: { sourceSessionId: w.s1, targetSessionId: w.s2, sourceClassGroupId: w.cls.F1 },
    });
    expect(second.status, second.text).toBe(201);
    expect(second.json.data.batch.totals).toMatchObject({ promoted: 1, skipped: 1 });
    expect(await status(p1.enrolment)).toBe("ACTIVE");
    expect(await status(p2.enrolment)).toBe("PROMOTED");
  });
});

test.describe("a roll that cannot be undone", () => {
  type Cause = {
    name: string;
    reason: RegExp;
    cause: (w: World, p: Pupil, target: string) => Promise<void>;
  };
  const causes: Cause[] = [
    {
      name: "marks in the target session",
      reason: /They already have marks in /,
      cause: async (w, p) => {
        await db.result.create({
          data: {
            tenantId: a.id,
            studentId: p.id,
            subjectId: w.subject,
            periodId: w.s2Periods[0],
            score: 50,
            maxScore: 100,
            status: "DRAFT",
            verificationToken: uniq("t"),
          },
        });
      },
    },
    {
      name: "a report remark in the target session",
      reason: /They already have report remarks in /,
      cause: async (w, p) => {
        await db.reportRemark.create({
          data: {
            tenantId: a.id,
            studentId: p.id,
            periodId: w.s2Periods[1],
            teacherRemark: "Good start.",
            teacherRemarkByUserId: people.admin.id,
          },
        });
      },
    },
    {
      name: "an invoice for the target session",
      reason: /They already have an invoice in /,
      cause: async (w, p) => {
        await db.invoice.create({
          data: { tenantId: a.id, studentId: p.id, periodId: w.s2Periods[0], invoiceNo: uniq("INV-"), totalAmount: 5000 },
        });
      },
    },
    {
      name: "attendance in the target session",
      reason: /They already have attendance in /,
      cause: async (w, p) => {
        await db.attendanceRecord.create({
          data: { tenantId: a.id, studentId: p.id, classArmId: w.arms["F2:A"], date: day(`${w.year + 1}-10-05`), status: "PRESENT" },
        });
      },
    },
    {
      name: "a new place that was moved on",
      reason: /Their new place in .* has been moved on since the roll \(it is now withdrawn\)/,
      cause: async (_w, _p, target) => {
        await db.studentEnrollment.update({ where: { id: target }, data: { status: "WITHDRAWN" } });
      },
    },
    {
      name: "a source place that was changed by hand",
      reason: /Their place in .* has changed since the roll \(it is now expelled\)/,
      cause: async (_w, p) => {
        await db.studentEnrollment.update({ where: { id: p.enrolment }, data: { status: "EXPELLED" } });
      },
    },
  ];

  for (const c of causes) {
    test(`${c.name}: refused, the pupil is named, and nothing at all moves, not even the pupils with nothing in the way`, async () => {
      const w = await world([
        ["F1", 1],
        ["F2", 2],
      ]);
      const blocked = await pupil(w, "F1:A", 80, uniq("Blocked"));
      const fine = await pupil(w, "F1:B", 90, uniq("Fine"));
      const batchId = await rolled(w, "F1");
      await c.cause(w, blocked, (await targetOf(batchId, blocked.id))!);
      const before = await places();

      const res = await undo("admin", batchId);
      expect(res.status, res.text).toBe(409);
      expect(res.json.error.code).toBe("UNDO_BLOCKED");
      expect(res.json.error.message).toBe(
        "This roll cannot be undone: 1 pupil's place has been changed or used since. Nothing was changed.",
      );
      // One line, naming exactly the pupil in the way (and not the other), with their admission number and why.
      expect(res.json.error.details).toHaveLength(1);
      expect(res.json.error.details[0].path).toBe(`students.${blocked.id}`);
      expect(res.json.error.details[0].message).toContain(`${blocked.name} Undo (${blocked.adm}):`);
      expect(res.json.error.details[0].message).toMatch(c.reason);
      expect(res.text).not.toContain(fine.adm);

      expect(await places(), "nothing moved").toEqual(before);
      expect(await reversals(w), "no reversal").toHaveLength(0);
      expect(await reversalAudits(w), "no audit row").toBe(0);
    });
  }

  test("every pupil in the way is named, each with all their reasons", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    const ps = [await pupil(w, "F1:A", 80), await pupil(w, "F1:A", 81), await pupil(w, "F1:B", 82)];
    const batchId = await rolled(w, "F1");
    await causes[0].cause(w, ps[0], "");
    await causes[2].cause(w, ps[0], ""); // marks AND an invoice
    await causes[1].cause(w, ps[1], "");
    const res = await undo("admin", batchId);
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/^This roll cannot be undone: 2 pupils' places have been changed or used since\./);
    const lines = res.json.error.details as { path: string; message: string }[];
    expect(lines.map((l) => l.path).sort()).toEqual([ps[0].id, ps[1].id].map((id) => `students.${id}`).sort());
    expect(lines.find((l) => l.path === `students.${ps[0].id}`)!.message).toMatch(/They already have marks and an invoice in /);
    expect(lines.find((l) => l.path === `students.${ps[1].id}`)!.message).toMatch(/They already have report remarks in /);
  });

  test("a roll that was undone is refused a second time, and two undos at once make exactly one", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    await pupil(w, "F1:A", 80);
    await pupil(w, "F1:B", 90);
    const batchId = await rolled(w, "F1");
    const [x, y] = await Promise.all([undo("admin", batchId), undo("admin", batchId)]);
    expect([x.status, y.status].sort(), `${x.text.slice(0, 160)} | ${y.text.slice(0, 160)}`).toEqual([200, 409]);
    const refused = x.status === 409 ? x : y;
    expect(refused.json.error.code).toBe("ALREADY_UNDONE");
    expect(refused.json.error.message).toBe("This roll has already been undone.");
    expect(await reversals(w)).toHaveLength(1);
    expect(await reversalAudits(w)).toBe(1);
    const again = await undo("admin", batchId);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("ALREADY_UNDONE");
    expect(await reversals(w)).toHaveLength(1);
  });

  test("a roll that is not there, or is another school's, is the same 404", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    await pupil(w, "F1:A", 80);
    const batchId = await rolled(w, "F1");
    const before = await places();
    for (const id of ["cm0000000000000000000000x", "not an id!"]) expect((await undo("admin", id)).status, id).toBe(404);
    // School B's administrator, school B's door, school A's roll; and school A's administrator naming a roll that belongs to nobody there.
    const crossed = await undo("adminB", batchId, {}, b.code);
    expect(crossed.status).toBe(404);
    const foreign = await undo("adminB", batchId);
    expect([403, 404]).toContain(foreign.status);
    expect(await places()).toEqual(before);
    expect(await reversals(w)).toHaveLength(0);
  });
});

test.describe("who may undo, and what it asks for", () => {
  test("the school's administrator only: a campus administrator, a teacher, a pupil, another school's administrator and a stranger cannot", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    await pupil(w, "F1:A", 80);
    const batchId = await rolled(w, "F1");
    const before = await places();
    for (const who of ["campusAdmin", "teacher", "student", "adminB"]) expect((await undo(who, batchId)).status, who).toBe(403);
    const anon = await api(`${school()}/academics/promotion/batches/${batchId}/undo`, {
      ...SAAS,
      method: "POST",
      body: { reason: "x", stepUp: proof("admin") },
    });
    expect(anon.status).toBe(401);
    expect(await places()).toEqual(before);
    expect(await reversals(w)).toHaveLength(0);
  });

  test("a fresh proof is needed, and a wrong one is refused: nothing moves", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    await pupil(w, "F1:A", 80);
    const batchId = await rolled(w, "F1");
    const before = await places();
    const none = await api(`${school()}/academics/promotion/batches/${batchId}/undo`, {
      ...as("admin"),
      method: "POST",
      body: { reason: "Wrong class." },
    });
    expect(none.status).toBe(400);
    const wrong = await undo("admin", batchId, { stepUp: { type: "password", value: "not-the-password-1A!" } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.status).toBeLessThan(500);
    expect(await places()).toEqual(before);
    expect(await reversals(w)).toHaveLength(0);
  });

  test("a reason is needed: missing, blank, over 500 characters and a field the route does not read are refused; one is trimmed and kept", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    await pupil(w, "F1:A", 80);
    const batchId = await rolled(w, "F1");
    const before = await places();
    const send = (body: Record<string, unknown>) =>
      api(`${school()}/academics/promotion/batches/${batchId}/undo`, {
        ...as("admin"),
        method: "POST",
        body: { stepUp: proof("admin"), ...body },
      });
    for (const bad of [{}, { reason: "" }, { reason: "     " }, { reason: "x".repeat(501) }, { reason: "Wrong class.", force: true }])
      expect((await send(bad)).status, JSON.stringify(bad).slice(0, 50)).toBe(400);
    expect(await places()).toEqual(before);
    const ok = await send({ reason: `   ${"y".repeat(500)}   ` });
    expect(ok.status, ok.text).toBe(200);
    expect((await reversals(w))[0].reason).toBe("y".repeat(500));
  });
});

test.describe("what the database holds to", () => {
  test("a roll is undone at most once, a reason is 1 to 500 characters, the counts make sense, and the application role cannot change or remove an undo", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    await pupil(w, "F1:A", 80);
    const batchId = await rolled(w, "F1");
    expect((await undo("admin", batchId)).status).toBe(200);
    const base = { tenantId: a.id, batchId, reversedByUserId: people.admin.id, reason: "r", restored: 1, cancelled: 1 };
    await expect(db.promotionReversal.create({ data: base }), "a second undo of one roll").rejects.toThrow();
    // The class is back on its roll, so it can be rolled again: a second, live roll to try the other rules against.
    const secondId = await rolled(w, "F1");
    await expect(db.promotionReversal.create({ data: { ...base, batchId: secondId, reason: "   " } }), "a blank reason").rejects.toThrow();
    await expect(
      db.promotionReversal.create({ data: { ...base, batchId: secondId, reason: "x".repeat(501) } }),
      "a long reason",
    ).rejects.toThrow();
    await expect(
      db.promotionReversal.create({ data: { ...base, batchId: secondId, restored: 1, cancelled: 2 } }),
      "more cancelled than restored",
    ).rejects.toThrow();
    await expect(
      db.promotionReversal.create({ data: { ...base, batchId: secondId, restored: -1, cancelled: 0 } }),
      "a negative count",
    ).rejects.toThrow();
    expect(await reversals(w), "none of those was written").toHaveLength(1);
    const [priv] = await db.$queryRaw<
      { ok: boolean }[]
    >`SELECT has_table_privilege('app_user', '"PromotionReversal"', 'UPDATE,DELETE,TRUNCATE') AS ok`;
    expect(priv.ok, "app_user may not change or remove an undo").toBe(false);
    const [read] = await db.$queryRaw<
      { ok: boolean }[]
    >`SELECT has_table_privilege('app_user', '"PromotionReversal"', 'SELECT,INSERT') AS ok`;
    expect(read.ok).toBe(true);
  });

  test("another school cannot see an undo: its history does not list the roll", async () => {
    const w = await world([
      ["F1", 1],
      ["F2", 2],
    ]);
    await pupil(w, "F1:A", 80);
    const batchId = await rolled(w, "F1");
    expect((await undo("admin", batchId)).status).toBe(200);
    const theirs = await api(`${school(b.code)}/academics/promotion/batches`, as("adminB"));
    expect(theirs.status).toBe(200);
    expect(theirs.json.data.batches).toEqual([]);
    expect((await api(`${school(b.code)}/academics/promotion/batches/${batchId}`, as("adminB"))).status).toBe(404);
  });
});
