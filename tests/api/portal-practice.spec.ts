import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { approvedItem, guardianOf, member, pupil, resetPractice, setBank, type Person, type Pupil } from "../support/qbank-world";
import { normalizeLabel } from "@/lib/question-bank/labels";

// A pupil's practice in the portal (task 0024 slice 4): starting a set, answering, finishing, the history, and who may read it. Besides the flow, the cases the first version of this
// slice got wrong:
//   - the daily cap counted only questions ANSWERED, so a pupil could open any number of sets before answering one and draw far more than the cap;
//   - two answers to one question sent together were both stored;
//   - an answer was accepted after the school switched pupil access off;
//   - a pupil with no class was offered the questions written for another class;
//   - the history route took a student id from the query and returned THAT pupil's practice (their answers, the answer keys) to any pupil and any guardian of the school.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let a: TestTenant;
let admin: Person;
let p1: Pupil; // class "JSS 1"
let p2: Pupil; // class "JSS 2"
let loose: Pupil; // no class
let parent1: Person; // linked to p1
let parent2: Person; // linked to p2 only
let parentPending: Person; // a link to p1 that is not approved
let parentRevoked: Person; // a link to p1 that was revoked
let teacher: Person;
let BASE = "";
const PRACTICE = () => `${BASE}/portal/practice`;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Practice", campuses: ["North"] });
  BASE = `/api/v1/schools/${a.code}`;
  const north = a.campuses[0].id;
  admin = await member(a, Role.ADMIN, null, "Admin");
  teacher = await member(a, Role.TEACHING_STAFF, north, "Teacher");
  p1 = await pupil(a, north, "JSS 1", "PupilOne");
  p2 = await pupil(a, north, "JSS 2", "PupilTwo");
  loose = await pupil(a, north, null, "Loose");
  parent1 = await guardianOf(a, [p1.student.id], "APPROVED", "ParentOne");
  parent2 = await guardianOf(a, [p2.student.id], "APPROVED", "ParentTwo");
  parentPending = await guardianOf(a, [p1.student.id], "PENDING", "ParentPending");
  parentRevoked = await guardianOf(a, [p1.student.id], "REVOKED", "ParentRevoked");
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

let jss2Key = "";
test.beforeEach(async () => {
  await resetPractice();
  await db.questionBankItem.deleteMany({ where: { tenantId: a.id } });
  jss2Key = normalizeLabel("JSS 2");
  // twelve questions for every class and three written for JSS 2 only
  for (let i = 0; i < 12; i++) await approvedItem(a.id, null, admin.user.id);
  for (let i = 0; i < 3; i++) {
    const item = await approvedItem(a.id, null, admin.user.id, { topic: "Only JSS 2" });
    await db.questionBankClassTag.create({ data: { tenantId: a.id, itemId: item.id, label: "JSS 2", labelKey: jss2Key } });
  }
  await setBank(a.id, admin.user.id, "bank.practice.minPoolSize", 3);
  await setBank(a.id, admin.user.id, "bank.practice.dailyCap", 5);
});

const start = (who: Person, size = 3) => api(`${PRACTICE()}/sessions`, { method: "POST", cookie: who.cookie, body: { size } });
const answer = (who: Person, sessionId: string, bankItemId: string, value: unknown = "a") =>
  api(`${PRACTICE()}/sessions/${sessionId}/answers`, { method: "POST", cookie: who.cookie, body: { bankItemId, answer: value } });
const history = (who: Person, studentId?: string) =>
  api(`${PRACTICE()}/history${studentId ? `?studentId=${studentId}` : ""}`, { cookie: who.cookie });

/// A finished session of `who` with one answered question, written straight to the database, and the question's prompt.
async function sessionWithAnswer(who: Pupil) {
  const item = await approvedItem(a.id, null, admin.user.id, { prompt: `Secret prompt of ${who.user.name} ${Math.random()}` });
  const session = await db.practiceSession.create({
    data: {
      tenantId: a.id,
      campusId: who.student.campusId,
      studentId: who.student.id,
      subjectLabel: "Mathematics",
      subjectKey: "mathematics",
      size: 1,
      itemIds: [item.id],
      finishedAt: new Date(),
    },
  });
  await db.practiceAttempt.create({
    data: { tenantId: a.id, sessionId: session.id, studentId: who.student.id, bankItemId: item.id, version: 1, answer: "a", correct: true },
  });
  return item.prompt;
}

test.describe("the flow", () => {
  test("a pupil starts a set, answers, finishes, and sees it in the history; the questions carry no answer key", async () => {
    const res = await start(p1, 3);
    expect(res.status).toBe(201);
    const { session, questions } = res.json.data as { session: { id: string; size: number }; questions: Record<string, unknown>[] };
    expect(session.size).toBe(3);
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q).not.toHaveProperty("correctAnswer");
      expect(q).not.toHaveProperty("explanation");
    }
    const first = await answer(p1, session.id, questions[0].id as string, "a");
    expect(first.status).toBe(200);
    expect(first.json.data).toMatchObject({ answered: true, correct: true });
    const done = await api(`${PRACTICE()}/sessions/${session.id}/finish`, { method: "POST", cookie: p1.cookie });
    expect(done.status).toBe(200);
    expect(done.json.data).toMatchObject({ totalAttempted: 1, totalCorrect: 1 });
    const own = await history(p1);
    expect(own.status).toBe(200);
    expect(own.json.data.mode).toBe("FULL");
    expect(own.json.data.sessions[0].attempts).toHaveLength(1);
  });

  test("a guardian, a teacher and a signed-out caller cannot start a set", async () => {
    expect((await start(parent1)).status).toBe(403);
    expect((await start(teacher)).status).toBe(403);
    expect((await api(`${PRACTICE()}/sessions`, { method: "POST", body: { size: 3 } })).status).toBe(401);
  });

  test("a pupil cannot answer in, or finish, another pupil's set", async () => {
    const res = await start(p1, 3);
    const { session, questions } = res.json.data;
    expect((await answer(p2, session.id, questions[0].id)).status).toBe(404);
    expect((await api(`${PRACTICE()}/sessions/${session.id}/finish`, { method: "POST", cookie: p2.cookie })).status).toBe(404);
  });
});

test.describe("the daily cap", () => {
  test("sets opened one after another draw no more than the cap in all, even when none has been answered", async () => {
    const sizes: number[] = [];
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await start(p1, 3);
      statuses.push(res.status);
      if (res.status === 201) sizes.push(res.json.data.session.size);
    }
    expect(sizes).toEqual([3, 2]); // 3 + 2 = the cap of 5; the third has nothing left
    expect(statuses).toEqual([201, 201, 429]);
  });

  test("sets opened at the same moment together draw no more than the cap", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => start(p1, 3)));
    const drawn = results.filter((r) => r.status === 201).reduce((sum, r) => sum + (r.json.data.session.size as number), 0);
    expect(drawn).toBe(5);
    expect(results.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(3);
  });

  test("the cap is each pupil's own", async () => {
    expect((await start(p1, 5)).status).toBe(201);
    expect((await start(p1, 1)).status).toBe(429);
    expect((await start(p2, 5)).status).toBe(201);
  });
});

test.describe("answering", () => {
  test("two answers to one question sent together are stored once", async () => {
    const res = await start(p1, 3);
    const { session, questions } = res.json.data;
    const results = await Promise.all(Array.from({ length: 8 }, () => answer(p1, session.id, questions[0].id, "a")));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of results.filter((r) => r.status !== 200)) {
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe("ALREADY_ANSWERED");
    }
    expect(await db.practiceAttempt.count({ where: { sessionId: session.id, bankItemId: questions[0].id } })).toBe(1);
  });

  test("an answer is refused once the school has switched pupil access off", async () => {
    const res = await start(p1, 3);
    const { session, questions } = res.json.data;
    await setBank(a.id, admin.user.id, "bank.access.pupils", false);
    const late = await answer(p1, session.id, questions[0].id);
    expect(late.status).toBe(403);
    expect(late.json.error.code).toBe("PRACTICE_CLOSED");
    expect(await db.practiceAttempt.count({ where: { sessionId: session.id } })).toBe(0);
  });

  test("a question that is not in the set cannot be answered", async () => {
    const res = await start(p1, 3);
    const other = await approvedItem(a.id, null, admin.user.id);
    const bad = await answer(p1, res.json.data.session.id, other.id);
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("INVALID_QUESTION");
  });
});

test.describe("which questions a pupil is offered", () => {
  const count = async (who: Person) => {
    const res = await api(`${PRACTICE()}/options`, { cookie: who.cookie });
    expect(res.status).toBe(200);
    const maths = (res.json.data.subjects as { subject: string; count: number }[]).find((s) => s.subject === "Mathematics");
    return maths?.count ?? 0;
  };

  test("a class gets the questions for every class and its own; a pupil with no class gets only those for every class", async () => {
    expect(await count(p1)).toBe(12);
    expect(await count(p2)).toBe(15);
    expect(await count(loose)).toBe(12);
  });

  test("a pupil with no class is never dealt a question written for a class", async () => {
    const res = await start(loose, 5);
    expect(res.status).toBe(201);
    const ids = (res.json.data.questions as { id: string }[]).map((q) => q.id);
    expect(await db.questionBankItem.count({ where: { id: { in: ids }, classTags: { some: {} } } })).toBe(0);
  });
});

test.describe("the history, and whose it is", () => {
  test("a pupil sees their own, with or without naming themselves, and nobody else's", async () => {
    const mine = await sessionWithAnswer(p1);
    const theirs = await sessionWithAnswer(p2);
    for (const res of [await history(p1), await history(p1, p1.student.id)]) {
      expect(res.status).toBe(200);
      expect(res.text).toContain(mine);
      expect(res.text).not.toContain(theirs);
    }
    const peek = await history(p1, p2.student.id);
    expect(peek.status).toBe(404);
    expect(peek.text).not.toContain(theirs);
  });

  test("a guardian reads only the pupils they are linked to, and only as far as the school allows", async () => {
    const mine = await sessionWithAnswer(p1);
    const theirs = await sessionWithAnswer(p2);

    // the school's default: a guardian reaches nothing
    expect((await history(parent1, p1.student.id)).status).toBe(403);

    await setBank(a.id, admin.user.id, "bank.parents.view", "SUMMARY");
    const summary = await history(parent1, p1.student.id);
    expect(summary.status).toBe(200);
    expect(summary.json.data.mode).toBe("SUMMARY");
    expect(summary.text).not.toContain(mine); // a summary names no question

    await resetSettingsFor("bank.parents.view");
    await setBank(a.id, admin.user.id, "bank.parents.view", "FULL");
    const full = await history(parent1, p1.student.id);
    expect(full.status).toBe(200);
    expect(full.json.data.mode).toBe("FULL");
    expect(full.text).toContain(mine);

    // another pupil, a pupil of someone else, a link that is only pending or was revoked, and no student named at all
    for (const res of [
      await history(parent1, p2.student.id),
      await history(parent2, p1.student.id),
      await history(parentPending, p1.student.id),
      await history(parentRevoked, p1.student.id),
      await history(parent1),
    ]) {
      expect(res.status).toBe(404);
      expect(res.text).not.toContain(theirs);
      expect(res.text).not.toContain(mine);
    }
  });

  test("a teacher and a signed-out caller cannot read a pupil's history", async () => {
    expect((await history(teacher, p1.student.id)).status).toBe(403);
    expect((await api(`${PRACTICE()}/history?studentId=${p1.student.id}`)).status).toBe(401);
  });

  test("another school's pupil id is nobody's", async () => {
    const b = await createTenant({ name: "Beta Practice", campuses: ["Elsewhere"] });
    const foreign = await pupil(b, b.campuses[0].id, null, "Foreign");
    const res = await history(parent1, foreign.student.id);
    expect(res.status).toBe(404);
    const also = await history(p1, foreign.student.id);
    expect(also.status).toBe(404);
  });
});

/// The switches are rows; replacing one means removing the old row (the specs write school-wide rows only).
async function resetSettingsFor(key: string) {
  await db.questionBankSetting.deleteMany({ where: { tenantId: a.id, key } });
}
