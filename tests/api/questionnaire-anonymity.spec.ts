import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { guardianOf, member, pupil, setBank, type Person, type Pupil } from "../support/qbank-world";

// A questionnaire pupils answer from the portal (task 0024 slice 8), and what the school learns from it.
//
// An ANONYMOUS questionnaire promises that nobody, not even the school's administrator reading the database, can tell which pupil gave which answer. The first version kept the
// pupil's own id in the participation record (needed to stop a second answer) and stamped the participation, the response and its answers with the same instant, so the id could
// be joined to the response by that instant. Held here:
//   - the participation record carries a code that is the same for the same pupil and survey, different for another survey, and cannot be turned back into the pupil without the
//     school's key; the times of an anonymous survey name the day only;
//   - a second answer is refused, also when two arrive together (a 400, not a server error);
//   - the results of an anonymous survey are withheld until enough pupils have answered that no answer points at a person (the switch bank.smallSummary.min, never below 3).
// A questionnaire that is NOT anonymous keeps the pupil and the moment, because the school asked for them.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let a: TestTenant;
let admin: Person;
let teacher: Person;
const pupils: Pupil[] = [];
let guardian: Person;
let BASE = "";
const portal = (path: string) => `${BASE}/portal/forms/questionnaires${path}`;

/// A published questionnaire for the school's pupils, with one yes/no question, written straight to the database.
async function questionnaire(anonymous: boolean, title = "Pupil survey") {
  const form = await db.form.create({
    data: {
      tenantId: a.id,
      campusId: a.campuses[0].id,
      kind: "QUESTIONNAIRE",
      title,
      status: "PUBLISHED",
      isAnonymous: anonymous,
      createdById: admin.user.id,
    },
  });
  await db.formAudience.create({ data: { tenantId: a.id, formId: form.id, kind: "MEMBERS", roles: ["STUDENT"] } });
  const q = await db.formQuestion.create({
    data: {
      tenantId: a.id,
      formId: form.id,
      prompt: "Do you feel safe at school?",
      questionType: "SINGLE",
      options: [
        { id: "yes", text: "Yes" },
        { id: "no", text: "No" },
      ],
      points: 0,
    },
  });
  return { formId: form.id, questionId: q.id };
}

const submit = (who: Person, formId: string, questionId: string, value = "yes") =>
  api(portal(`/${formId}/submit`), { method: "POST", cookie: who.cookie, body: { answers: [{ formQuestionId: questionId, value }] } });
const analytics = (who: Person, formId: string) => api(`${BASE}/forms/${formId}/analytics`, { cookie: who.cookie });
const day = (d: Date | null) => d !== null && d.getTime() % 86_400_000 === 0;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Anonymity", campuses: ["North"] });
  BASE = `/api/v1/schools/${a.code}`;
  admin = await member(a, Role.ADMIN, null, "Admin");
  teacher = await member(a, Role.TEACHING_STAFF, a.campuses[0].id, "Teacher");
  for (let i = 1; i <= 6; i++) pupils.push(await pupil(a, a.campuses[0].id, "JSS 1", `Pupil${i}`));
  guardian = await guardianOf(a, [pupils[0].student.id]);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "FormAnswer", "FormResponse", "FormParticipation", "QuestionBankSetting" RESTART IDENTITY CASCADE`);
});

test.describe("what an anonymous questionnaire keeps", () => {
  test("the participation record holds a code, not the pupil, and nothing in it ties to the response by time", async () => {
    const { formId, questionId } = await questionnaire(true);
    const [p1] = pupils;
    expect((await submit(p1, formId, questionId)).status).toBe(200);

    const participation = await db.formParticipation.findMany({ where: { formId } });
    expect(participation).toHaveLength(1);
    expect(participation[0].respondentId).not.toBe(p1.student.id);
    expect(participation[0].respondentId).not.toContain(p1.student.id);
    expect(participation[0].respondentId).not.toBe(p1.user.id);
    expect(participation[0].respondentId).toMatch(/^[0-9a-f]{64}$/);

    const response = await db.formResponse.findFirstOrThrow({ where: { formId }, include: { answers: true } });
    expect(response).toMatchObject({ respondentId: null, studentId: null, status: "COMPLETED" });
    // the only time anywhere is the day: the participation cannot be matched to the response, or either to an access log, by the second
    expect(day(participation[0].createdAt)).toBe(true);
    expect(day(response.startedAt)).toBe(true);
    expect(day(response.submittedAt)).toBe(true);
    expect(response.answers.every((x) => day(x.createdAt))).toBe(true);
  });

  test("the same pupil and survey always give the same code, another survey another code, another pupil another code", async () => {
    const one = await questionnaire(true, "One");
    const two = await questionnaire(true, "Two");
    const [p1, p2] = pupils;
    await submit(p1, one.formId, one.questionId);
    await submit(p1, two.formId, two.questionId);
    await submit(p2, one.formId, one.questionId);
    const codesOf = async (formId: string) => (await db.formParticipation.findMany({ where: { formId } })).map((r) => r.respondentId);
    const oneCodes = await codesOf(one.formId);
    const twoCodes = await codesOf(two.formId);
    expect(new Set(oneCodes).size).toBe(2); // two pupils, two codes
    expect(oneCodes.some((c) => twoCodes.includes(c))).toBe(false); // the same pupil in two surveys does not link
  });

  test("a questionnaire that is not anonymous keeps the pupil and the moment", async () => {
    const { formId, questionId } = await questionnaire(false);
    const [p1] = pupils;
    expect((await submit(p1, formId, questionId)).status).toBe(200);
    const participation = await db.formParticipation.findFirstOrThrow({ where: { formId } });
    expect(participation.respondentId).toBe(p1.student.id);
    const response = await db.formResponse.findFirstOrThrow({ where: { formId } });
    expect(response).toMatchObject({ respondentId: p1.student.id, studentId: p1.student.id });
    expect(day(response.submittedAt)).toBe(false);
  });
});

test.describe("one answer per pupil", () => {
  test("a second answer is refused, and the listing says the pupil has answered", async () => {
    const { formId, questionId } = await questionnaire(true);
    const [p1, p2] = pupils;
    expect((await submit(p1, formId, questionId)).status).toBe(200);
    const again = await submit(p1, formId, questionId, "no");
    expect(again.status).toBe(400);
    expect(again.json.error.code).toBe("ALREADY_SUBMITTED");
    expect(await db.formResponse.count({ where: { formId } })).toBe(1);

    const listFor = async (who: Person) =>
      ((await api(portal(""), { cookie: who.cookie })).json.data.questionnaires as { id: string; hasSubmitted: boolean }[]).find(
        (q) => q.id === formId,
      );
    expect((await listFor(p1))?.hasSubmitted).toBe(true);
    expect((await listFor(p2))?.hasSubmitted).toBe(false);
    const one = await api(portal(`/${formId}`), { cookie: p1.cookie });
    expect(one.json.data.hasSubmitted).toBe(true);
  });

  test("answers sent together by one pupil are stored once, and the others are told so rather than failing", async () => {
    const { formId, questionId } = await questionnaire(true);
    const [p1] = pupils;
    const results = await Promise.all(Array.from({ length: 6 }, () => submit(p1, formId, questionId)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of results.filter((r) => r.status !== 200)) {
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe("ALREADY_SUBMITTED");
    }
    expect(await db.formParticipation.count({ where: { formId } })).toBe(1);
    expect(await db.formResponse.count({ where: { formId } })).toBe(1);
  });

  test("a guardian and a teacher cannot answer a pupil questionnaire", async () => {
    const { formId, questionId } = await questionnaire(true);
    expect((await submit(guardian, formId, questionId)).status).toBe(403);
    expect((await submit(teacher, formId, questionId)).status).toBe(403);
    expect(await db.formResponse.count({ where: { formId } })).toBe(0);
  });
});

test.describe("results of an anonymous questionnaire", () => {
  const answerAll = async (formId: string, questionId: string, count: number) => {
    for (const [i, who] of pupils.slice(0, count).entries()) {
      expect((await submit(who, formId, questionId, i % 2 === 0 ? "yes" : "no")).status).toBe(200);
    }
  };

  test("are withheld while too few pupils have answered, then shown", async () => {
    const { formId, questionId } = await questionnaire(true);
    await answerAll(formId, questionId, 2);
    const few = await analytics(admin, formId);
    expect(few.status).toBe(200);
    expect(few.json.data).toMatchObject({ suppressed: true, minimumResponses: 5, totalResponses: 2 });
    expect(few.json.data.questions[0]).toMatchObject({ prompt: "Do you feel safe at school?", totalAnswers: 0 });
    expect(few.json.data.questions[0]).not.toHaveProperty("optionCounts");
    expect(few.json.data.questions[0]).not.toHaveProperty("textResponses");

    const rest = pupils.slice(2, 5);
    for (const who of rest) expect((await submit(who, formId, questionId, "yes")).status).toBe(200);
    const enough = await analytics(admin, formId);
    expect(enough.json.data.totalResponses).toBe(5);
    expect(enough.json.data.suppressed).not.toBe(true);
    const counts = enough.json.data.questions[0].optionCounts as { optionId: string; count: number }[];
    expect(counts.find((c) => c.optionId === "yes")?.count).toBe(4);
    expect(counts.find((c) => c.optionId === "no")?.count).toBe(1);
  });

  test("follow the school's own threshold, and a raised one withholds a survey that was shown", async () => {
    const { formId, questionId } = await questionnaire(true);
    await answerAll(formId, questionId, 5);
    expect((await analytics(admin, formId)).json.data.suppressed).not.toBe(true);
    await setBank(a.id, admin.user.id, "bank.smallSummary.min", 6);
    const res = await analytics(admin, formId);
    expect(res.json.data).toMatchObject({ suppressed: true, minimumResponses: 6, totalResponses: 5 });
  });

  test("count the pupils who answered, not the most answers to any one question", async () => {
    const { formId, questionId } = await questionnaire(true);
    await answerAll(formId, questionId, 3);
    // three more pupils answer with no answers at all
    for (const who of pupils.slice(3, 6)) {
      const res = await api(portal(`/${formId}/submit`), { method: "POST", cookie: who.cookie, body: { answers: [] } });
      expect(res.status).toBe(200);
    }
    expect((await analytics(admin, formId)).json.data.totalResponses).toBe(6);
  });

  test("of a questionnaire that is not anonymous are never withheld", async () => {
    const { formId, questionId } = await questionnaire(false);
    await answerAll(formId, questionId, 1);
    const res = await analytics(admin, formId);
    expect(res.json.data.suppressed).not.toBe(true);
    expect(res.json.data.questions[0].optionCounts).toBeDefined();
  });

  test("are for staff only", async () => {
    const { formId } = await questionnaire(true);
    expect((await analytics(pupils[0], formId)).status).toBe(403);
    expect((await analytics(guardian, formId)).status).toBe(403);
    expect((await api(`${BASE}/forms/${formId}/analytics`)).status).toBe(401);
  });
});
