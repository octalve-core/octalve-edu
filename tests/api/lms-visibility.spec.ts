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

// Who sees what in the LMS. Staff (ADMIN, CAMPUS_ADMIN, TEACHING_STAFF) see every assignment and quiz and every student's submission. A STUDENT sees PUBLISHED work only, and only
// their OWN submission. A PARENT and NON_TEACHING_STAFF see PUBLISHED work and no submissions at all (a guardian's access to a child's work is not designed yet). Marks and
// feedback belong to the student they were given to.

let a: TestTenant;
const user: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let rec1: { id: string };
let rec2: { id: string };
let subjectId: string;
let published: { id: string };
let draft: { id: string };
let publishedQuiz: { id: string };
let draftQuiz: { id: string };
let sub1: { id: string };
let sub2: { id: string };

const base = () => `/api/v1/schools/${a.code}`;
let seq = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;
const get = (who: string, path: string) => api(`${base()}${path}`, { baseUrl: SAAS_URL, cookie: cookie[who] });
const post = (who: string, path: string, body: object) =>
  api(`${base()}${path}`, { method: "POST", baseUrl: SAAS_URL, cookie: cookie[who], body });
async function cookieFor(who: TestUser) {
  const res = await loginAs(who, { baseUrl: SAAS_URL });
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const quiz = (status: "DRAFT" | "PUBLISHED") =>
  db.quiz.create({
    data: {
      tenantId: a.id,
      subjectId,
      title: uniq("Quiz "),
      status,
      questions: { create: [{ prompt: "2 + 2?", questionType: "SHORT_ANSWER", correctAnswer: "4", points: 1 }] },
    },
  });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "LMS Visibility School" });
  for (const [name, role] of [
    ["admin", Role.ADMIN],
    ["teacher", Role.TEACHING_STAFF],
    ["support", Role.NON_TEACHING_STAFF],
    ["parent", Role.PARENT],
    ["student1", Role.STUDENT],
    ["student2", Role.STUDENT],
  ] as const) {
    user[name] = await createUser({ name });
    await addMembership(user[name].id, a.id, role);
    cookie[name] = await cookieFor(user[name]);
  }
  const record = (userId: string, label: string) =>
    db.studentRecord.create({
      data: { tenantId: a.id, userId, firstName: label, lastName: uniq("L"), admissionNo: uniq("A"), dateOfBirth: new Date("2010-01-01") },
    });
  rec1 = await record(user.student1.id, "Alice");
  rec2 = await record(user.student2.id, "Bob");

  subjectId = (await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTH101" } })).id;
  published = await db.assignment.create({ data: { tenantId: a.id, subjectId, title: uniq("Published "), status: "PUBLISHED" } });
  draft = await db.assignment.create({ data: { tenantId: a.id, subjectId, title: uniq("Draft "), status: "DRAFT" } });
  // student 1's work has been marked; student 2's has not
  sub1 = await db.assignmentSubmission.create({
    data: {
      tenantId: a.id,
      assignmentId: published.id,
      studentId: rec1.id,
      content: "Alice's answers",
      status: "GRADED",
      score: 91,
      feedback: "Alice: well done",
      submittedAt: new Date(),
      gradedAt: new Date(),
    },
  });
  sub2 = await db.assignmentSubmission.create({
    data: {
      tenantId: a.id,
      assignmentId: published.id,
      studentId: rec2.id,
      content: "Bob's answers",
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
  publishedQuiz = await quiz("PUBLISHED");
  draftQuiz = await quiz("DRAFT");
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("submissions on an assignment", () => {
  test("staff see every student's submission, with the student's name and the marks", async () => {
    for (const who of ["teacher", "admin"]) {
      const res = await get(who, `/lms/assignments/${published.id}`);
      expect(res.status, who).toBe(200);
      expect(res.json.data.submissions.map((s: { id: string }) => s.id).sort(), who).toEqual([sub1.id, sub2.id].sort());
    }
  });

  test("a student sees their own submission and no one else's: not the work, the marks, the feedback or the name", async () => {
    const res = await get("student2", `/lms/assignments/${published.id}`);
    expect(res.status).toBe(200);
    expect(res.json.data.submissions.map((s: { id: string }) => s.id)).toEqual([sub2.id]);
    expect(res.text).not.toContain("Alice");
    expect(res.text).not.toContain("well done");
    expect(res.text).not.toContain(sub1.id);

    const own = await get("student1", `/lms/assignments/${published.id}`);
    expect(own.json.data.submissions.map((s: { id: string }) => s.id)).toEqual([sub1.id]);
    expect(own.json.data.submissions[0].score).toBe(91);
  });

  test("a parent and non-teaching staff see the assignment and no submissions", async () => {
    for (const who of ["parent", "support"]) {
      const res = await get(who, `/lms/assignments/${published.id}`);
      expect(res.status, who).toBe(200);
      expect(res.json.data.id, who).toBe(published.id);
      expect(res.json.data.submissions ?? [], who).toEqual([]);
      expect(res.text, who).not.toContain("Alice");
      expect(res.text, who).not.toContain("Bob");
    }
  });
});

test.describe("the list", () => {
  test("naming another student in the list's studentId filter shows a student only their own submissions", async () => {
    const res = await get("student2", `/lms/assignments?studentId=${rec1.id}`);
    expect(res.status).toBe(200);
    const mine = res.json.data.find((x: { id: string }) => x.id === published.id);
    expect(mine).toBeTruthy();
    expect(mine.submissions.map((s: { id: string }) => s.id)).toEqual([sub2.id]);
    expect(res.text).not.toContain(sub1.id);
    expect(res.text).not.toContain("91");
  });

  test("with no filter a student still gets only their own submission on each assignment, and a parent none", async () => {
    const student = await get("student1", `/lms/assignments`);
    const one = student.json.data.find((x: { id: string }) => x.id === published.id);
    expect((one.submissions ?? []).map((s: { id: string }) => s.id)).toEqual([sub1.id]);
    const parent = await get("parent", `/lms/assignments?studentId=${rec1.id}`);
    const seen = parent.json.data.find((x: { id: string }) => x.id === published.id);
    expect(seen.submissions ?? []).toEqual([]);
  });

  test("staff may ask for any student's submissions through the filter", async () => {
    const res = await get("teacher", `/lms/assignments?studentId=${rec1.id}`);
    const row = res.json.data.find((x: { id: string }) => x.id === published.id);
    expect(row.submissions.map((s: { id: string }) => s.id)).toEqual([sub1.id]);
  });
});

test.describe("drafts", () => {
  test("a draft assignment is invisible to students, parents and non-teaching staff, in the list and by id; staff see it", async () => {
    for (const who of ["student1", "parent", "support"]) {
      const list = await get(who, `/lms/assignments`);
      expect(list.status, who).toBe(200);
      expect(
        list.json.data.some((x: { id: string }) => x.id === draft.id),
        `${who} list`,
      ).toBe(false);
      expect(
        list.json.data.some((x: { id: string }) => x.id === published.id),
        `${who} list`,
      ).toBe(true);
      expect((await get(who, `/lms/assignments/${draft.id}`)).status, `${who} detail`).toBe(404);
    }
    for (const who of ["teacher", "admin"]) {
      const list = await get(who, `/lms/assignments`);
      expect(
        list.json.data.some((x: { id: string }) => x.id === draft.id),
        `${who} list`,
      ).toBe(true);
      expect((await get(who, `/lms/assignments/${draft.id}`)).status, `${who} detail`).toBe(200);
    }
  });

  test("a draft quiz is invisible to students and parents, and cannot be attempted; staff see it", async () => {
    for (const who of ["student1", "parent"]) {
      const list = await get(who, `/lms/quizzes`);
      expect(
        list.json.data.some((x: { id: string }) => x.id === draftQuiz.id),
        `${who} list`,
      ).toBe(false);
      expect(
        list.json.data.some((x: { id: string }) => x.id === publishedQuiz.id),
        `${who} list`,
      ).toBe(true);
      expect((await get(who, `/lms/quizzes/${draftQuiz.id}`)).status, `${who} detail`).toBe(404);
    }
    const attempt = await post("student1", `/lms/quizzes/${draftQuiz.id}/attempt`, { answers: [] });
    expect(attempt.status).toBe(404);
    expect(await db.quizAttempt.count({ where: { quizId: draftQuiz.id } })).toBe(0);
    expect((await get("teacher", `/lms/quizzes/${draftQuiz.id}`)).status).toBe(200);
    expect((await get("teacher", `/lms/quizzes`)).json.data.some((x: { id: string }) => x.id === draftQuiz.id)).toBe(true);
  });

  test("a quiz's answer key is never shown to a student or a parent, published or not", async () => {
    for (const who of ["student1", "parent"]) {
      const res = await get(who, `/lms/quizzes/${publishedQuiz.id}`);
      expect(res.status, who).toBe(200);
      expect(res.text, who).not.toContain("correctAnswer");
    }
  });
});
