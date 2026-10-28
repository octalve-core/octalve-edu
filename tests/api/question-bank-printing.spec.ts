import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { approvedItem, classArm, member, pupil, guardianOf, type Person, type Pupil } from "../support/qbank-world";

// Printing a question, a form or a quiz for the classroom (task 0024 slice 10). Printing hands out the question text and, when asked, the ANSWER KEY, so it is held to the same
// rules as reading the question bank itself:
//   - a question a person may not see is "Question bank item not found", whatever the person asks for (a draft that is not theirs, a secret question of a subject they do not teach,
//     another campus's question);
//   - a form or a quiz of another campus is "not found" too;
//   - only teaching staff and administrators print (a member of the non-teaching staff reads the bank to review, but does not take a paper out of it);
//   - a refusal leaves nothing in the print log, and every print leaves one row naming who printed what.
// School A has North and South; the questions and forms below are written for North unless the name says otherwise.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let a: TestTenant;
let north: string;
let south: string;
let admin: Person;
let campusN: Person;
let tNorth: Person; // teaches nothing in particular
let tPhysics: Person; // teaches Physics in North, and wrote the questions below
let tSouth: Person;
let clerk: Person; // non-teaching staff of North
let pupilN: Pupil;
let guardian: Person;
let PRINT = "";
let FORMS = "";

const ids: Record<string, string> = {};

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Printing", campuses: ["North", "South"] });
  [north, south] = a.campuses.map((c) => c.id);
  PRINT = `/api/v1/schools/${a.code}/question-bank/print`;
  FORMS = `/api/v1/schools/${a.code}/forms`;
  admin = await member(a, Role.ADMIN, null, "Admin");
  campusN = await member(a, Role.CAMPUS_ADMIN, north, "Campus North");
  tNorth = await member(a, Role.TEACHING_STAFF, north, "Teacher North");
  tPhysics = await member(a, Role.TEACHING_STAFF, north, "Teacher Physics");
  tSouth = await member(a, Role.TEACHING_STAFF, south, "Teacher South");
  clerk = await member(a, Role.NON_TEACHING_STAFF, north, "Clerk");
  pupilN = await pupil(a, north, null, "Pupil");
  guardian = await guardianOf(a, [pupilN.student.id]);

  // tPhysics teaches Physics in North
  const record = await db.staffRecord.create({
    data: { tenantId: a.id, campusId: north, userId: tPhysics.user.id, category: "TEACHING", firstName: "Phys", lastName: "Teacher" },
  });
  const subject = await db.subject.create({ data: { tenantId: a.id, name: "Physics", code: "PHYPRT" } });
  const { armId } = await classArm(a, north, "JSS 1");
  await db.staffSubjectAssignment.create({ data: { tenantId: a.id, staffRecordId: record.id, subjectId: subject.id, classArmId: armId } });

  // questions
  ids.open = (await approvedItem(a.id, north, tPhysics.user.id)).id;
  ids.general = (await approvedItem(a.id, null, tPhysics.user.id)).id;
  ids.south = (await approvedItem(a.id, south, tSouth.user.id)).id;
  ids.secret = (
    await approvedItem(a.id, north, tPhysics.user.id, { visibility: "TEACHERS_ONLY", subjectLabel: "Physics", subjectKey: "physics" })
  ).id;
  ids.draft = (
    await db.questionBankItem.create({
      data: {
        tenantId: a.id,
        campusId: north,
        type: "SINGLE",
        prompt: "A draft of the physics teacher",
        status: "DRAFT",
        submittedById: tPhysics.user.id,
      },
    })
  ).id;

  // forms and quizzes
  // a form is printed by the people who MANAGE it (task 0024, the campus rule for forms): its creator, the administrators; North's and South's are written by their own teacher
  const form = async (key: string, campusId: string | null, by: string) => {
    const f = await db.form.create({
      data: { tenantId: a.id, campusId, kind: "PRACTICE_SET", title: `Form ${key}`, status: "PUBLISHED", createdById: by },
    });
    await db.formQuestion.create({
      data: { tenantId: a.id, formId: f.id, prompt: `Question of form ${key}`, correctAnswer: "a", points: 2 },
    });
    ids[`form${key}`] = f.id;
  };
  await form("North", north, tNorth.user.id);
  await form("South", south, tSouth.user.id);
  await form("Wide", null, admin.user.id);
  const maths = await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTHPRT" } });
  const quiz = async (key: string, campusId: string) => {
    const q = await db.quiz.create({
      data: { tenantId: a.id, campusId, subjectId: maths.id, title: `Quiz ${key}`, status: "PUBLISHED" },
    });
    await db.quizQuestion.create({ data: { tenantId: a.id, quizId: q.id, prompt: `Question of quiz ${key}`, correctAnswer: "a" } });
    ids[`quiz${key}`] = q.id;
  };
  await quiz("North", north);
  await quiz("South", south);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "QuestionBankPrintLog" RESTART IDENTITY CASCADE`); // append-only: a trigger refuses DELETE
});

const print = (who: Person | null, targetKind: "QUESTION_BANK_ITEM" | "FORM" | "QUIZ", key: string, includeAnswerKey = true) =>
  api(PRINT, { method: "POST", cookie: who?.cookie, body: { targetKind, targetId: ids[key] ?? key, includeAnswerKey } });
const logs = () => db.questionBankPrintLog.count({ where: { tenantId: a.id } });

const isPdf = (res: { status: number; headers: Headers; bytes: Buffer }) =>
  res.status === 200 && res.headers.get("content-type") === "application/pdf" && res.bytes.subarray(0, 4).toString() === "%PDF";

test.describe("a question", () => {
  test("a teacher prints a question they may read, and the print is logged against their name", async () => {
    const res = await print(tNorth, "QUESTION_BANK_ITEM", "open");
    expect(isPdf(res)).toBe(true);
    const row = await db.questionBankPrintLog.findFirstOrThrow({ where: { tenantId: a.id } });
    expect(row).toMatchObject({ targetKind: "QUESTION_BANK_ITEM", targetId: ids.open, printedById: tNorth.user.id });
    // a school-wide question is printable from every campus
    expect(isPdf(await print(tNorth, "QUESTION_BANK_ITEM", "general"))).toBe(true);
    expect(isPdf(await print(tSouth, "QUESTION_BANK_ITEM", "general"))).toBe(true);
  });

  test("a question a person may not read is 'not found', and nothing is logged", async () => {
    // someone else's draft
    for (const who of [tNorth, campusN, tSouth]) {
      const res = await print(who, "QUESTION_BANK_ITEM", "draft");
      expect(res.status).toBe(404);
      expect(res.json.error.message).toBe("Question bank item not found.");
    }
    // a secret question of a subject the teacher does not teach
    expect((await print(tNorth, "QUESTION_BANK_ITEM", "secret")).status).toBe(404);
    // another campus's question
    expect((await print(tNorth, "QUESTION_BANK_ITEM", "south")).status).toBe(404);
    expect((await print(campusN, "QUESTION_BANK_ITEM", "south")).status).toBe(404);
    // a question that is not there at all
    expect((await print(tNorth, "QUESTION_BANK_ITEM", "cl0000000000000000000000x")).status).toBe(404);
    expect(await logs()).toBe(0);
  });

  test("the writer prints their own draft, the teacher of the subject its secret question, and the school's administrator anything", async () => {
    expect(isPdf(await print(tPhysics, "QUESTION_BANK_ITEM", "draft"))).toBe(true);
    expect(isPdf(await print(tPhysics, "QUESTION_BANK_ITEM", "secret"))).toBe(true);
    for (const key of ["draft", "secret", "south", "open", "general"]) {
      expect(isPdf(await print(admin, "QUESTION_BANK_ITEM", key))).toBe(true);
    }
    expect(await logs()).toBe(2 + 5);
  });
});

test.describe("a form and a quiz", () => {
  test("a teacher prints the forms they wrote and the quizzes of their campus; a colleague, the whole school's forms and another campus's are a 404", async () => {
    expect(isPdf(await print(tNorth, "FORM", "formNorth"))).toBe(true); // the creator
    expect((await print(tNorth, "FORM", "formWide")).status).toBe(404); // a form of the whole school is the school administrator's
    expect((await print(tNorth, "FORM", "formSouth")).status).toBe(404);
    expect((await print(tPhysics, "FORM", "formNorth")).status).toBe(404); // a colleague of the same campus does not manage it
    expect(isPdf(await print(tNorth, "QUIZ", "quizNorth"))).toBe(true);
    expect((await print(tNorth, "QUIZ", "quizSouth")).status).toBe(404);
    expect(isPdf(await print(campusN, "FORM", "formNorth"))).toBe(true); // the administrator of the form's campus
    expect((await print(campusN, "FORM", "formSouth")).status).toBe(404);
    expect((await print(campusN, "FORM", "formWide")).status).toBe(404);
    expect((await print(campusN, "QUIZ", "quizSouth")).status).toBe(404);
    expect(isPdf(await print(tSouth, "FORM", "formSouth"))).toBe(true);
    expect((await print(tSouth, "FORM", "formNorth")).status).toBe(404);
    expect(await logs()).toBe(4); // the North teacher's form and quiz, the campus administrator's form, the South teacher's form; every refusal left nothing
  });

  test("the school's administrator prints any campus's", async () => {
    for (const [kind, key] of [
      ["FORM", "formSouth"],
      ["FORM", "formNorth"],
      ["FORM", "formWide"],
      ["QUIZ", "quizSouth"],
    ] as const) {
      expect(isPdf(await print(admin, kind, key))).toBe(true);
    }
  });

  test("the form's own print route holds to the same rules", async () => {
    const post = (who: Person | null, key: string) =>
      api(`${FORMS}/${ids[key]}/print`, { method: "POST", cookie: who?.cookie, body: { includeAnswerKey: true } });
    expect(isPdf(await post(tNorth, "formNorth"))).toBe(true);
    expect((await post(tNorth, "formSouth")).status).toBe(404);
    expect((await post(clerk, "formNorth")).status).toBe(403);
    expect((await post(pupilN, "formNorth")).status).toBe(403);
    expect((await post(null, "formNorth")).status).toBe(401);
    expect(isPdf(await post(admin, "formSouth"))).toBe(true);
  });
});

test.describe("who may print at all", () => {
  test("non-teaching staff, pupils and guardians may not; nobody signed out may", async () => {
    for (const who of [clerk, pupilN, guardian]) {
      const res = await print(who, "QUESTION_BANK_ITEM", "open");
      expect(res.status).toBe(403);
    }
    expect((await print(null, "QUESTION_BANK_ITEM", "open")).status).toBe(401);
    expect(await logs()).toBe(0);
  });

  test("the log is for staff, and holds only this school's prints", async () => {
    await print(tNorth, "QUESTION_BANK_ITEM", "open");
    const list = await api(`/api/v1/schools/${a.code}/question-bank/print-logs`, { cookie: tNorth.cookie });
    expect(list.status).toBe(200);
    expect(list.json.data.logs).toHaveLength(1);
    expect((await api(`/api/v1/schools/${a.code}/question-bank/print-logs`, { cookie: pupilN.cookie })).status).toBe(403);
    const b = await createTenant({ name: "Beta Printing", campuses: ["Elsewhere"] });
    const outsider = await member(b, Role.TEACHING_STAFF, null, "Outsider");
    expect((await api(`/api/v1/schools/${a.code}/question-bank/print-logs`, { cookie: outsider.cookie })).status).toBe(403);
    expect(
      (await api(PRINT, { method: "POST", cookie: outsider.cookie, body: { targetKind: "QUESTION_BANK_ITEM", targetId: ids.open } }))
        .status,
    ).toBe(403);
  });
});
