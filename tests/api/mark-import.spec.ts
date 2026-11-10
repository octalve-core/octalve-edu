import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs, type ApiResponse } from "../support/http";

// Importing marks from a CSV file (task 0039) over real HTTP: the template is the sheet; a check judges every row and writes nothing; a real run is all or nothing and goes through the single writer of marks
// (so the class's scheme, DRAFT-only edits, a teacher's assignment, the scheme lock and the score audit are that writer's); pupils are found by admission number among the pupils on THIS roll only; who may; the
// limits; the audit never holds the marks.
//
// The scheme is made through the real endpoint (CA 1 /20, CA 2 /20 and an exam /60: out of 100). The first real save under a scheme locks it, so the tests run in order.

test.describe.configure({ mode: "serial" });

const SAAS = { baseUrl: SAAS_URL };
let counter = 0;
const uniq = (p: string) => `${p}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const HEADER = "admission_no,name,CA 1 (20),CA 2 (20),Exam (60)";
const csv = (...rows: string[]) => `${HEADER}\r\n${rows.join("\r\n")}\r\n`;

let t: TestTenant;
let other: TestTenant;
let sessionId: string;
let periodId: string;
let subjectId: string;
let armA: string; // the class with the scheme, where the teacher is assigned
let armB: string; // another class of the school
let armN: string; // a class with no scheme at all
let schemeId: string;
const pupils: Record<string, { id: string; adm: string; first: string }> = {};
const cookie: Record<string, string> = {};
let outsiderAdm = "";

const base = () => `/api/v1/schools/${t.code}/academics/results`;
const sheetQuery = (arm = armA, subject = subjectId) => `periodId=${periodId}&classArmId=${arm}&subjectId=${subject}`;
const template = (who: string, arm = armA) => api(`${base()}/import-template?${sheetQuery(arm)}`, { ...SAAS, cookie: cookie[who] });
const imp = (who: string, text: string, over: Record<string, unknown> = {}) =>
  api(`${base()}/import`, {
    ...SAAS,
    cookie: cookie[who],
    method: "POST",
    body: { periodId, classArmId: armA, subjectId, csv: text, dryRun: false, ...over },
  });
const reportOf = (res: ApiResponse) => {
  expect(res.status, res.text.slice(0, 300)).toBe(200);
  return res.json.data.report as {
    dryRun: boolean;
    committed: boolean;
    toWrite: number;
    counts: { rows: number; new: number; changed: number; unchanged: number; blank: number; errors: number };
    notInFile: number;
    headerProblems: string[];
    fileHash: string;
    rows: {
      row: number;
      status: string;
      name: string | null;
      problems: string[];
      total: number | null;
      savedTotal: number | null;
      note: string | null;
    }[];
  };
};
const results = () => db.result.findMany({ where: { tenantId: t.id, subjectId }, orderBy: { createdAt: "asc" } });
const importAudits = () => db.auditLog.findMany({ where: { tenantId: t.id, action: "RESULTS_IMPORTED" }, orderBy: { createdAt: "asc" } });
const locked = async () => (await db.assessmentScheme.findUniqueOrThrow({ where: { id: schemeId } })).lockedAt !== null;

async function makePupil(
  key: string,
  arm: string | null,
  over: { status?: "ACTIVE" | "WITHDRAWN"; first?: string; tenant?: TestTenant } = {},
) {
  const tenant = over.tenant ?? t;
  const first = over.first ?? uniq("P");
  const record = await db.studentRecord.create({
    data: { tenantId: tenant.id, firstName: first, lastName: "Imp", dateOfBirth: day("2014-01-01"), admissionNo: uniq("IM/") },
  });
  if (arm) {
    await db.studentEnrollment.create({
      data: { tenantId: tenant.id, studentId: record.id, sessionId, classArmId: arm, status: over.status ?? "ACTIVE" },
    });
  }
  pupils[key] = { id: record.id, adm: record.admissionNo, first };
  return record;
}

async function signIn(key: string, name: string, role: Role, tenant = t) {
  const user = await createUser({ name });
  await addMembership(user.id, tenant.id, role, null);
  cookie[key] = cookieHeader((await loginAs(user, SAAS)).token!);
  return user;
}

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Import School" });
  other = await createTenant({ name: "Import Elsewhere" });
  const session = await db.academicSession.create({
    data: { tenantId: t.id, label: "2034/2035", startDate: day("2034-09-01"), endDate: day("2035-07-20"), status: "ACTIVE" },
  });
  sessionId = session.id;
  const period = await db.academicPeriod.create({
    data: {
      tenantId: t.id,
      sessionId,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2034-09-01"),
      endDate: day("2034-12-15"),
      isCurrent: true,
    },
  });
  periodId = period.id;
  subjectId = (await db.subject.create({ data: { tenantId: t.id, name: "Mathematics" } })).id;

  const admin = await signIn("admin", "Imp Admin", Role.ADMIN);
  // The import is limited to 12 a window for each person, so the sections that send many use an administrator of their own.
  await signIn("admin2", "Imp Admin Two", Role.ADMIN);
  await signIn("admin3", "Imp Admin Three", Role.ADMIN);
  await signIn("registrar", "Imp Registrar", Role.NON_TEACHING_STAFF);
  await signIn("student", "Imp Student", Role.STUDENT);
  await signIn("parent", "Imp Parent", Role.PARENT);
  const campus = await db.campus.create({ data: { tenantId: t.id, name: "North" } });
  const campusAdmin = await createUser({ name: "Imp Campus Admin" });
  await addMembership(campusAdmin.id, t.id, Role.CAMPUS_ADMIN, campus.id);
  cookie.campusAdmin = cookieHeader((await loginAs(campusAdmin, SAAS)).token!);
  await signIn("stranger", "Imp Stranger", Role.ADMIN, other);
  void admin;

  const groupA = await db.classGroup.create({ data: { tenantId: t.id, name: uniq("Form A "), sortOrder: 1 } });
  armA = (await db.classArm.create({ data: { tenantId: t.id, classGroupId: groupA.id, name: "A" } })).id;
  armB = (await db.classArm.create({ data: { tenantId: t.id, classGroupId: groupA.id, name: "B" } })).id;
  const groupN = await db.classGroup.create({ data: { tenantId: t.id, name: uniq("Form N "), sortOrder: 2 } });
  armN = (await db.classArm.create({ data: { tenantId: t.id, classGroupId: groupN.id, name: "A" } })).id;
  for (const g of [groupA.id, groupN.id]) await db.subjectOffering.create({ data: { tenantId: t.id, classGroupId: g, subjectId } });

  // The scheme, through the endpoint: components 20 + 20 and an exam of 60 make 100.
  const made = await api(`/api/v1/schools/${t.code}/academics/assessment-schemes`, {
    ...SAAS,
    cookie: cookie.admin,
    method: "POST",
    body: {
      classGroupId: groupA.id,
      name: uniq("Scheme "),
      totalMax: 100,
      examMax: 60,
      components: [
        { name: "CA 1", maxScore: 20 },
        { name: "CA 2", maxScore: 20 },
      ],
    },
  });
  expect(made.status, made.text).toBe(201);
  schemeId = made.json.data.assessmentScheme.id;

  // Teachers: one assigned Maths in class A, one only in class B, and one in no class at all.
  for (const [key, arm] of [
    ["teacher", armA],
    ["teacherB", armB],
    ["teacherNone", null],
  ] as const) {
    const user = await signIn(key, `Imp ${key}`, Role.TEACHING_STAFF);
    const staff = await db.staffRecord.create({
      data: { tenantId: t.id, userId: user.id, category: "TEACHING", firstName: key, lastName: "Imp" },
    });
    if (arm) await db.staffSubjectAssignment.create({ data: { tenantId: t.id, staffRecordId: staff.id, subjectId, classArmId: arm } });
  }
  await db.staffSubjectAssignment.create({
    data: {
      tenantId: t.id,
      staffRecordId: (await db.staffRecord.findFirstOrThrow({ where: { tenantId: t.id, firstName: "teacher" } })).id,
      subjectId,
      classArmId: armN,
    },
  });

  await makePupil("ada", armA, { first: "Ada" });
  await makePupil("bayo", armA, { first: "Bayo" });
  await makePupil("chi", armA, { first: "Chi" });
  await makePupil("dayo", armA, { first: "Dayo" });
  await makePupil("onB", armB);
  await makePupil("nobody", null);
  await makePupil("withdrawn", armA, { status: "WITHDRAWN" });
  await makePupil("noScheme", armN, { first: "Nell" });
  outsiderAdm = (await makePupil("outsider", null, { tenant: other })).admissionNo;
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("the template", () => {
  test("is the sheet as a CSV file: a header with each part and its maximum, a row per pupil on the roll, UTF-8 with a byte-order mark, never cached", async () => {
    for (const who of ["admin", "teacher"]) {
      const res = await template(who);
      expect(res.status, who).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-row-count")).toBe("4");
      expect(res.headers.get("content-disposition")).toMatch(
        /^attachment; filename="marks-Form-A-[A-Za-z0-9]+-A-Mathematics-First-Term\.csv"$/,
      );
      expect([...res.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = res.bytes.toString("utf8").slice(1).trim().split("\r\n");
      expect(lines[0]).toBe(HEADER);
      // Ada, Bayo, Chi and Dayo are on the roll; the pupil of class B, the one on no roll and the withdrawn pupil are not.
      expect(
        lines
          .slice(1)
          .map((l) => l.split(",")[0])
          .sort(),
      ).toEqual(["ada", "bayo", "chi", "dayo"].map((k) => pupils[k].adm).sort());
      expect(res.text).not.toContain(pupils.withdrawn.adm);
      expect(res.text).not.toContain(pupils.onB.adm);
      expect(res.text).not.toContain(pupils.outsider.adm);
    }
  });
  test("who may: the administrator and a teacher assigned to this subject in this class; nobody else", async () => {
    for (const who of ["teacherB", "teacherNone", "registrar", "campusAdmin", "student", "parent", "stranger"]) {
      const res = await template(who);
      expect([403, 404], `${who}: ${res.status}`).toContain(res.status);
      expect(res.text, who).not.toContain(pupils.ada.adm);
    }
    expect((await api(`${base()}/import-template?${sheetQuery()}`, SAAS)).status).toBe(401);
    expect((await template("admin", "nonexistent0000000000000000")).status).toBe(404);
  });
  test("a class with no scheme has one column, Mark, out of 100", async () => {
    const res = await template("admin", armN);
    expect(res.bytes.toString("utf8").slice(1).split("\r\n")[0]).toBe("admission_no,name,Mark (100)");
  });
  test("a name that starts like a spreadsheet formula is written as text", async () => {
    const bad = await makePupil("formula", armA, { first: "=HYPERLINK(1)" });
    const res = await template("admin");
    expect(res.text).toContain("'=HYPERLINK(1) Imp");
    expect(res.text).not.toMatch(/(^|,)=HYPERLINK/m);
    await db.studentEnrollment.deleteMany({ where: { tenantId: t.id, studentId: bad.id } });
  });
});

test.describe("a check", () => {
  test("judges every row, writes nothing and does not lock the scheme", async () => {
    const res = await imp("teacher", csv(`${pupils.ada.adm},x,15,16,50`, `${pupils.bayo.adm},x,,,`, `${pupils.chi.adm},x,10,10,10`), {
      dryRun: true,
    });
    const report = reportOf(res);
    expect(report).toMatchObject({ dryRun: true, committed: false, toWrite: 2, notInFile: 1 });
    expect(report.counts).toEqual({ rows: 3, new: 2, changed: 0, unchanged: 0, blank: 1, errors: 0 });
    expect(report.rows.map((r) => [r.status, r.total])).toEqual([
      ["new", 81],
      ["blank", null],
      ["new", 30],
    ]);
    expect(await results()).toHaveLength(0);
    expect(await locked()).toBe(false);
    expect(await importAudits()).toHaveLength(0);
  });
  test("the same file as a real run is judged the same way", async () => {
    // Nothing was written by the check above, so this file's rows are still new: check and real run agree on every row (the real run is below).
    const text = csv(`${pupils.ada.adm},x,15,16,50`);
    const a = reportOf(await imp("admin", text, { dryRun: true }));
    expect(a.rows.map((r) => r.status)).toEqual(["new"]);
  });
});

test.describe("all or nothing", () => {
  test("one row with a problem and nothing is saved, even when the others are fine; every problem is reported at once", async () => {
    const text = csv(
      `${pupils.ada.adm},x,15,16,50`,
      `${pupils.bayo.adm},x,99,16,50`, // above its maximum
      `${pupils.chi.adm},x,10,,10`, // half filled
      `Z/NOBODY,x,1,1,1`,
      `${pupils.dayo.adm},x,10,10,10`,
    );
    for (const dryRun of [true, false]) {
      const report = reportOf(await imp("teacher", text, { dryRun }));
      expect(report.committed).toBe(false);
      expect(report.counts).toEqual({ rows: 5, new: 2, changed: 0, unchanged: 0, blank: 0, errors: 3 });
      expect(report.rows.filter((r) => r.status === "error").map((r) => r.problems[0])).toEqual([
        "CA 1: at most 20.",
        "Fill every part, or leave the whole row blank.",
        "No pupil with this admission number is on the roll of this class for this term.",
      ]);
    }
    expect(await results()).toHaveLength(0);
    expect(await locked()).toBe(false);
    expect(await importAudits()).toHaveLength(0);
  });
  test("a header that is wrong says so and judges no row", async () => {
    const report = reportOf(await imp("teacher", `admission_no,CA 1,Behaviour\r\n${pupils.ada.adm},1,2\r\n`, { dryRun: false }));
    expect(report.committed).toBe(false);
    expect(report.rows).toEqual([]);
    expect(report.headerProblems.join("\n")).toMatch(/Unknown column "Behaviour"/);
    expect(report.headerProblems.join("\n")).toMatch(/needs a column for "CA 2 \(20\)"/);
    expect(await results()).toHaveLength(0);
  });
  test("a pupil who is not on this roll is refused in the same words whoever they are: another class, no class, withdrawn, another school's, a number that does not exist", async () => {
    const same = "No pupil with this admission number is on the roll of this class for this term.";
    const report = reportOf(
      await imp(
        "admin",
        csv(
          `${pupils.onB.adm},x,1,1,1`,
          `${pupils.nobody.adm},x,1,1,1`,
          `${pupils.withdrawn.adm},x,1,1,1`,
          `${outsiderAdm},x,1,1,1`,
          `NO/SUCH/9,x,1,1,1`,
        ),
        { dryRun: true },
      ),
    );
    expect(report.rows.map((r) => r.problems)).toEqual(Array(5).fill([same]));
    expect(report.rows.map((r) => r.name)).toEqual(Array(5).fill(null));
  });
});

test.describe("a real run", () => {
  const file = () => csv(`${pupils.ada.adm},x,15,16,50`, `${pupils.bayo.adm},x,10,12,40`, `${pupils.chi.adm},x,,,`);
  test("saves the new rows as drafts through the writer: the scheme's parts and total, the scheme locked once, an audit row without the marks", async () => {
    const res = await imp("teacher", file());
    const report = reportOf(res);
    expect(report).toMatchObject({ dryRun: false, committed: true, toWrite: 2 });
    expect(report.counts).toEqual({ rows: 3, new: 2, changed: 0, unchanged: 0, blank: 1, errors: 0 });

    const rows = await results();
    expect(rows).toHaveLength(2);
    const ada = rows.find((r) => r.studentId === pupils.ada.id)!;
    expect(ada).toMatchObject({ status: "DRAFT", maxScore: expect.anything() });
    expect(Number(ada.score)).toBe(81);
    expect(Number(ada.maxScore)).toBe(100);
    expect(ada.componentScores).toEqual([
      { name: "CA 1", score: 15, maxScore: 20 },
      { name: "CA 2", score: 16, maxScore: 20 },
      { name: "Exam", score: 50, maxScore: 60 },
    ]);
    expect(ada.verificationToken).toMatch(/^[0-9a-f]{32}$/);
    // Chi's row was blank: nothing was written for Chi.
    expect(rows.some((r) => r.studentId === pupils.chi.id)).toBe(false);

    expect(await locked()).toBe(true);
    expect(await db.auditLog.count({ where: { tenantId: t.id, action: "ASSESSMENT_SCHEME_LOCKED", targetId: schemeId } })).toBe(1);
    const audits = await importAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0].targetId).toBe(armA);
    expect(audits[0].afterValue).toEqual({
      periodId,
      subjectId,
      rows: 3,
      new: 2,
      changed: 0,
      unchanged: 0,
      blank: 1,
      fileSha256: crypto.createHash("sha256").update(file(), "utf8").digest("hex"),
    });
    expect(report.fileHash).toBe(crypto.createHash("sha256").update(file(), "utf8").digest("hex"));
    // The audit names no mark and no pupil.
    const text = JSON.stringify(audits[0]);
    for (const secret of [pupils.ada.adm, pupils.ada.first, "15", "16", "50"]) expect(text, secret).not.toContain(`"${secret}"`);
  });

  test("the same file again changes nothing: every row is unchanged or left blank, no write, no second audit row", async () => {
    const before = await results();
    const report = reportOf(await imp("teacher", file()));
    expect(report).toMatchObject({ committed: false, toWrite: 0 });
    expect(report.counts).toEqual({ rows: 3, new: 0, changed: 0, unchanged: 2, blank: 1, errors: 0 });
    const after = await results();
    expect(after.map((r) => r.updatedAt.toISOString())).toEqual(before.map((r) => r.updatedAt.toISOString()));
    expect(await importAudits()).toHaveLength(1);
  });

  test("the downloaded template, unedited, is also unchanged: a file can be edited and imported again", async () => {
    const downloaded = (await template("admin")).bytes.toString("utf8");
    const report = reportOf(await imp("admin", downloaded));
    expect(report.counts.errors).toBe(0);
    expect(report.counts.new + report.counts.changed).toBe(0);
    expect(report.counts.unchanged).toBe(2);
    expect(report.committed).toBe(false);
  });

  test("a changed mark is written, the old total is shown, and the writer's own score audit records it", async () => {
    const text = csv(`${pupils.ada.adm},x,15,16,54`, `${pupils.dayo.adm},x,20,20,60`);
    const check = reportOf(await imp("admin", text, { dryRun: true }));
    expect(check.rows.map((r) => [r.status, r.total, r.savedTotal])).toEqual([
      ["changed", 85, 81],
      ["new", 100, null],
    ]);
    const report = reportOf(await imp("admin", text));
    expect(report).toMatchObject({ committed: true, toWrite: 2 });
    const ada = (await results()).find((r) => r.studentId === pupils.ada.id)!;
    expect(Number(ada.score)).toBe(85);
    const history = await db.resultAudit.findMany({ where: { tenantId: t.id, resultId: ada.id } });
    expect(history.map((h) => [Number(h.fromScore), Number(h.toScore)])).toEqual([[81, 85]]);
    expect(await importAudits()).toHaveLength(2);
    expect(await db.auditLog.count({ where: { tenantId: t.id, action: "ASSESSMENT_SCHEME_LOCKED", targetId: schemeId } })).toBe(1); // locked once
  });

  test("a result that has left DRAFT cannot be changed by a file: the row is refused and says why, and nothing at all is saved; an identical row is quiet", async () => {
    const ada = (await results()).find((r) => r.studentId === pupils.ada.id)!;
    const sent = await api(`${base()}/transition`, {
      ...SAAS,
      cookie: cookie.admin,
      method: "POST",
      body: { resultIds: [ada.id], toStatus: "SUBMITTED" },
    });
    expect(sent.status, sent.text).toBe(200);
    const before = await results();
    const report = reportOf(await imp("admin", csv(`${pupils.ada.adm},x,1,1,1`, `${pupils.chi.adm},x,5,5,5`)));
    expect(report.committed).toBe(false);
    expect(report.rows[0].status).toBe("error");
    expect(report.rows[0].problems[0]).toBe(
      "This pupil's marks are sent for review, so they cannot be changed here. They must be back in draft first.",
    );
    expect(report.rows[1].status).toBe("new"); // fine in itself, but one problem stops the file
    expect((await results()).length).toBe(before.length);
    // The same marks as saved are not a problem.
    const quiet = reportOf(await imp("admin", csv(`${pupils.ada.adm},x,15,16,54`)));
    expect(quiet.counts).toMatchObject({ unchanged: 1, errors: 0 });
  });
});

test.describe("who may import", () => {
  const text = () => csv(`${pupils.bayo.adm},x,1,1,1`);
  test("the administrator and the teacher assigned to this subject in this class; no one else, and nothing is written", async () => {
    const before = (await results()).length;
    for (const who of ["teacherB", "teacherNone", "registrar", "campusAdmin", "student", "parent", "stranger"]) {
      const res = await imp(who, text(), { dryRun: false });
      expect([403, 404], `${who}: ${res.status} ${res.text.slice(0, 120)}`).toContain(res.status);
      expect(res.text, who).not.toContain(pupils.bayo.adm);
    }
    expect(
      (
        await api(`${base()}/import`, {
          ...SAAS,
          method: "POST",
          body: { periodId, classArmId: armA, subjectId, csv: text(), dryRun: true },
        })
      ).status,
    ).toBe(401);
    expect((await results()).length).toBe(before);
  });
  test("a teacher of another class cannot reach this class by naming its pupils in a file of their own class", async () => {
    // teacherB is assigned to class B, so class B's sheet is theirs, and this class's pupils are not on its roll.
    const res = await imp("teacherB", csv(`${pupils.ada.adm},x,1,1,1`), { dryRun: true, classArmId: armB });
    expect(res.status).toBe(200);
    expect(reportOf(res).rows[0].problems[0]).toMatch(/^No pupil with this admission number is on the roll of this class/);
  });
  test("an id that is not an id, a class of another school and a missing field are each refused before anything is read", async () => {
    expect((await imp("admin2", text(), { classArmId: "not an id!" })).status).toBe(400);
    expect((await imp("admin2", text(), { periodId: "" })).status).toBe(400);
    expect((await imp("admin2", text(), { classArmId: "cm0000000000000000000000x" })).status).toBe(404);
    const missing = await api(`${base()}/import`, {
      ...SAAS,
      cookie: cookie.admin2,
      method: "POST",
      body: { periodId, classArmId: armA, subjectId, csv: text() },
    });
    expect(missing.status).toBe(400);
    expect(missing.text).toMatch(/check \(true\) or the real import \(false\)/);
    const extra = await api(`${base()}/import`, {
      ...SAAS,
      cookie: cookie.admin2,
      method: "POST",
      body: { periodId, classArmId: armA, subjectId, csv: text(), dryRun: true, force: true },
    });
    expect(extra.status).toBe(400);
  });
});

test.describe("limits", () => {
  test("a file over 1 MB is refused with a sentence; a file of more than 1,000 rows is refused with the count", async () => {
    const big = await imp("admin3", `${HEADER}\r\n${"x".repeat(1024 * 1024 + 1)}`, { dryRun: true });
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe("TOO_LARGE");
    expect(big.json.error.message).toBe("That file is too large. A marks file can be at most 1024 KB.");
    const many = await imp("admin3", csv(...Array.from({ length: 1001 }, (_, i) => `N/${i},x,,,`)), { dryRun: true });
    expect(many.status).toBe(400);
    expect(many.json.error.code).toBe("TOO_MANY_ROWS");
    expect(many.json.error.message).toBe("That file has 1001 rows. A file can have at most 1000; split it and import the parts.");
    // exactly 1,000 is fine
    const full = reportOf(await imp("admin3", csv(...Array.from({ length: 1000 }, (_, i) => `N/${i},x,,,`)), { dryRun: true }));
    expect(full.counts.rows).toBe(1000);
  });
  test("a file that is not CSV, and an empty one, are said in words with nothing written", async () => {
    const broken = reportOf(await imp("admin3", 'admission_no,"CA 1\r\nx,1', { dryRun: true }));
    expect(broken.headerProblems[0]).toMatch(/not a valid CSV file/);
    const empty = reportOf(await imp("admin3", "", { dryRun: true }));
    expect(empty.headerProblems[0]).toMatch(/file is empty/);
  });
  test("twelve imports a window for one person; the next is told to wait", async () => {
    const user = await signIn("limited", "Imp Limited", Role.ADMIN);
    void user;
    let last = 0;
    for (let i = 0; i < 13; i++) last = (await imp("limited", csv(`${pupils.dayo.adm},x,,,`), { dryRun: true })).status;
    expect(last).toBe(429);
  });
});

test.describe("a class with no scheme", () => {
  test("the one Mark column is out of 100, and an import saves it as a single score", async () => {
    const text = `admission_no,Mark (100)\r\n${pupils.noScheme.adm},72.5\r\n`;
    const res = await imp("teacher", text, { classArmId: armN });
    expect(reportOf(res)).toMatchObject({ committed: true, toWrite: 1 });
    const row = await db.result.findFirstOrThrow({ where: { tenantId: t.id, studentId: pupils.noScheme.id } });
    expect(Number(row.score)).toBe(72.5);
    expect(Number(row.maxScore)).toBe(100);
    const refused = reportOf(
      await imp("teacher", `admission_no,Mark (100)\r\n${pupils.noScheme.adm},101\r\n`, { classArmId: armN, dryRun: true }),
    );
    expect(refused.rows[0].problems).toEqual(["Mark: at most 100."]);
  });
});

test.describe("two imports at once", () => {
  test("the same file sent twice at the same moment leaves one result per pupil, and nothing is lost", async () => {
    const text = csv(`${pupils.chi.adm},x,5,6,7`);
    const [a, b] = await Promise.all([imp("admin2", text), imp("teacher", text)]);
    expect([a.status, b.status].sort(), `${a.text.slice(0, 200)} | ${b.text.slice(0, 200)}`).toEqual([200, 200]);
    const rows = (await results()).filter((r) => r.studentId === pupils.chi.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].score)).toBe(18);
  });
});
