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
import { pdfDeclaredPages, pdfLinks, pdfPages, pdfProblems } from "../support/pdf";

// Report cards as PDF (task 0038) over real HTTP: who may download whose, that a file says exactly what the card on the screen says and no more (the payment gate, the results a pupil is shown, the
// remarks), the class file, the limits, and the audit. Every card is also a well-formed PDF whose text is read back.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
const user: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let session: { id: string };
let period: { id: string; label: string };
let armA: { id: string; name: string };
let armB: { id: string };
let subject: { id: string };
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "PDF School", campuses: ["North"] });
  b = await createTenant({ name: "Other PDF School" });
  for (const who of ["admin", "teacher", "stranger", "clerk", "adminB"]) user[who] = await createUser({ name: who });
  await addMembership(user.admin.id, a.id, Role.ADMIN);
  await addMembership(user.teacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(user.stranger.id, a.id, Role.TEACHING_STAFF);
  await addMembership(user.clerk.id, a.id, Role.NON_TEACHING_STAFF);
  await addMembership(user.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(user)) cookie[who] = cookieHeader((await loginAs(user[who], SAAS)).token!);
  session = await db.academicSession.create({
    data: { tenantId: a.id, label: uniq("PS"), startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  period = await db.academicPeriod.create({
    data: {
      tenantId: a.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
      isCurrent: true,
    },
  });
  const groupA = await db.classGroup.create({ data: { tenantId: a.id, name: "JSS 1", sortOrder: 1 } });
  const groupB = await db.classGroup.create({ data: { tenantId: a.id, name: "JSS 2", sortOrder: 2 } });
  armA = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupA.id, name: "A" } });
  armB = await db.classArm.create({ data: { tenantId: a.id, classGroupId: groupB.id, name: "A" } });
  subject = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics" } });
  const staff = await db.staffRecord.create({
    data: { tenantId: a.id, userId: user.teacher.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
  });
  await db.staffSubjectAssignment.create({ data: { tenantId: a.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: armA.id } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.afterEach(async () => {
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "results.reportCardsOpen" } });
});

type ResultStatus = "DRAFT" | "PUBLISHED" | "LOCKED";
async function viewer(role: Role): Promise<{ key: string; id: string }> {
  const created = await createUser({ name: uniq("v") });
  await addMembership(created.id, a.id, role);
  const key = uniq("viewer");
  cookie[key] = cookieHeader((await loginAs(created, SAAS)).token!);
  return { key, id: created.id };
}
/// A pupil on the roll of an arm with a result in the given status (none when null), who can sign in and has a guardian who can.
async function pupil(over: { arm?: { id: string }; status?: ResultStatus | null; first?: string; last?: string } = {}) {
  const pupilV = await viewer(Role.STUDENT);
  const parentV = await viewer(Role.PARENT);
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      firstName: over.first ?? uniq("Pu"),
      lastName: over.last ?? "Pdf",
      dateOfBirth: new Date("2014-05-05"),
      admissionNo: uniq("PD/"),
      userId: pupilV.id,
    },
  });
  await db.studentEnrollment.create({
    data: { tenantId: a.id, sessionId: session.id, classArmId: (over.arm ?? armA).id, studentId: record.id, status: "ACTIVE" },
  });
  if (over.status !== null)
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: record.id,
        subjectId: subject.id,
        periodId: period.id,
        score: 70,
        status: over.status ?? "PUBLISHED",
        verificationToken: crypto.randomBytes(16).toString("hex"),
        gradeLetter: "B",
        gradeRemark: "Good",
      },
    });
  const guardian = await db.guardianRecord.create({ data: { tenantId: a.id, userId: parentV.id, firstName: "Amina", lastName: "Pdf" } });
  await db.guardianLink.create({
    data: { tenantId: a.id, studentId: record.id, guardianId: guardian.id, relationship: "MOTHER", status: "APPROVED", isPrimary: true },
  });
  return { id: record.id, admissionNo: record.admissionNo, pupil: pupilV.key, parent: parentV.key };
}
const pdfUrl = (studentId: string, periodId = period.id) => `${school()}/people/students/${studentId}/report-card/pdf?periodId=${periodId}`;
const get = (who: string, studentId: string, periodId?: string) => api(pdfUrl(studentId, periodId), as(who));
const classUrl = (armId = armA.id, periodId = period.id) =>
  `${school()}/academics/results/report-cards/pdf?periodId=${periodId}&classArmId=${armId}`;
const audits = (action: string, targetId: string) =>
  db.auditLog.findMany({ where: { tenantId: a.id, action, targetId }, orderBy: { createdAt: "asc" } });
const isPdf = (res: { status: number; headers: Headers; bytes: Buffer }) =>
  res.status === 200 && res.headers.get("content-type") === "application/pdf" && res.bytes.subarray(0, 8).toString("latin1") === "%PDF-1.4";
const textOf = (res: { bytes: Buffer }) => pdfPages(res.bytes).join("\n");

test.describe("one pupil's card", () => {
  test("staff, the pupil and the parent each download it as a well-formed PDF with the right headers and the card's facts", async () => {
    const p = await pupil({ first: "Amaka", last: "Okoro" });
    for (const who of ["admin", "teacher", "clerk", p.pupil, p.parent]) {
      const res = await get(who, p.id);
      expect(isPdf(res), `${who}: ${res.status} ${res.text.slice(0, 80)}`).toBe(true);
      expect(pdfProblems(res.bytes), who).toEqual([]);
      expect(res.headers.get("content-disposition"), who).toBe(
        `attachment; filename="report-card-${p.admissionNo.replace(/[^A-Za-z0-9]+/g, "-")}-First-Term.pdf"`,
      );
      expect(res.headers.get("cache-control"), who).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options"), who).toBe("nosniff");
      expect(res.headers.get("x-report-card-unsupported-characters"), who).toBe("0");
      const text = textOf(res);
      for (const expected of [
        "PDF SCHOOL",
        "TERM REPORT",
        "Amaka Okoro",
        p.admissionNo,
        "JSS 1 A",
        "Mathematics",
        "70 / 100",
        "Page 1 of 1",
      ])
        expect(text, `${who} ${expected}`).toContain(expected);
    }
  });

  test("the card carries a full, clickable verification link to the public check page for each published mark, and never an API address", async () => {
    const p = await pupil({ first: "Link", last: "Tester" });
    const token = (await db.result.findFirstOrThrow({ where: { tenantId: a.id, studentId: p.id } })).verificationToken!;
    const res = await get("admin", p.id);
    expect(isPdf(res)).toBe(true);
    expect(pdfProblems(res.bytes)).toEqual([]);
    // The address the app is served from (APP_URL), not a path the reader would have to complete.
    expect(pdfLinks(res.bytes).map((l) => l.url)).toEqual([`${SAAS_URL}/verify/${token}`]);
    const text = textOf(res);
    expect(text).toContain(`${SAAS_URL}/verify/${token}`);
    expect(text).toContain(`go to ${SAAS_URL}/verify and type the code`);
    expect(text).not.toContain("/api/");
    // A mark that is not published has no link: the draft shows no code (the card says it is not official).
    await db.result.updateMany({ where: { tenantId: a.id, studentId: p.id }, data: { status: "DRAFT", verificationToken: null } });
    const draft = await get("admin", p.id);
    expect(pdfLinks(draft.bytes)).toEqual([]);
    expect(textOf(draft)).not.toContain("/verify/");
    expect(textOf(draft)).not.toContain("VERIFICATION LINKS");
  });

  test("who may not: another pupil's card, a teacher of another arm or none, a stranger, nobody signed out, another school's administrator, an id that is not one", async () => {
    const mine = await pupil();
    const other = await pupil({ arm: armB });
    expect((await get(mine.pupil, other.id)).status).toBe(403);
    expect((await get(mine.parent, other.id)).status).toBe(403);
    for (const who of ["teacher", "stranger"]) {
      const res = await get(who, other.id);
      expect(res.status, who).toBe(404);
      expect(res.headers.get("content-type")).toContain("json");
    }
    expect((await api(pdfUrl(mine.id), SAAS)).status).toBe(401);
    expect((await get("adminB", mine.id)).status).toBe(403);
    expect((await api(pdfUrl(mine.id).replace(a.code, b.code), as("adminB"))).status).toBe(404);
    for (const id of ["no-such-pupil", `a${String.fromCharCode(0)}b`]) expect((await get("admin", id)).status, id).toBe(404);
    expect((await api(`${school()}/people/students/${mine.id}/report-card/pdf`, as("admin"))).status).toBe(400);
    expect((await get("admin", mine.id, "no-such-term-id")).status).toBe(404);
  });

  test("a pupil and a parent are given published and locked results only; staff get the draft too, with a warning that it is not official", async () => {
    const draft = await pupil({ status: "DRAFT" });
    for (const who of [draft.pupil, draft.parent]) {
      const text = textOf(await get(who, draft.id));
      expect(text, who).toContain("No marks have been published for this term yet.");
      expect(text, who).not.toContain("Mathematics");
    }
    const staffText = textOf(await get("admin", draft.id));
    expect(staffText).toContain("Mathematics");
    expect(staffText).toContain("Not official: some of these marks are not yet published.");
    // A result the term has locked is a published one: the pupil's file has it (the bug of task 0036, again, in the PDF).
    const locked = await pupil({ status: "LOCKED" });
    for (const who of [locked.pupil, locked.parent]) expect(textOf(await get(who, locked.id)), who).toContain("Mathematics");
    expect(textOf(await get("admin", locked.id))).not.toContain("Not official");
  });

  test("the remarks: staff see them as they are written, a pupil and a parent only once the results are published", async () => {
    const p = await pupil({ status: "DRAFT" });
    await db.reportRemark.create({
      data: {
        tenantId: a.id,
        studentId: p.id,
        periodId: period.id,
        teacherRemark: "Works hard.\nHelps others.",
        teacherRemarkByUserId: user.admin.id,
        principalRemark: "A pleasure.",
        principalRemarkByUserId: user.admin.id,
      },
    });
    expect(textOf(await get("admin", p.id))).toContain("Works hard.\nHelps others.");
    for (const who of [p.pupil, p.parent]) expect(textOf(await get(who, p.id)), `${who} before`).not.toContain("Works hard.");
    await db.result.updateMany({ where: { studentId: p.id }, data: { status: "PUBLISHED" } });
    for (const who of [p.pupil, p.parent]) {
      const text = textOf(await get(who, p.id));
      expect(text, `${who} after`).toContain("TEACHER'S REMARK");
      expect(text, `${who} after`).toContain("Works hard.\nHelps others.");
      expect(text, `${who} after`).toContain("A pleasure.");
    }
  });

  test("the payment gate holds the file as it holds the card: a pupil and a parent get the same 403, no PDF and no mark; staff still get it", async () => {
    const p = await pupil();
    await db.invoice.create({
      data: {
        tenantId: a.id,
        studentId: p.id,
        periodId: period.id,
        invoiceNo: uniq("INV-"),
        totalAmount: 30000,
        amountPaid: 0,
        status: "UNPAID",
        dueDate: new Date("2026-09-30"),
      },
    });
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "results.reportCardsOpen", value: false, updatedById: user.admin.id },
    });
    for (const who of [p.pupil, p.parent]) {
      const res = await get(who, p.id);
      expect(res.status, who).toBe(403);
      expect(res.headers.get("content-type")).toContain("json");
      expect(res.json.error.code).toBe("REPORT_CARD_WITHHELD");
      expect(res.json.error.message).toBe(
        "This report card is being held until the outstanding school fees of ₦30,000 are paid. Please contact the school office.",
      );
      expect(res.text).not.toMatch(/%PDF|Mathematics|70/);
    }
    for (const who of ["admin", "teacher", "clerk"]) expect(isPdf(await get(who, p.id)), who).toBe(true);
    expect(await audits("REPORT_CARD_PDF_DOWNLOADED", p.id)).toHaveLength(3); // the refusals are not downloads
  });

  test("a name with letters outside Latin-1 is written without their marks and nothing is a question mark; letters the fonts lack are counted in a header", async () => {
    const yoruba = await pupil({ first: "Ọ̀lá", last: "Ṣéyí" });
    const res = await get("admin", yoruba.id);
    expect(res.headers.get("x-report-card-unsupported-characters")).toBe("0");
    expect(textOf(res)).toContain("Ol\u00e1 S\u00e9y\u00ed");
    const arabic = await pupil({ first: "أحمد", last: "Obi" });
    expect(Number((await get("admin", arabic.id)).headers.get("x-report-card-unsupported-characters"))).toBe(4);
  });

  test("a download is audited with who, the role and the pages; the same person again is a second row", async () => {
    const p = await pupil();
    expect(await audits("REPORT_CARD_PDF_DOWNLOADED", p.id)).toHaveLength(0);
    await get(p.parent, p.id);
    await get("admin", p.id);
    const rows = await audits("REPORT_CARD_PDF_DOWNLOADED", p.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actorUserId: expect.any(String),
      targetType: "StudentRecord",
      afterValue: { periodId: period.id, role: "PARENT", pages: 1 },
    });
    expect(rows[1].afterValue).toMatchObject({ role: "ADMIN" });
    expect(JSON.stringify(rows)).not.toMatch(/Mathematics|Works hard/);
  });
});

test.describe("a class's cards in one file", () => {
  test("the administrator and the teacher of the arm get one page per pupil, in the roll's order, with the headers and one audit row", async () => {
    await db.studentEnrollment.updateMany({ where: { tenantId: a.id, classArmId: armA.id }, data: { status: "WITHDRAWN" } });
    const ps = [
      await pupil({ first: "Ada", last: "Zed" }),
      await pupil({ first: "Bayo", last: "Alpha" }),
      await pupil({ first: "Chi", last: "Mid" }),
    ];
    for (const who of ["admin", "teacher"]) {
      const res = await api(classUrl(), as(who));
      expect(isPdf(res), `${who}: ${res.status} ${res.text.slice(0, 80)}`).toBe(true);
      expect(pdfProblems(res.bytes)).toEqual([]);
      expect(res.headers.get("x-report-card-count")).toBe("3");
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="report-cards-JSS-1-A-First-Term.pdf"');
      const pages = pdfPages(res.bytes);
      expect(pages).toHaveLength(3);
      expect(pdfDeclaredPages(res.bytes)).toBe(3);
      ["Bayo Alpha", "Chi Mid", "Ada Zed"].forEach((name, i) => expect(pages[i], `${who} page ${i + 1}`).toContain(name)); // by surname, as the class list is
      pages.forEach((page, i) => expect(page).toContain(`Page ${i + 1} of 3`));
    }
    const rows = await audits("REPORT_CARDS_PDF_DOWNLOADED", armA.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].afterValue).toEqual({ periodId: period.id, pupils: 3, pages: 3 });
    expect(ps).toHaveLength(3);
  });

  test("who may: staff only; a teacher of another arm and a pupil or parent may not; an unknown class or term is the same 404", async () => {
    const p = await pupil();
    const forbid = await api(classUrl(), as(p.pupil));
    expect(forbid.status).toBe(403);
    expect((await api(classUrl(), as(p.parent))).status).toBe(403);
    expect((await api(classUrl(armB.id), as("teacher"))).status).toBe(404);
    expect((await api(classUrl(), as("stranger"))).status).toBe(404);
    expect((await api(classUrl(), SAAS)).status).toBe(401);
    expect((await api(classUrl(), as("adminB"))).status).toBe(403);
    expect((await api(classUrl("no-such-arm"), as("admin"))).status).toBe(404);
    expect((await api(classUrl(armA.id, "no-such-term"), as("admin"))).status).toBe(404);
    expect((await api(`${school()}/academics/results/report-cards/pdf?periodId=${period.id}`, as("admin"))).status).toBe(400);
    expect((await api(classUrl(), as("clerk"))).status).toBe(200);
  });

  test("the payment gate does not hold staff: the class file has every pupil, including one the school holds from the parents", async () => {
    await db.studentEnrollment.updateMany({ where: { tenantId: a.id, classArmId: armB.id }, data: { status: "WITHDRAWN" } });
    const owes = await pupil({ arm: armB, first: "Debtor", last: "One" });
    await db.invoice.create({
      data: {
        tenantId: a.id,
        studentId: owes.id,
        periodId: period.id,
        invoiceNo: uniq("INV-"),
        totalAmount: 100,
        amountPaid: 0,
        status: "UNPAID",
        dueDate: new Date("2026-09-30"),
      },
    });
    await db.tenantSetting.create({
      data: { tenantId: a.id, campusId: null, key: "results.reportCardsOpen", value: false, updatedById: user.admin.id },
    });
    expect((await get(owes.parent, owes.id)).status).toBe(403);
    const res = await api(classUrl(armB.id), as("admin"));
    expect(isPdf(res)).toBe(true);
    expect(textOf(res)).toContain("Debtor One");
  });

  test("an empty class says so; a class of more than 100 pupils is refused with a sentence and no file", async () => {
    const empty = await db.classArm.create({
      data: {
        tenantId: a.id,
        classGroupId: (await db.classGroup.create({ data: { tenantId: a.id, name: uniq("Empty-"), sortOrder: 9 } })).id,
        name: "A",
      },
    });
    const none = await api(classUrl(empty.id), as("admin"));
    expect(none.status).toBe(404);
    expect(none.json.error.message).toBe("Nobody was on the roll of this class for this term.");
    const big = await db.classArm.create({
      data: {
        tenantId: a.id,
        classGroupId: (await db.classGroup.create({ data: { tenantId: a.id, name: uniq("Big-"), sortOrder: 8 } })).id,
        name: "A",
      },
    });
    const students = Array.from({ length: 101 }, (_, i) => ({
      tenantId: a.id,
      firstName: `Big${i}`,
      lastName: "Class",
      dateOfBirth: new Date("2014-05-05"),
      admissionNo: uniq("BG/"),
    }));
    await db.studentRecord.createMany({ data: students });
    const made = await db.studentRecord.findMany({
      where: { tenantId: a.id, lastName: "Class", firstName: { startsWith: "Big" } },
      select: { id: true },
    });
    await db.studentEnrollment.createMany({
      data: made.map((s) => ({ tenantId: a.id, sessionId: session.id, classArmId: big.id, studentId: s.id, status: "ACTIVE" as const })),
    });
    const tooMany = await api(classUrl(big.id), as("admin"));
    expect(tooMany.status).toBe(409);
    expect(tooMany.headers.get("content-type")).toContain("json");
    expect(tooMany.json.error.message).toBe("This class has 101 pupils; a file holds at most 100 report cards.");
    expect(await audits("REPORT_CARDS_PDF_DOWNLOADED", big.id)).toHaveLength(0);
  });
});
