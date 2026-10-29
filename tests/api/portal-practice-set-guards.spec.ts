import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { classArm, member, pupil, type Person, type Pupil } from "../support/qbank-world";

// What a pupil may do with a practice set, in the routes the pupil uses: see it, start an attempt and submit it.
//
//   - See and start: only a pupil the set is for: its audience (the classes it names) and its campus (a set of one campus is not for the pupils of another; a whole-school set is for all).
//     Two starts at the same moment are one attempt, not two. An attempt left open past the set's time limit is not picked up again.
//   - Submit: only while the set is open (published, inside its opening and closing times) and inside its time limit, only for a practice set, once per attempt.
//
// The two races are tried several times over: they are a matter of timing, and one clean round proves nothing. (The same rules as AlEemaan's practice-set-guards spec; this one
// runs against a school with campuses, where the set's campus matters too.)

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });
const ROUNDS = 6;
const AT_ONCE = 6;
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

let t: TestTenant;
let north: string;
let south: string;
let author: Person;
let p1: Pupil; // North, JSS 1
let p2: Pupil; // North, JSS 2
let southern: Pupil; // South, JSS 1
let group1: string;

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Practice Guards School", campuses: ["North", "South"] });
  north = t.campuses[0].id;
  south = t.campuses[1].id;
  author = await member(t, Role.TEACHING_STAFF, north, "Author");
  p1 = await pupil(t, north, "JSS 1", "Zainab");
  p2 = await pupil(t, north, "JSS 2", "Bilal");
  southern = await pupil(t, south, "JSS 1", "Sade");
  group1 = (await classArm(t, north, "JSS 1")).groupId;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

type SetOptions = {
  campusId?: string | null;
  forGroup?: string | null;
  maxDurationMinutes?: number | null;
  opensAt?: Date | null;
  closesAt?: Date | null;
};

/** A published practice set with two auto-marked questions (1 point and 2 points; the answers are "a" and "b"), for the North campus and JSS 1 unless said otherwise. */
async function makeSet(opts: SetOptions = {}) {
  const campusId = opts.campusId === undefined ? north : opts.campusId;
  const form = await db.form.create({
    data: {
      tenantId: t.id,
      campusId,
      kind: "PRACTICE_SET",
      title: "Practice",
      status: "PUBLISHED",
      createdById: author.user.id,
      maxDurationMinutes: opts.maxDurationMinutes ?? null,
      opensAt: opts.opensAt ?? null,
      closesAt: opts.closesAt ?? null,
    },
  });
  const forGroup = opts.forGroup === undefined ? group1 : opts.forGroup;
  if (forGroup) {
    await db.formAudience.create({
      data: { tenantId: t.id, formId: form.id, kind: "MEMBERS", roles: ["STUDENT"], classGroupIds: [forGroup] },
    });
  }
  const options = [
    { id: "a", text: "One" },
    { id: "b", text: "Two" },
  ];
  const q1 = await db.formQuestion.create({
    data: {
      tenantId: t.id,
      formId: form.id,
      prompt: "First?",
      questionType: "SINGLE",
      options,
      correctAnswer: "a",
      points: 1,
      sortOrder: 0,
    },
  });
  const q2 = await db.formQuestion.create({
    data: {
      tenantId: t.id,
      formId: form.id,
      prompt: "Second?",
      questionType: "SINGLE",
      options,
      correctAnswer: "b",
      points: 2,
      sortOrder: 1,
    },
  });
  return { formId: form.id, q1: q1.id, q2: q2.id };
}
type PracticeSet = Awaited<ReturnType<typeof makeSet>>;

const base = () => `/api/v1/schools/${t.code}/portal/forms/practice-sets`;
const list = (p: Pupil) => api(base(), { cookie: p.cookie });
const read = (p: Pupil, formId: string) => api(`${base()}/${formId}`, { cookie: p.cookie });
const start = (p: Pupil, formId: string) => api(`${base()}/${formId}/start`, { method: "POST", cookie: p.cookie });
const submit = (p: Pupil, s: PracticeSet, responseId: string) =>
  api(`${base()}/${s.formId}/submit`, {
    method: "POST",
    cookie: p.cookie,
    body: {
      responseId,
      answers: [
        { formQuestionId: s.q1, value: "a" },
        { formQuestionId: s.q2, value: "b" },
      ],
    },
  });
const attemptsOf = (formId: string) => db.formResponse.findMany({ where: { formId }, orderBy: { createdAt: "asc" } });
const answersOf = (formId: string) => db.formAnswer.count({ where: { response: { formId } } });

test.describe("seeing and starting an attempt", () => {
  test("only a pupil the set is for may start it", async () => {
    const set = await makeSet();

    const outside = await start(p2, set.formId);
    expect(outside.status, outside.text.slice(0, 160)).toBe(403);
    expect(await attemptsOf(set.formId), "nothing was written for the pupil outside the audience").toHaveLength(0);

    const inside = await start(p1, set.formId);
    expect(inside.status).toBe(201);
    expect(await attemptsOf(set.formId)).toHaveLength(1);
  });

  test("a set of one campus is not for the pupils of another; a whole-school set is for all", async () => {
    const northOnly = await makeSet({ forGroup: null });
    const everyone = await makeSet({ campusId: null, forGroup: null });

    const seen = async (p: Pupil) => ((await list(p)).json.data.practiceSets as { id: string }[]).map((s) => s.id);
    expect(await seen(p1), "a North pupil sees both").toEqual(expect.arrayContaining([northOnly.formId, everyone.formId]));
    const southSees = await seen(southern);
    expect(southSees, "a South pupil sees the whole-school set").toContain(everyone.formId);
    expect(southSees, "and not the North set").not.toContain(northOnly.formId);

    expect([403, 404], "reading it by its id").toContain((await read(southern, northOnly.formId)).status);
    const started = await start(southern, northOnly.formId);
    expect([403, 404], "starting it").toContain(started.status);
    expect(await attemptsOf(northOnly.formId), "nothing was written for the South pupil").toHaveLength(0);

    expect((await start(southern, everyone.formId)).status, "a whole-school set can be started from South").toBe(201);
  });

  test("a set with no audience restriction can be started by any pupil of its campus", async () => {
    const set = await makeSet({ forGroup: null });
    expect((await start(p1, set.formId)).status).toBe(201);
    expect((await start(p2, set.formId)).status).toBe(201);
  });

  test("a set that is not open yet, or past its closing time, cannot be started", async () => {
    const notYet = await makeSet({ opensAt: new Date(Date.now() + 3_600_000) });
    expect((await start(p1, notYet.formId)).status).toBe(403);
    const over = await makeSet({ opensAt: minutesAgo(120), closesAt: minutesAgo(60) });
    expect((await start(p1, over.formId)).status).toBe(403);
  });

  test("an attempt inside its time limit is resumed", async () => {
    const set = await makeSet({ maxDurationMinutes: 10 });
    const first = await start(p1, set.formId);
    await db.formResponse.update({ where: { id: first.json.data.responseId }, data: { startedAt: minutesAgo(5) } });
    const again = await start(p1, set.formId);
    expect(again.status).toBe(200);
    expect(again.json.data).toMatchObject({ responseId: first.json.data.responseId, isResume: true });
  });

  test("an attempt left open past its time limit is abandoned and a fresh one is opened", async () => {
    const set = await makeSet({ maxDurationMinutes: 10 });
    const first = await start(p1, set.formId);
    await db.formResponse.update({ where: { id: first.json.data.responseId }, data: { startedAt: minutesAgo(12) } });

    const again = await start(p1, set.formId);
    expect(again.status).toBe(201);
    expect(again.json.data.isResume).toBe(false);
    expect(again.json.data.responseId).not.toBe(first.json.data.responseId);
    const old = await db.formResponse.findUniqueOrThrow({ where: { id: first.json.data.responseId } });
    expect(old.status).toBe("ABANDONED");
  });

  test("starts made at the same moment are one attempt, not several", async () => {
    const set = await makeSet();
    for (let round = 0; round < ROUNDS; round++) {
      await db.formResponse.deleteMany({ where: { formId: set.formId } });
      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => start(p1, set.formId)));
      for (const r of results) expect([200, 201], `round ${round}`).toContain(r.status);
      const open = await db.formResponse.findMany({ where: { formId: set.formId, status: "IN_PROGRESS" } });
      expect(open, `round ${round}: one open attempt`).toHaveLength(1);
      expect(new Set(results.map((r) => r.json.data.responseId as string)), `round ${round}: every start got the same attempt`).toEqual(
        new Set([open[0]!.id]),
      );
      expect(
        results.filter((r) => r.json.data.isResume === false),
        `round ${round}: exactly one start made it`,
      ).toHaveLength(1);
    }
  });
});

test.describe("submitting an attempt", () => {
  test("a set the teacher has closed takes no more answers, and the attempt is left as it was", async () => {
    const set = await makeSet();
    const { responseId } = (await start(p1, set.formId)).json.data;
    await db.form.update({ where: { id: set.formId }, data: { status: "CLOSED", closedAt: new Date(), closedById: author.user.id } });

    const res = await submit(p1, set, responseId);
    expect(res.status, res.text.slice(0, 160)).toBe(403);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: responseId } })).status).toBe("IN_PROGRESS");
    expect(await answersOf(set.formId)).toBe(0);
  });

  test("a set past its closing time takes no more answers", async () => {
    const set = await makeSet({ closesAt: new Date(Date.now() + 3_600_000) });
    const { responseId } = (await start(p1, set.formId)).json.data;
    await db.form.update({ where: { id: set.formId }, data: { closesAt: minutesAgo(1) } });

    expect((await submit(p1, set, responseId)).status).toBe(403);
    expect(await answersOf(set.formId)).toBe(0);
  });

  test("a pupil who is no longer in the set's audience cannot submit an attempt they began", async () => {
    const set = await makeSet();
    const { responseId } = (await start(p1, set.formId)).json.data;
    // the teacher narrows the audience to another class after the pupil has started
    await db.formAudience.updateMany({
      where: { formId: set.formId },
      data: { classGroupIds: [(await classArm(t, north, "JSS 2")).groupId] },
    });

    const res = await submit(p1, set, responseId);
    expect(res.status, res.text.slice(0, 160)).toBe(403);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: responseId } })).status).toBe("IN_PROGRESS");
    expect(await answersOf(set.formId)).toBe(0);
  });

  test("nor can a pupil who has been moved to another class", async () => {
    const set = await makeSet();
    const { responseId } = (await start(p1, set.formId)).json.data;
    await db.studentEnrollment.updateMany({
      where: { studentId: p1.student.id },
      data: { classArmId: (await classArm(t, north, "JSS 2")).armId },
    });

    const res = await submit(p1, set, responseId);
    expect(res.status, res.text.slice(0, 160)).toBe(403);
    expect(await answersOf(set.formId)).toBe(0);
    // put back for the tests that follow
    await db.studentEnrollment.updateMany({
      where: { studentId: p1.student.id },
      data: { classArmId: (await classArm(t, north, "JSS 1")).armId },
    });
  });

  test("nor can a pupil who has been moved to another campus: the set is then not found", async () => {
    const set = await makeSet({ forGroup: null });
    const { responseId } = (await start(p1, set.formId)).json.data;
    await db.studentRecord.update({ where: { id: p1.student.id }, data: { campusId: south } });
    try {
      const res = await submit(p1, set, responseId);
      expect(res.status, res.text.slice(0, 160)).toBe(404);
      expect(await answersOf(set.formId)).toBe(0);
    } finally {
      await db.studentRecord.update({ where: { id: p1.student.id }, data: { campusId: north } });
    }
  });

  test("a set put back to draft takes no more answers", async () => {
    const set = await makeSet();
    const { responseId } = (await start(p1, set.formId)).json.data;
    await db.form.update({ where: { id: set.formId }, data: { status: "DRAFT" } });
    expect((await submit(p1, set, responseId)).status).toBe(403);
  });

  test("an open set takes the answers and marks them", async () => {
    const set = await makeSet({ closesAt: new Date(Date.now() + 3_600_000) });
    const { responseId } = (await start(p1, set.formId)).json.data;
    const res = await submit(p1, set, responseId);
    expect(res.status, res.text.slice(0, 160)).toBe(200);
    expect(res.json.data).toMatchObject({ status: "COMPLETED", totalScore: 3, maxScore: 3 });
    expect(await answersOf(set.formId)).toBe(2);
  });

  test("the time limit: a little past it is allowed for the network, well past it is refused and nothing is written", async () => {
    const set = await makeSet({ maxDurationMinutes: 10 });
    const { responseId } = (await start(p1, set.formId)).json.data;

    await db.formResponse.update({ where: { id: responseId }, data: { startedAt: new Date(Date.now() - 10 * 60_000 - 20_000) } });
    const late = await submit(p1, set, responseId);
    expect(late.status, "20 seconds over, inside the allowance").toBe(200);

    const second = await makeSet({ maxDurationMinutes: 10 });
    const next = (await start(p1, second.formId)).json.data.responseId;
    await db.formResponse.update({ where: { id: next }, data: { startedAt: minutesAgo(12) } });
    const over = await submit(p1, second, next);
    expect(over.status, "two minutes over").toBe(403);
    expect(over.json.error.code).toBe("TIME_UP");
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: next } })).status).toBe("IN_PROGRESS");
    expect(await answersOf(second.formId)).toBe(0);
  });

  test("a set with no time limit takes an answer however long the pupil took", async () => {
    const set = await makeSet({ maxDurationMinutes: null });
    const { responseId } = (await start(p1, set.formId)).json.data;
    await db.formResponse.update({ where: { id: responseId }, data: { startedAt: minutesAgo(60 * 24 * 7) } });
    expect((await submit(p1, set, responseId)).status).toBe(200);
  });

  test("a response on another kind of form is not a practice attempt", async () => {
    const survey = await db.form.create({
      data: { tenantId: t.id, campusId: north, kind: "QUESTIONNAIRE", title: "Survey", status: "PUBLISHED", createdById: author.user.id },
    });
    const sq = await db.formQuestion.create({
      data: { tenantId: t.id, formId: survey.id, prompt: "How was it?", questionType: "SHORT", points: 1, sortOrder: 0 },
    });
    const response = await db.formResponse.create({
      data: {
        tenantId: t.id,
        campusId: north,
        formId: survey.id,
        studentId: p1.student.id,
        respondentId: p1.student.id,
        status: "IN_PROGRESS",
      },
    });

    const res = await submit(p1, { formId: survey.id, q1: sq.id, q2: sq.id }, response.id);
    expect(res.status, res.text.slice(0, 160)).toBe(404);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: response.id } })).status).toBe("IN_PROGRESS");
  });

  test("another pupil's attempt is not theirs to submit", async () => {
    const set = await makeSet({ forGroup: null });
    const { responseId } = (await start(p1, set.formId)).json.data;
    expect((await submit(p2, set, responseId)).status).toBe(404);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: responseId } })).status).toBe("IN_PROGRESS");
  });

  test("submits made at the same moment are one submission: one succeeds, the rest are refused, and the answers are written once", async () => {
    const set = await makeSet();
    for (let round = 0; round < ROUNDS; round++) {
      await db.formResponse.deleteMany({ where: { formId: set.formId } });
      const { responseId } = (await start(p1, set.formId)).json.data;

      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => submit(p1, set, responseId)));
      expect(results.map((r) => r.status).sort(), `round ${round}: one 200, the rest 400`).toEqual([200, ...Array(AT_ONCE - 1).fill(400)]);
      expect(await answersOf(set.formId), `round ${round}: each question answered once`).toBe(2);
      expect(await db.formResponse.findUniqueOrThrow({ where: { id: responseId } }), `round ${round}`).toMatchObject({
        status: "COMPLETED",
        score: 3,
        maxScore: 3,
      });
    }
  });
});
