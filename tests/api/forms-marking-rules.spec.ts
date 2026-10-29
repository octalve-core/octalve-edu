import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { member, pupil, type Person, type Pupil } from "../support/qbank-world";

// What a teacher's marks mean (task 0024, manual marking). A mark is given to a question the teacher is meant to mark by hand: an answer the system already marked is not the
// teacher's to change, and an attempt the pupil has not finished is not marked at all. An answer counts as CORRECT only for full marks of a question that is worth marks. The total of an
// attempt is the sum of its answers as they are when the mark is written, so two teachers marking two answers of one attempt at the same moment cannot undo each other. A batch names each
// answer once. (The same rules as AlEemaan's manual-marking-rules spec; this one runs against a school with campuses.)

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let t: TestTenant;
let north: string;
let marker: Person;
let kid: Pupil;

type Seed = { form: string; response: string; auto: string; a: string; b: string; free: string };

/// An attempt with one question the system marked (5 points, full marks), two the teacher marks by hand (10 points each, nothing given yet) and one by hand that is worth nothing.
async function seed(status: "COMPLETED" | "IN_PROGRESS" = "COMPLETED"): Promise<Seed> {
  const form = await db.form.create({
    data: {
      tenantId: t.id,
      campusId: north,
      kind: "PRACTICE_SET",
      title: `Marking ${Math.random().toString(36).slice(2, 7)}`,
      status: "PUBLISHED",
      createdById: marker.user.id,
    },
  });
  const question = (prompt: string, points: number, markingMethod: "AUTO" | "MANUAL", sortOrder: number) =>
    db.formQuestion.create({
      data: { tenantId: t.id, formId: form.id, prompt, questionType: "SHORT", points, markingMethod, sortOrder, correctAnswer: "key" },
    });
  const qAuto = await question("Auto", 5, "AUTO", 1);
  const qA = await question("Manual A", 10, "MANUAL", 2);
  const qB = await question("Manual B", 10, "MANUAL", 3);
  const qFree = await question("Manual, worth nothing", 0, "MANUAL", 4);
  const response = await db.formResponse.create({
    data: {
      tenantId: t.id,
      campusId: north,
      formId: form.id,
      studentId: kid.student.id,
      status,
      score: 5,
      maxScore: 25,
      markingStatus: "PENDING",
      submittedAt: status === "COMPLETED" ? new Date() : null,
    },
  });
  const answer = (formQuestionId: string, score: number, markingStatus: "NOT_REQUIRED" | "PENDING", isCorrect: boolean | null) =>
    db.formAnswer.create({
      data: { tenantId: t.id, responseId: response.id, formQuestionId, value: "x", score, markingStatus, isCorrect },
    });
  const auto = await answer(qAuto.id, 5, "NOT_REQUIRED", true);
  const a = await answer(qA.id, 0, "PENDING", null);
  const b = await answer(qB.id, 0, "PENDING", null);
  const free = await answer(qFree.id, 0, "PENDING", null);
  return { form: form.id, response: response.id, auto: auto.id, a: a.id, b: b.id, free: free.id };
}

const mark = (s: Seed, body: Record<string, unknown>) =>
  api(`/api/v1/schools/${t.code}/forms/${s.form}/responses/${s.response}/marking`, { method: "PATCH", cookie: marker.cookie, body });
const state = async (s: Seed) => {
  const response = await db.formResponse.findUniqueOrThrow({ where: { id: s.response } });
  const answers = await db.formAnswer.findMany({ where: { responseId: s.response } });
  const byId = Object.fromEntries(answers.map((x) => [x.id, x]));
  return { response, auto: byId[s.auto], a: byId[s.a], b: byId[s.b], free: byId[s.free] };
};
const audits = (s: Seed) => db.formMarkingAudit.count({ where: { responseId: s.response } });

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Marking Rules School", campuses: ["North"] });
  north = t.campuses[0].id;
  marker = await member(t, Role.TEACHING_STAFF, north, "Marker");
  kid = await pupil(t, north, "JSS 1", "Kid");
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("only a question meant for hand marking is marked by hand", () => {
  test("an answer the system already marked is refused, singly and in a batch, and nothing changes", async () => {
    const s = await seed();
    const single = await mark(s, { answerId: s.auto, score: 0 });
    expect(single.status, single.text.slice(0, 160)).toBe(400);
    const batch = await mark(s, {
      answers: [
        { answerId: s.a, score: 7 },
        { answerId: s.auto, score: 0 },
      ],
    });
    expect(batch.status, batch.text.slice(0, 160)).toBe(400);
    const after = await state(s);
    expect(after.auto).toMatchObject({ score: 5, isCorrect: true, markingStatus: "NOT_REQUIRED" });
    expect(after.a).toMatchObject({ score: 0, markingStatus: "PENDING" }); // the batch is all or nothing
    expect(after.response).toMatchObject({ score: 5, markingStatus: "PENDING" });
    expect(await audits(s)).toBe(0);
  });

  test("a question meant for hand marking is marked, and the total follows", async () => {
    const s = await seed();
    const res = await mark(s, { answerId: s.a, score: 7 });
    expect(res.status, res.text.slice(0, 160)).toBe(200);
    expect(res.json.data).toMatchObject({ scoreAwarded: 7, overallScore: 12, overallMarkingStatus: "PARTIALLY_MARKED" });
    const next = await mark(s, { answerId: s.b, score: 4 });
    expect(next.json.data).toMatchObject({ overallScore: 16, overallMarkingStatus: "PARTIALLY_MARKED" }); // the question worth nothing is still waiting
    const done = await mark(s, { answerId: s.free, score: 0 });
    expect(done.json.data).toMatchObject({ overallScore: 16, overallMarkingStatus: "MARKED" });
  });

  test("an attempt the pupil has not finished is not marked", async () => {
    const s = await seed("IN_PROGRESS");
    const res = await mark(s, { answerId: s.a, score: 7 });
    expect(res.status, res.text.slice(0, 160)).toBe(400);
    expect((await state(s)).a).toMatchObject({ score: 0, markingStatus: "PENDING" });
    expect(await audits(s)).toBe(0);
  });
});

test.describe("correct means full marks of a question that is worth marks", () => {
  test("part marks and no marks are not correct; full marks are", async () => {
    const s = await seed();
    const part = await mark(s, { answerId: s.a, score: 4 });
    expect(part.status).toBe(200);
    expect((await state(s)).a.isCorrect, "4 of 10 is not correct").toBe(false);
    const none = await mark(s, { answerId: s.b, score: 0 });
    expect(none.status).toBe(200);
    expect((await state(s)).b.isCorrect, "0 of 10 is not correct").toBe(false);
    const full = await mark(s, { answerId: s.a, score: 10 }); // marking again replaces the mark
    expect(full.status).toBe(200);
    const after = await state(s);
    expect(after.a).toMatchObject({ score: 10, isCorrect: true });
    expect(after.response.score, "re-marking replaces; it does not add").toBe(15);
  });

  test("a question worth nothing is never correct, however it is marked", async () => {
    const s = await seed();
    const single = await mark(s, { answerId: s.free, score: 0 });
    expect(single.status, single.text.slice(0, 160)).toBe(200);
    expect((await state(s)).free.isCorrect).toBe(false);
    const batch = await mark(s, { answers: [{ answerId: s.free, score: 0 }] });
    expect(batch.status, batch.text.slice(0, 160)).toBe(200);
    expect((await state(s)).free.isCorrect).toBe(false);
  });

  test("in a batch, each answer is judged on its own marks", async () => {
    const s = await seed();
    const res = await mark(s, {
      answers: [
        { answerId: s.a, score: 9 },
        { answerId: s.b, score: 10 },
      ],
    });
    expect(res.status, res.text.slice(0, 160)).toBe(200);
    const after = await state(s);
    expect(after.a.isCorrect).toBe(false);
    expect(after.b.isCorrect).toBe(true);
    expect(after.response.score).toBe(24);
  });
});

test.describe("the total of an attempt", () => {
  test("two teachers marking two answers of one attempt at the same moment cannot undo each other", async () => {
    // run it several times: a lost update depends on timing, and the fix must hold every time
    for (let round = 0; round < 8; round++) {
      const s = await seed();
      const [one, two] = await Promise.all([mark(s, { answerId: s.a, score: 7 }), mark(s, { answerId: s.b, score: 4 })]);
      expect(one.status, `round ${round}`).toBe(200);
      expect(two.status, `round ${round}`).toBe(200);
      const after = await state(s);
      expect(after.response.score, `round ${round}: both marks are in the total (5 + 7 + 4)`).toBe(16);
    }
  });

  test("a batch names each answer once", async () => {
    const s = await seed();
    const res = await mark(s, {
      answers: [
        { answerId: s.a, score: 7 },
        { answerId: s.a, score: 2 },
      ],
    });
    expect(res.status, res.text.slice(0, 160)).toBe(400);
    expect((await state(s)).a).toMatchObject({ score: 0, markingStatus: "PENDING" });
    expect(await audits(s)).toBe(0);
  });
});
