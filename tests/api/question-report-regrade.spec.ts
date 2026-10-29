import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { approvedItem, member, pupil, type Person, type Pupil } from "../support/qbank-world";

// "Apply the correction to that copy and re-grade the attempts" (design note 8.5): when a reviewer resolves a report as FIXED, they may ask for the corrected question to be put into the
// assessments that copied it, and for the attempts already made to be scored again. It is an exception to "past papers are immutable", so it is explicit and narrow:
//   - only for a report resolved as FIXED, and only when the corrected question is APPROVED;
//   - only the copies in the CAMPUS the report came from (a school-wide report, made with no campus, reaches the whole school), and not in archived quizzes (past papers);
//   - the copy takes the corrected prompt, options and key; its points are the quiz's own and stay;
//   - finished attempts are scored again with the rule a quiz is graded by; what changed, for whom, is written to the audit trail;
//   - all or nothing, and refused outright above 5000 attempts rather than done in part.
// Without it, resolving a report changes no assessment. (The same rules as AlEemaan's question-report-regrade spec, where the scope is the branch.)

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

const FIXED_PROMPT = "What is the capital of Nigeria? (corrected)";
const FIXED_OPTIONS = [
  { id: "a", text: "Abuja" },
  { id: "b", text: "Lagos" },
];

let t: TestTenant;
let north: string;
let south: string;
let admin: Person;
let teacher: Person;
let reviewer: Person;
let kids: Pupil[]; // two in North, one in South
let subject: string;

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Regrade School", campuses: ["North", "South"] });
  north = t.campuses[0].id;
  south = t.campuses[1].id;
  admin = await member(t, Role.ADMIN, null, "School Admin");
  teacher = await member(t, Role.TEACHING_STAFF, north, "Tariq Teacher");
  reviewer = await member(t, Role.TEACHING_STAFF, north, "Rashid Reviewer");
  await db.questionBankReviewer.create({
    data: { tenantId: t.id, userId: reviewer.user.id, assignedById: admin.user.id, scope: "GENERAL", campusId: north } as never,
  });
  kids = [await pupil(t, north, null, "Kid1"), await pupil(t, north, null, "Kid2"), await pupil(t, south, null, "Kid3")];
  subject = (await db.subject.create({ data: { tenantId: t.id, name: "Civics", code: "CIV" } })).id;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.questionReport.deleteMany({ where: { tenantId: t.id } });
});

/** An approved question (version 1, the key is "b"), of the North campus or, when `general`, of the whole school. */
const makeItem = (general = false) =>
  approvedItem(t.id, general ? null : north, teacher.user.id, {
    prompt: "What is the capital of Nigeria?",
    points: 2,
    subjectLabel: "Civics",
    subjectKey: "civics",
    options: [
      { id: "a", text: "Lagos" },
      { id: "b", text: "Abuja" },
    ],
    correctAnswer: "b",
    version: 1,
  });
type Item = Awaited<ReturnType<typeof makeItem>>;

/** What a reviewer does to the question to fix it: the next version, with the key now "a". */
const fixItem = (item: Item) =>
  db.questionBankItem.update({
    where: { id: item.id },
    data: { prompt: FIXED_PROMPT, options: FIXED_OPTIONS, correctAnswer: "a", version: 2 },
  });

/** A quiz of a campus with two questions of 2 points each: the first copied from `item` at `copiedVersion`, the second the teacher's own (key "x"). Pass mark 60. */
async function makeQuiz(opts: { campusId: string | null; item: Item; copiedVersion?: number; archived?: boolean }) {
  const quiz = await db.quiz.create({
    data: {
      tenantId: t.id,
      campusId: opts.campusId,
      subjectId: subject,
      title: "Civics test",
      status: "PUBLISHED",
      passingScore: 60,
      archivedAt: opts.archived ? new Date() : null,
    },
  });
  const copy = await db.quizQuestion.create({
    data: {
      tenantId: t.id,
      quizId: quiz.id,
      prompt: opts.item.prompt,
      options: [
        { id: "a", text: "Lagos" },
        { id: "b", text: "Abuja" },
      ],
      correctAnswer: "b",
      points: 2,
      sortOrder: 1,
      sourceItemId: opts.item.id,
      sourceVersion: opts.copiedVersion ?? 1,
    },
  });
  const own = await db.quizQuestion.create({
    data: { tenantId: t.id, quizId: quiz.id, prompt: "Name the colour of grass.", correctAnswer: "x", points: 2, sortOrder: 2 },
  });
  return { quiz: quiz.id, copy: copy.id, own: own.id };
}
type Quiz = Awaited<ReturnType<typeof makeQuiz>>;

/** A finished attempt: answers to the copied question and the own question, scored as they were when taken (key "b"). */
const attempt = (q: Quiz, kid: Pupil, copiedAnswer: string, score: number, isPassed: boolean) =>
  db.quizAttempt.create({
    data: {
      tenantId: t.id,
      quizId: q.quiz,
      studentId: kid.student.id,
      answers: [
        { questionId: q.copy, answer: copiedAnswer },
        { questionId: q.own, answer: "x" },
      ],
      score,
      isPassed,
      completedAt: new Date(),
    },
  });

const base = () => `/api/v1/schools/${t.code}`;
const file = async (who: Person, itemId: string) => {
  const res = await api(`${base()}/question-bank/items/${itemId}/report`, {
    method: "POST",
    cookie: who.cookie,
    body: { reason: "The key of this question is wrong." },
  });
  expect(res.status, res.text.slice(0, 160)).toBe(201);
  return res.json.data.reportId as string;
};
const resolve = (who: Person, reportId: string, body: Record<string, unknown>) =>
  api(`${base()}/question-bank/reports/${reportId}`, {
    method: "PATCH",
    cookie: who.cookie,
    body: { outcomeReason: "The key was wrong and is corrected.", ...body },
  });
const copyOf = (q: Quiz) => db.quizQuestion.findUniqueOrThrow({ where: { id: q.copy } });
const attemptState = async (id: string) => {
  const a = await db.quizAttempt.findUniqueOrThrow({ where: { id } });
  return { score: a.score, isPassed: a.isPassed };
};

test.describe("applying the correction", () => {
  test("the copy takes the corrected question, the attempts are scored again, and the audit trail says what changed", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ campusId: north, item });
    const a1 = await attempt(q, kids[0]!, "b", 100, true); // right by the old key
    const a2 = await attempt(q, kids[1]!, "a", 50, false); // wrong by the old key, right by the new
    await fixItem(item);
    const reportId = await file(teacher, item.id);

    const res = await resolve(reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regradeCount).toBe(1);
    expect(res.json.data.regrade).toMatchObject({
      copiesCorrected: 1,
      attemptsChecked: 2,
      attemptsChanged: 2,
      attemptsUnreadable: 0,
      skippedArchived: 0,
    });

    const copy = await copyOf(q);
    expect(copy).toMatchObject({ prompt: FIXED_PROMPT, correctAnswer: "a", sourceVersion: 2, points: 2, exposedToPractice: false });
    expect(copy.options).toEqual(FIXED_OPTIONS);
    expect(
      (await db.quizQuestion.findUniqueOrThrow({ where: { id: q.own } })).correctAnswer,
      "the teacher's own question is not touched",
    ).toBe("x");

    expect(await attemptState(a1.id), "was 100, now one of two right").toEqual({ score: 50, isPassed: false });
    expect(await attemptState(a2.id), "was 50, now both right").toEqual({ score: 100, isPassed: true });

    const audit = await db.questionBankAudit.findMany({ where: { ref: reportId, action: "REGRADE_APPLIED" } });
    expect(audit, "one audit row for the re-grade").toHaveLength(1);
    expect(audit[0]!.actorUserId).toBe(reviewer.user.id);
    const value = audit[0]!.newValue as {
      copiesCorrected: number;
      attemptsChanged: number;
      changes: { attemptId: string; fromScore: number; toScore: number }[];
    };
    expect(value).toMatchObject({ copiesCorrected: 1, attemptsChanged: 2 });
    expect(value.changes.find((c) => c.attemptId === a1.id)).toMatchObject({ fromScore: 100, toScore: 50 });
    expect(value.changes.find((c) => c.attemptId === a2.id)).toMatchObject({ fromScore: 50, toScore: 100 });
  });

  test("without the request, resolving a report changes no assessment", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ campusId: north, item });
    const a1 = await attempt(q, kids[0]!, "b", 100, true);
    await fixItem(item);
    const reportId = await file(teacher, item.id);

    const res = await resolve(reviewer, reportId, { outcome: "FIXED" });
    expect(res.status).toBe(200);
    expect(res.json.data.regrade ?? null).toBeNull();
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "b", sourceVersion: 1, exposedToPractice: false });
    expect(await attemptState(a1.id)).toEqual({ score: 100, isPassed: true });
    expect(await db.questionBankAudit.count({ where: { ref: reportId, action: "REGRADE_APPLIED" } })).toBe(0);
  });

  test("a copy that is already at the question's version is left alone, and so are its attempts", async () => {
    const item = await makeItem();
    await fixItem(item);
    const q = await makeQuiz({ campusId: north, item, copiedVersion: 2 });
    const a1 = await attempt(q, kids[0]!, "a", 77, true); // a score no rule would give: proves it is not recomputed
    const reportId = await file(teacher, item.id);

    const res = await resolve(reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ copiesCorrected: 0, attemptsChanged: 0 });
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "b", sourceVersion: 2 }); // the copy is whatever the teacher made it
    expect(await attemptState(a1.id)).toEqual({ score: 77, isPassed: true });
  });

  test("an archived quiz is a past paper: it is left as it was, and the answer says so", async () => {
    const item = await makeItem();
    const live = await makeQuiz({ campusId: north, item });
    const past = await makeQuiz({ campusId: north, item, archived: true });
    const aPast = await attempt(past, kids[0]!, "b", 100, true);
    await fixItem(item);
    const reportId = await file(teacher, item.id);

    const res = await resolve(reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ copiesCorrected: 1, skippedArchived: 1 });
    expect(await copyOf(live)).toMatchObject({ correctAnswer: "a", sourceVersion: 2 });
    expect(await copyOf(past)).toMatchObject({ correctAnswer: "b", sourceVersion: 1 });
    expect(await attemptState(aPast.id)).toEqual({ score: 100, isPassed: true });
  });

  test("an attempt whose stored answers cannot be read is left alone and counted", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ campusId: north, item });
    const good = await attempt(q, kids[0]!, "b", 100, true);
    const broken = await db.quizAttempt.create({
      data: {
        tenantId: t.id,
        quizId: q.quiz,
        studentId: kids[1]!.student.id,
        answers: "not a list",
        score: 33,
        isPassed: false,
        completedAt: new Date(),
      },
    });
    await fixItem(item);
    const reportId = await file(teacher, item.id);

    const res = await resolve(reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ attemptsChecked: 2, attemptsChanged: 1, attemptsUnreadable: 1 });
    expect(await attemptState(good.id)).toEqual({ score: 50, isPassed: false });
    expect(await attemptState(broken.id)).toEqual({ score: 33, isPassed: false });
  });
});

test.describe("what a correction may reach", () => {
  test("only the campus the report came from: a school-wide question's copies in another campus are not changed", async () => {
    const item = await makeItem(true);
    const mine = await makeQuiz({ campusId: north, item });
    const theirs = await makeQuiz({ campusId: south, item });
    await attempt(mine, kids[0]!, "b", 100, true);
    const aTheirs = await attempt(theirs, kids[2]!, "b", 100, true);
    await fixItem(item);
    const reportId = await file(teacher, item.id); // the teacher is of North, so the report is North's

    const res = await resolve(admin, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ copiesCorrected: 1, attemptsChanged: 1 });
    expect(await copyOf(mine)).toMatchObject({ correctAnswer: "a", sourceVersion: 2 });
    expect(await copyOf(theirs), "the other campus's copy").toMatchObject({ correctAnswer: "b", sourceVersion: 1 });
    expect(await attemptState(aTheirs.id), "and its attempt").toEqual({ score: 100, isPassed: true });
  });

  test("a school-wide report, made by the school's administrator with no campus, reaches the whole school's copies", async () => {
    const item = await makeItem(true);
    const north1 = await makeQuiz({ campusId: north, item });
    const south1 = await makeQuiz({ campusId: south, item });
    await fixItem(item);
    const reportId = await file(admin, item.id);

    const res = await resolve(admin, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ copiesCorrected: 2 });
    expect(await copyOf(north1)).toMatchObject({ correctAnswer: "a", sourceVersion: 2 });
    expect(await copyOf(south1)).toMatchObject({ correctAnswer: "a", sourceVersion: 2 });
  });

  test("only a report resolved as FIXED can apply a correction; nothing is changed and the report stays open", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ campusId: north, item });
    await fixItem(item);
    const reportId = await file(teacher, item.id);

    const res = await resolve(reviewer, reportId, { outcome: "NOT_AN_ERROR", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(400);
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("OPEN");
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "b", sourceVersion: 1 });
  });

  test("the corrected question must be approved: a retired question is not pushed into assessments", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ campusId: north, item });
    await fixItem(item);
    const reportId = await file(teacher, item.id);
    await db.questionBankItem.update({ where: { id: item.id }, data: { status: "RETIRED", retiredReason: "Withdrawn for review." } });

    const res = await resolve(reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(400);
    expect(res.json.error.code).toBe("ITEM_NOT_APPROVED");
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("OPEN");
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "b", sourceVersion: 1 });
  });

  test("more than 5000 attempts are refused outright: nothing is changed, the report stays open", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ campusId: north, item });
    await db.quizAttempt.createMany({
      data: Array.from({ length: 5001 }, (_, i) => ({
        tenantId: t.id,
        quizId: q.quiz,
        studentId: kids[i % 2]!.student.id,
        answers: [{ questionId: q.copy, answer: "b" }],
        score: 100,
        isPassed: true,
        completedAt: new Date(),
      })),
    });
    await fixItem(item);
    const reportId = await file(teacher, item.id);

    const res = await resolve(reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(400);
    expect(res.json.error.code).toBe("TOO_MANY_ATTEMPTS");
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("OPEN");
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "b", sourceVersion: 1 });
    expect(await db.quizAttempt.count({ where: { quizId: q.quiz, score: 100 } })).toBe(5001);
    expect(await db.questionBankAudit.count({ where: { ref: reportId } })).toBe(1); // only REPORT_FILED
  });
});
