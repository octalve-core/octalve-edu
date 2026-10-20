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

// Whose work a submission or a quiz attempt is. A STUDENT submits for their OWN student record: a `studentId` in the body that is not theirs is refused and nothing is
// written. Staff who may submit on a student's behalf (ADMIN, CAMPUS_ADMIN, TEACHING_STAFF) name the student, who must exist in this school (and, for a campus
// administrator, on their campus). A missing assignment, quiz or student is a 404, never a 500. Both routes: assignment submissions and quiz attempts.

let a: TestTenant;
let b: TestTenant;
const user: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let north: string;
let south: string;
let subjectId: string;
// student records
let rec1: { id: string }; // student1's own record (campus North)
let rec2: { id: string }; // student2's own record (campus North)
let recNorth: { id: string }; // a North student with no login
let recSouth: { id: string }; // a South student with no login
let recSchoolWide: { id: string }; // a student with no campus
let recArchived: { id: string };
let recOtherSchool: { id: string }; // a student of school B

const base = () => `/api/v1/schools/${a.code}`;
let seq = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;
async function cookieFor(who: TestUser) {
  const res = await loginAs(who, { baseUrl: SAAS_URL });
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}
const post = (who: string, path: string, body: object) =>
  api(`${base()}${path}`, { method: "POST", baseUrl: SAAS_URL, cookie: cookie[who], body });

const student = (over: { tenantId?: string; userId?: string; campusId?: string | null; archived?: boolean } = {}) => {
  const n = uniq("S");
  return db.studentRecord.create({
    data: {
      tenantId: over.tenantId ?? a.id,
      userId: over.userId ?? null,
      campusId: over.campusId ?? null,
      firstName: "Pupil",
      lastName: n,
      admissionNo: n,
      dateOfBirth: new Date("2010-01-01"),
      archivedAt: over.archived ? new Date() : null,
    },
  });
};
const assignment = () => db.assignment.create({ data: { tenantId: a.id, subjectId, title: uniq("Homework "), status: "PUBLISHED" } });
const quiz = () =>
  db.quiz.create({
    data: {
      tenantId: a.id,
      subjectId,
      title: uniq("Quiz "),
      status: "PUBLISHED",
      questions: { create: [{ prompt: "2 + 2?", questionType: "SHORT_ANSWER", correctAnswer: "4", points: 1 }] },
    },
    include: { questions: true },
  });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Submission Ownership School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Submission School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];

  const people: [string, Role, string | null][] = [
    ["admin", Role.ADMIN, null],
    ["teacher", Role.TEACHING_STAFF, null],
    ["campusAdmin", Role.CAMPUS_ADMIN, north],
    ["student1", Role.STUDENT, north],
    ["student2", Role.STUDENT, north],
    ["lonely", Role.STUDENT, north], // a student membership with no student record behind it
    ["parent", Role.PARENT, north],
  ];
  for (const [name, role, campusId] of people) {
    user[name] = await createUser({ name });
    await addMembership(user[name].id, a.id, role, campusId);
    cookie[name] = await cookieFor(user[name]);
  }

  rec1 = await student({ userId: user.student1.id, campusId: north });
  rec2 = await student({ userId: user.student2.id, campusId: north });
  recNorth = await student({ campusId: north });
  recSouth = await student({ campusId: south });
  recSchoolWide = await student({ campusId: null });
  recArchived = await student({ campusId: north, archived: true });
  recOtherSchool = await student({ tenantId: b.id });

  subjectId = (await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTH101" } })).id;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("assignment submissions", () => {
  test("a student submits for their own record, with or without naming it", async () => {
    const hw = await assignment();
    const bare = await post("student1", `/lms/assignments/${hw.id}/submissions`, { content: "first draft" });
    expect(bare.status).toBe(201);
    expect(bare.json.data.studentId).toBe(rec1.id);

    const named = await post("student2", `/lms/assignments/${hw.id}/submissions`, { content: "mine", studentId: rec2.id });
    expect(named.status).toBe(201);
    expect(named.json.data.studentId).toBe(rec2.id);

    // submitting again replaces the student's OWN work
    const again = await post("student1", `/lms/assignments/${hw.id}/submissions`, { content: "second draft" });
    expect(again.status).toBe(201);
    expect(again.json.data.id).toBe(bare.json.data.id);
    expect(again.json.data.content).toBe("second draft");
  });

  test("a student cannot submit as another student: refused, and the other student's work is untouched", async () => {
    const hw = await assignment();
    const original = await post("student1", `/lms/assignments/${hw.id}/submissions`, { content: "original work" });
    expect(original.status).toBe(201);
    const before = await db.assignmentSubmission.findUniqueOrThrow({ where: { id: original.json.data.id } });

    const refused = await post("student2", `/lms/assignments/${hw.id}/submissions`, { studentId: rec1.id, content: "replaced" });
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("FORBIDDEN");

    const after = await db.assignmentSubmission.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.content).toBe("original work");
    expect(after.submittedAt).toEqual(before.submittedAt);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(1);
  });

  test("the same when the other student has not submitted yet: nothing is created for either of them", async () => {
    const hw = await assignment();
    for (const target of [rec1.id, recNorth.id, recSouth.id, recSchoolWide.id]) {
      const refused = await post("student2", `/lms/assignments/${hw.id}/submissions`, { studentId: target, content: "x" });
      expect(refused.status, target).toBe(403);
    }
    expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(0);
  });

  test("a student with no student record is refused with a clear 403, not a 500", async () => {
    const hw = await assignment();
    const res = await post("lonely", `/lms/assignments/${hw.id}/submissions`, { content: "x" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("FORBIDDEN");
    const named = await post("lonely", `/lms/assignments/${hw.id}/submissions`, { content: "x", studentId: rec1.id });
    expect(named.status).toBe(403);
    expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(0);
  });

  test("staff submit on a student's behalf by naming the student (ADMIN, TEACHING_STAFF, and a CAMPUS_ADMIN for their own campus)", async () => {
    for (const [who, target] of [
      ["admin", recSouth],
      ["teacher", recNorth],
      ["campusAdmin", recNorth],
    ] as const) {
      const hw = await assignment();
      const res = await post(who, `/lms/assignments/${hw.id}/submissions`, { studentId: target.id, content: `by ${who}` });
      expect(res.status, who).toBe(201);
      expect(res.json.data.studentId, who).toBe(target.id);
    }
  });

  test("staff must name the student when they have no student record of their own: a 400", async () => {
    const hw = await assignment();
    for (const who of ["admin", "teacher", "campusAdmin"]) {
      const res = await post(who, `/lms/assignments/${hw.id}/submissions`, { content: "x" });
      expect(res.status, who).toBe(400);
      expect(res.json.error.code, who).toBe("VALIDATION");
    }
    expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(0);
  });

  test("a student that does not exist in this school is a 404 and writes nothing: unknown, archived, or another school's", async () => {
    const hw = await assignment();
    for (const [label, studentId] of [
      ["unknown id", "cl0000000000000000000000x"],
      ["archived", recArchived.id],
      ["another school's student", recOtherSchool.id],
    ] as const) {
      const res = await post("teacher", `/lms/assignments/${hw.id}/submissions`, { studentId, content: "x" });
      expect(res.status, label).toBe(404);
      expect(res.json.error.code, label).toBe("NOT_FOUND");
    }
    expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(0);
    expect(await db.assignmentSubmission.count({ where: { studentId: recOtherSchool.id } })).toBe(0);
  });

  test("a campus administrator reaches their own campus's students only: another campus is a 404, a school-wide student a 403", async () => {
    const hw = await assignment();
    const other = await post("campusAdmin", `/lms/assignments/${hw.id}/submissions`, { studentId: recSouth.id, content: "x" });
    expect(other.status).toBe(404);
    const wide = await post("campusAdmin", `/lms/assignments/${hw.id}/submissions`, { studentId: recSchoolWide.id, content: "x" });
    expect(wide.status).toBe(403);
    const own = await post("campusAdmin", `/lms/assignments/${hw.id}/submissions`, { studentId: recNorth.id, content: "x" });
    expect(own.status).toBe(201);
    expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(1);
  });

  test("an assignment that does not exist is a 404, not a 500 (a student and a teacher)", async () => {
    for (const [who, body] of [
      ["student1", { content: "x" }],
      ["teacher", { content: "x", studentId: recNorth.id }],
    ] as const) {
      const res = await post(who, `/lms/assignments/cl0000000000000000000000x/submissions`, body);
      expect(res.status, who).toBe(404);
      expect(res.json.error.code, who).toBe("NOT_FOUND");
    }
  });

  test("a parent cannot submit at all", async () => {
    const hw = await assignment();
    const res = await post("parent", `/lms/assignments/${hw.id}/submissions`, { studentId: rec1.id, content: "x" });
    expect(res.status).toBe(403);
    expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(0);
  });
});

test.describe("quiz attempts", () => {
  test("a student attempts a quiz for their own record, with or without naming it", async () => {
    const q = await quiz();
    const answers = [{ questionId: q.questions[0].id, answer: "4" }];
    const bare = await post("student1", `/lms/quizzes/${q.id}/attempt`, { answers });
    expect(bare.status).toBe(201);
    expect(bare.json.data.studentId).toBe(rec1.id);
    expect(bare.json.data.score).toBe(100);
    const named = await post("student2", `/lms/quizzes/${q.id}/attempt`, { answers, studentId: rec2.id });
    expect(named.status).toBe(201);
    expect(named.json.data.studentId).toBe(rec2.id);
  });

  test("a student cannot attempt a quiz as another student: refused, and no attempt is recorded for the other student", async () => {
    const q = await quiz();
    const wrong = [{ questionId: q.questions[0].id, answer: "5" }];
    for (const target of [rec1.id, recNorth.id, recSouth.id]) {
      const refused = await post("student2", `/lms/quizzes/${q.id}/attempt`, { answers: wrong, studentId: target });
      expect(refused.status, target).toBe(403);
      expect(refused.json.error.code, target).toBe("FORBIDDEN");
    }
    expect(await db.quizAttempt.count({ where: { quizId: q.id } })).toBe(0);
  });

  test("a student with no student record gets a 403; staff must name an existing student; a campus administrator keeps to their campus", async () => {
    const q = await quiz();
    const answers = [{ questionId: q.questions[0].id, answer: "4" }];
    expect((await post("lonely", `/lms/quizzes/${q.id}/attempt`, { answers })).status).toBe(403);
    expect((await post("teacher", `/lms/quizzes/${q.id}/attempt`, { answers })).status).toBe(400);
    expect((await post("teacher", `/lms/quizzes/${q.id}/attempt`, { answers, studentId: recOtherSchool.id })).status).toBe(404);
    expect((await post("teacher", `/lms/quizzes/${q.id}/attempt`, { answers, studentId: recArchived.id })).status).toBe(404);
    expect((await post("campusAdmin", `/lms/quizzes/${q.id}/attempt`, { answers, studentId: recSouth.id })).status).toBe(404);
    expect(await db.quizAttempt.count({ where: { quizId: q.id } })).toBe(0);

    for (const [who, target] of [
      ["teacher", recSouth],
      ["admin", recNorth],
      ["campusAdmin", recNorth],
    ] as const) {
      const ok = await post(who, `/lms/quizzes/${q.id}/attempt`, { answers, studentId: target.id });
      expect(ok.status, who).toBe(201);
      expect(ok.json.data.studentId, who).toBe(target.id);
    }
  });

  test("a quiz that does not exist is a 404, not a 500", async () => {
    const res = await post("student1", `/lms/quizzes/cl0000000000000000000000x/attempt`, { answers: [] });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("NOT_FOUND");
  });
});
