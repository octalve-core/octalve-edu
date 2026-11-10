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

// Report remarks (task 0036) over real HTTP: who writes which remark, what is refused and in which words, the freeze once anything is published, who is shown what on the card, and the school
// boundary. Also the bug of task 0031 found on the way: a pupil's card went empty when the term's results were locked.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
const user: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let session: { id: string };
let period: { id: string };
let armNorth: { id: string };
let armOther: { id: string };
let subject: { id: string };
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;

type ResultStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PUBLISHED" | "LOCKED";

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Remarks School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Remarks School" });
  for (const who of ["admin", "teacher", "stranger", "clerk", "adminB"]) user[who] = await createUser({ name: who });
  await addMembership(user.admin.id, a.id, Role.ADMIN);
  await addMembership(user.teacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(user.stranger.id, a.id, Role.TEACHING_STAFF);
  await addMembership(user.clerk.id, a.id, Role.NON_TEACHING_STAFF);
  await addMembership(user.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(user)) cookie[who] = cookieHeader((await loginAs(user[who], SAAS)).token!);

  session = await db.academicSession.create({
    data: { tenantId: a.id, label: uniq("RS"), startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
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
  const north = await db.classGroup.create({ data: { tenantId: a.id, name: uniq("JSS1-"), sortOrder: 1 } });
  const other = await db.classGroup.create({ data: { tenantId: a.id, name: uniq("JSS2-"), sortOrder: 2 } });
  armNorth = await db.classArm.create({ data: { tenantId: a.id, classGroupId: north.id, name: "A" } });
  armOther = await db.classArm.create({ data: { tenantId: a.id, classGroupId: other.id, name: "A" } });
  subject = await db.subject.create({ data: { tenantId: a.id, name: uniq("Maths") } });
  // the teacher teaches the first arm only; the stranger teaches nothing
  const staff = await db.staffRecord.create({
    data: { tenantId: a.id, userId: user.teacher.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
  });
  await db.staffSubjectAssignment.create({
    data: { tenantId: a.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: armNorth.id },
  });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

/// A pupil on the roll of an arm for the session, with one result for the term in the given status (none when null).
async function pupil(
  arm = armNorth,
  status: ResultStatus | null = "DRAFT",
  userId: string | null = null,
  extra: Record<string, unknown> = {},
) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      firstName: uniq("Pu"),
      lastName: "Remark",
      dateOfBirth: new Date("2014-05-05"),
      admissionNo: uniq("RM/"),
      userId,
      ...extra,
    },
  });
  await db.studentEnrollment.create({
    data: { tenantId: a.id, sessionId: session.id, classArmId: arm.id, studentId: record.id, status: "ACTIVE" },
  });
  if (status)
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: record.id,
        subjectId: subject.id,
        periodId: period.id,
        score: 70,
        status,
        verificationToken: uniq("tok"),
      },
    });
  return record;
}
/// A new member of school A with their own sign-in: a school record has at most one account, so a pupil's user and a guardian's user are not shared between tests.
async function viewer(role: Role): Promise<{ key: string; id: string }> {
  const created = await createUser({ name: uniq("v") });
  await addMembership(created.id, a.id, role);
  const key = uniq("viewer");
  cookie[key] = cookieHeader((await loginAs(created, SAAS)).token!);
  return { key, id: created.id };
}
const school = (code = a.code) => `/api/v1/schools/${code}`;
const put = (who: string, studentId: string, body: unknown, code = a.code) =>
  api(`${school(code)}/people/students/${studentId}/report-remarks`, { ...SAAS, cookie: cookie[who], method: "PUT", body });
const card = (who: string, studentId: string) =>
  api(`${school()}/people/students/${studentId}/report-card?periodId=${period.id}`, { ...SAAS, cookie: cookie[who] });
const row = (studentId: string) =>
  db.reportRemark.findUnique({ where: { tenantId_studentId_periodId: { tenantId: a.id, studentId, periodId: period.id } } });
const both = { periodId: "", teacherRemark: "Works hard and helps others.", principalRemark: "A pleasure to have in the school." };

test.describe("who writes which remark", () => {
  test("the administrator writes both; the row records who wrote each", async () => {
    const p = await pupil();
    const res = await put("admin", p.id, { ...both, periodId: period.id });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data).toMatchObject({
      changed: true,
      remarks: { teacherRemark: both.teacherRemark, principalRemark: both.principalRemark },
    });
    expect(await row(p.id)).toMatchObject({
      teacherRemark: both.teacherRemark,
      teacherRemarkByUserId: user.admin.id,
      principalRemark: both.principalRemark,
      principalRemarkByUserId: user.admin.id,
    });
  });

  test("a teacher of the pupil's arm writes the teacher's remark and not the principal's", async () => {
    const p = await pupil();
    const mine = await put("teacher", p.id, { periodId: period.id, teacherRemark: "Improving steadily." });
    expect(mine.status, mine.text).toBe(200);
    expect(await row(p.id)).toMatchObject({
      teacherRemark: "Improving steadily.",
      teacherRemarkByUserId: user.teacher.id,
      principalRemark: null,
    });
    const principal = await put("teacher", p.id, { periodId: period.id, principalRemark: "Excellent." });
    expect(principal.status).toBe(403);
    expect(principal.json.error.message).toBe("Only the school administrator writes the principal's remark.");
    const mixed = await put("teacher", p.id, { periodId: period.id, teacherRemark: "Changed.", principalRemark: "Excellent." });
    expect(mixed.status).toBe(403);
    expect((await row(p.id))!.teacherRemark, "a refused request writes nothing, not even the half the teacher may write").toBe(
      "Improving steadily.",
    );
  });

  test("a teacher who does not teach the pupil's arm is told what an unknown pupil is told; so is one who teaches nothing", async () => {
    const p = await pupil(armOther);
    const unknown = await put("admin", "no-such-pupil-id", { periodId: period.id, teacherRemark: "x" });
    for (const who of ["teacher", "stranger"]) {
      const res = await put(who, p.id, { periodId: period.id, teacherRemark: "x" });
      expect(res.status, `${who}: ${res.text}`).toBe(404);
      expect(res.json.error.message).toBe(unknown.json.error.message);
    }
    expect(await row(p.id)).toBeNull();
  });

  test("non-teaching staff, a pupil and a parent write nothing; nobody signed out; another school's administrator is a stranger", async () => {
    const pupilV = await viewer(Role.STUDENT);
    const parentV = await viewer(Role.PARENT);
    const p = await pupil(armNorth, "DRAFT", pupilV.id);
    for (const who of ["clerk", pupilV.key, parentV.key])
      expect((await put(who, p.id, { periodId: period.id, teacherRemark: "x" })).status, who).toBe(403);
    expect(
      (
        await api(`${school()}/people/students/${p.id}/report-remarks`, {
          ...SAAS,
          method: "PUT",
          body: { periodId: period.id, teacherRemark: "x" },
        })
      ).status,
    ).toBe(401);
    expect((await put("adminB", p.id, { periodId: period.id, teacherRemark: "x" })).status).toBe(403); // not a member of school A
    // In their own school, naming school A's pupil and term is the same 404 as ids that do not exist.
    expect((await put("adminB", p.id, { periodId: period.id, teacherRemark: "x" }, b.code)).status).toBe(404);
    expect(await row(p.id)).toBeNull();
  });

  test("a pupil who was not on the roll of that term's session, a term of another school and an unknown term are all 404", async () => {
    const elsewhere = await db.studentRecord.create({
      data: {
        tenantId: a.id,
        firstName: uniq("Nr"),
        lastName: "NotEnrolled",
        dateOfBirth: new Date("2014-05-05"),
        admissionNo: uniq("NE/"),
      },
    });
    expect((await put("admin", elsewhere.id, { periodId: period.id, teacherRemark: "x" })).status).toBe(404);
    const p = await pupil();
    const foreignSession = await db.academicSession.create({
      data: { tenantId: b.id, label: uniq("BS"), startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
    });
    const foreign = await db.academicPeriod.create({
      data: {
        tenantId: b.id,
        sessionId: foreignSession.id,
        kind: "TERM",
        ordinal: 1,
        label: "T",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
        isCurrent: true,
      },
    });
    for (const periodId of [foreign.id, "no-such-term-id-000000000000"])
      expect((await put("admin", p.id, { periodId, teacherRemark: "x" })).status, periodId).toBe(404);
    expect(await row(p.id)).toBeNull();
  });
});

test.describe("what a remark may say", () => {
  test("it is trimmed, line ends are made \\n, a blank clears it and a key left out leaves it alone", async () => {
    const p = await pupil();
    expect(
      (await put("admin", p.id, { periodId: period.id, teacherRemark: "  Line one.\r\nLine two.  ", principalRemark: "Keep." })).status,
    ).toBe(200);
    expect((await row(p.id))!.teacherRemark).toBe("Line one.\nLine two.");
    const left = await put("admin", p.id, { periodId: period.id, principalRemark: "Kept, changed." });
    expect(left.json.data.remarks).toEqual({ teacherRemark: "Line one.\nLine two.", principalRemark: "Kept, changed." });
    expect((await put("admin", p.id, { periodId: period.id, teacherRemark: "   " })).json.data.remarks.teacherRemark).toBeNull();
    expect(await row(p.id)).toMatchObject({ teacherRemark: null, teacherRemarkByUserId: null, principalRemark: "Kept, changed." });
  });

  test("500 characters are accepted and 501 are refused with a sentence; control characters and non-text are refused", async () => {
    const p = await pupil();
    expect((await put("admin", p.id, { periodId: period.id, teacherRemark: "x".repeat(500) })).status).toBe(200);
    const long = await put("admin", p.id, { periodId: period.id, teacherRemark: "x".repeat(501) });
    expect(long.status).toBe(400);
    expect(long.json.error.message).toBe("A remark can be at most 500 characters.");
    const control = await put("admin", p.id, { periodId: period.id, teacherRemark: "bad\u0007bell" });
    expect(control.status).toBe(400);
    expect(control.json.error.message).toBe("A remark cannot contain control characters.");
    for (const bad of [5, true, {}, ["x"]])
      expect((await put("admin", p.id, { periodId: period.id, teacherRemark: bad })).status, JSON.stringify(bad)).toBe(400);
    expect((await row(p.id))!.teacherRemark, "none of those wrote anything").toBe("x".repeat(500));
  });

  test("a body with neither remark, an unknown key, a missing or odd term, or no object at all is refused", async () => {
    const p = await pupil();
    for (const bad of [
      { periodId: period.id },
      { periodId: period.id, remark: "x" },
      { teacherRemark: "x" },
      { periodId: "", teacherRemark: "x" },
      { periodId: "a b!", teacherRemark: "x" },
      "text",
      null,
      [],
    ])
      expect((await put("admin", p.id, bad)).status, JSON.stringify(bad)).toBe(400);
    expect(await row(p.id)).toBeNull();
  });
});

test.describe("the row and the audit", () => {
  test("clearing both deletes the row; a save that changes nothing says so and writes nothing; the audit names what changed and never the words", async () => {
    const p = await pupil();
    const first = await put("admin", p.id, {
      periodId: period.id,
      teacherRemark: "Secret words about a child.",
      principalRemark: "More private words.",
    });
    expect(first.status).toBe(200);
    const audits = () =>
      db.auditLog.findMany({
        where: { tenantId: a.id, action: "REPORT_REMARKS_SAVED", afterValue: { path: ["studentId"], equals: p.id } },
        orderBy: { createdAt: "asc" },
      });
    expect(await audits()).toHaveLength(1);
    expect((await audits())[0].afterValue).toEqual({
      studentId: p.id,
      periodId: period.id,
      changes: { teacherRemark: "set", principalRemark: "set" },
    });
    expect(JSON.stringify(await audits())).not.toMatch(/Secret words|private words/);

    const same = await put("admin", p.id, { periodId: period.id, teacherRemark: "Secret words about a child." });
    expect(same.json.data.changed).toBe(false);
    expect(await audits(), "no audit row for a save that changed nothing").toHaveLength(1);

    const changed = await put("admin", p.id, { periodId: period.id, teacherRemark: "Different words." });
    expect(changed.json.data.changed).toBe(true);
    expect((await audits())[1].afterValue).toMatchObject({ changes: { teacherRemark: "changed" } });

    const cleared = await put("admin", p.id, { periodId: period.id, teacherRemark: null, principalRemark: "" });
    expect(cleared.status, cleared.text).toBe(200);
    expect(cleared.json.data.remarks).toEqual({ teacherRemark: null, principalRemark: null });
    expect(await row(p.id), "a row with nothing left is deleted").toBeNull();
    expect((await audits())[2].afterValue).toMatchObject({ changes: { teacherRemark: "cleared", principalRemark: "cleared" } });
    // Clearing what is not there is not a change.
    expect((await put("admin", p.id, { periodId: period.id, teacherRemark: null })).json.data.changed).toBe(false);
  });

  test("an author stays with their remark when someone else writes the other one", async () => {
    const p = await pupil();
    await put("teacher", p.id, { periodId: period.id, teacherRemark: "From the teacher." });
    await put("admin", p.id, { periodId: period.id, principalRemark: "From the principal." });
    expect(await row(p.id)).toMatchObject({ teacherRemarkByUserId: user.teacher.id, principalRemarkByUserId: user.admin.id });
    await put("admin", p.id, { periodId: period.id, teacherRemark: "The principal rewrote the teacher's." });
    expect(await row(p.id)).toMatchObject({ teacherRemarkByUserId: user.admin.id, principalRemarkByUserId: user.admin.id });
  });

  test("the database refuses what the application would never write: nothing in a row, blank text, an author without a remark", async () => {
    const p = await pupil();
    const base = { tenantId: a.id, studentId: p.id, periodId: period.id };
    for (const [what, data] of [
      ["both remarks null", { ...base }],
      ["a blank remark", { ...base, teacherRemark: "   ", teacherRemarkByUserId: user.admin.id }],
      ["a remark with no author", { ...base, teacherRemark: "x" }],
      [
        "an author with no remark",
        { ...base, teacherRemark: "x", teacherRemarkByUserId: user.admin.id, principalRemarkByUserId: user.admin.id },
      ],
      ["a 501-character remark", { ...base, principalRemark: "x".repeat(501), principalRemarkByUserId: user.admin.id }],
    ] as const)
      await expect(db.reportRemark.create({ data }), what).rejects.toThrow();
    // Another school's pupil under this school's id is refused by the composite key.
    const alien = await db.studentRecord.create({
      data: { tenantId: b.id, firstName: "Al", lastName: "Ien", dateOfBirth: new Date("2014-05-05"), admissionNo: uniq("AL/") },
    });
    await expect(
      db.reportRemark.create({
        data: { tenantId: a.id, studentId: alien.id, periodId: period.id, teacherRemark: "x", teacherRemarkByUserId: user.admin.id },
      }),
    ).rejects.toThrow();
  });

  test("two people saving the first remark of the same pupil at the same moment: one wins, the other is told to reload, nothing is lost or doubled", async () => {
    const p = await pupil();
    const [t, ad] = await Promise.all([
      put("teacher", p.id, { periodId: period.id, teacherRemark: "Teacher's." }),
      put("admin", p.id, { periodId: period.id, principalRemark: "Principal's." }),
    ]);
    expect(
      [t.status, ad.status].every((s) => s === 200 || s === 409),
      `${t.status} ${ad.status}`,
    ).toBe(true);
    expect([t.status, ad.status]).toContain(200);
    expect(await db.reportRemark.count({ where: { tenantId: a.id, studentId: p.id, periodId: period.id } })).toBe(1);
    // A second try always works, and nothing the winner saved was lost.
    for (const res of [t, ad]) if (res.status === 409) expect(res.json.error.message).toMatch(/Reload the card/);
    const retry =
      t.status === 409
        ? await put("teacher", p.id, { periodId: period.id, teacherRemark: "Teacher's." })
        : await put("admin", p.id, { periodId: period.id, principalRemark: "Principal's." });
    expect(retry.status).toBe(200);
    expect(await row(p.id)).toMatchObject({ teacherRemark: "Teacher's.", principalRemark: "Principal's." });
  });
});

test.describe("once anything is published the remarks are final", () => {
  test("DRAFT, SUBMITTED and APPROVED results still allow remarks; PUBLISHED and LOCKED do not, for anyone", async () => {
    for (const status of ["DRAFT", "SUBMITTED", "APPROVED"] as const) {
      const p = await pupil(armNorth, status);
      expect((await put("admin", p.id, { periodId: period.id, teacherRemark: `ok in ${status}` })).status, status).toBe(200);
    }
    for (const status of ["PUBLISHED", "LOCKED"] as const) {
      const p = await pupil(armNorth, status);
      for (const who of ["admin", "teacher"]) {
        const res = await put(who, p.id, { periodId: period.id, teacherRemark: "too late" });
        expect(res.status, `${status} ${who}: ${res.text}`).toBe(409);
        expect(res.json.error.message).toBe("This pupil's results for the term are published, so the remarks can no longer be changed.");
      }
      expect(await row(p.id)).toBeNull();
    }
  });

  test("one published result among drafts freezes the pupil's remarks, and what was written before stays", async () => {
    const p = await pupil(armNorth, "DRAFT");
    expect((await put("admin", p.id, { periodId: period.id, teacherRemark: "Written in draft." })).status).toBe(200);
    const second = await db.subject.create({ data: { tenantId: a.id, name: uniq("English") } });
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: p.id,
        subjectId: second.id,
        periodId: period.id,
        score: 60,
        status: "PUBLISHED",
        verificationToken: uniq("tok"),
      },
    });
    expect((await put("admin", p.id, { periodId: period.id, teacherRemark: "Rewritten." })).status).toBe(409);
    expect((await row(p.id))!.teacherRemark).toBe("Written in draft.");
  });

  test("a pupil's results in another term do not freeze this term", async () => {
    const p = await pupil(armNorth, null);
    const other = await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId: session.id,
        kind: "TERM",
        ordinal: 2,
        label: uniq("Second "),
        startDate: new Date("2027-01-05"),
        endDate: new Date("2027-04-01"),
        isCurrent: false,
      },
    });
    await db.result.create({
      data: {
        tenantId: a.id,
        studentId: p.id,
        subjectId: subject.id,
        periodId: other.id,
        score: 80,
        status: "PUBLISHED",
        verificationToken: uniq("tok"),
      },
    });
    expect((await put("admin", p.id, { periodId: period.id, teacherRemark: "Still open." })).status).toBe(200);
    expect((await put("admin", p.id, { periodId: other.id, teacherRemark: "This one is final." })).status).toBe(409);
  });
});

test.describe("what the card shows to whom", () => {
  test("staff see the remarks while they are written, with what they may do; the administrator may write both, a teacher only the teacher's, a clerk neither", async () => {
    const p = await pupil(armNorth, "DRAFT");
    await put("admin", p.id, { periodId: period.id, teacherRemark: "For staff.", principalRemark: "Also for staff." });
    const expected = {
      admin: { canWriteTeacher: true, canWritePrincipal: true },
      teacher: { canWriteTeacher: true, canWritePrincipal: false },
      clerk: { canWriteTeacher: false, canWritePrincipal: false },
    };
    for (const [who, flags] of Object.entries(expected)) {
      const res = await card(who, p.id);
      expect(res.status, `${who}: ${res.text}`).toBe(200);
      expect(res.json.data.remarks, who).toEqual({ teacher: "For staff.", principal: "Also for staff.", editable: true, ...flags });
    }
  });

  test("a pupil and a parent see no remarks while the results are drafts, and see them (read-only) once published", async () => {
    const pupilV = await viewer(Role.STUDENT);
    const parentV = await viewer(Role.PARENT);
    const p = await pupil(armNorth, "DRAFT", pupilV.id);
    const guardian = await db.guardianRecord.create({
      data: { tenantId: a.id, userId: parentV.id, firstName: "Amina", lastName: "Remark" },
    });
    await db.guardianLink.create({
      data: { tenantId: a.id, studentId: p.id, guardianId: guardian.id, relationship: "MOTHER", status: "APPROVED", isPrimary: true },
    });
    await put("admin", p.id, { periodId: period.id, teacherRemark: "Draft remark.", principalRemark: "Draft principal." });
    for (const who of [pupilV.key, parentV.key]) {
      const hidden = await card(who, p.id);
      expect(hidden.json.data.remarks, who).toEqual({
        teacher: null,
        principal: null,
        editable: true,
        canWriteTeacher: false,
        canWritePrincipal: false,
      });
    }
    await db.result.updateMany({ where: { studentId: p.id }, data: { status: "PUBLISHED" } });
    for (const who of [pupilV.key, parentV.key]) {
      const shown = await card(who, p.id);
      expect(shown.json.data.remarks, who).toEqual({
        teacher: "Draft remark.",
        principal: "Draft principal.",
        editable: false,
        canWriteTeacher: false,
        canWritePrincipal: false,
      });
    }
    // And no one can write any more, the administrator included.
    expect((await card("admin", p.id)).json.data.remarks).toMatchObject({
      editable: false,
      canWriteTeacher: false,
      canWritePrincipal: false,
    });
  });

  test("a pupil with no remarks has an empty pair, not a missing field", async () => {
    const p = await pupil(armNorth, "DRAFT");
    expect((await card("admin", p.id)).json.data.remarks).toMatchObject({ teacher: null, principal: null });
  });
});

test.describe("a bug of task 0031: locked results vanished from a pupil's card", () => {
  test("a pupil and a parent still see a result the term has locked, and the class position counts locked results", async () => {
    const pupilV = await viewer(Role.STUDENT);
    const parentV = await viewer(Role.PARENT);
    const mine = await pupil(armNorth, "LOCKED", pupilV.id);
    const peer = await pupil(armNorth, "LOCKED");
    await db.result.updateMany({ where: { studentId: peer.id }, data: { score: 90 } });
    const guardian = await db.guardianRecord.create({
      data: { tenantId: a.id, userId: parentV.id, firstName: "Amina", lastName: "Locked" },
    });
    await db.guardianLink.create({
      data: { tenantId: a.id, studentId: mine.id, guardianId: guardian.id, relationship: "MOTHER", status: "APPROVED", isPrimary: true },
    });
    for (const who of [pupilV.key, parentV.key, "admin"]) {
      const res = await card(who, mine.id);
      expect(res.status, who).toBe(200);
      expect(
        res.json.data.subjects.map((s: { status: string }) => s.status),
        `${who} sees the locked mark`,
      ).toEqual(["LOCKED"]);
      expect(res.json.data.summary.totalScore, who).toBe(70);
    }
    // The peer outscored this pupil; the position is among the pupils with a result, in every status that counts.
    const rank = (await card(pupilV.key, mine.id)).json.data.summary;
    expect(rank.classRank).toBeGreaterThan(1);
  });

  test("a draft is still not shown to a pupil or a parent", async () => {
    const pupilV = await viewer(Role.STUDENT);
    const p = await pupil(armNorth, "DRAFT", pupilV.id);
    const res = await card(pupilV.key, p.id);
    expect(res.json.data.subjects).toEqual([]);
  });
});
