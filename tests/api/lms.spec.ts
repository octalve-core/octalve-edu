import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role } from "@prisma/client";
import {
  db,
  addMembership,
  createTenant,
  createUser,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs, type ApiOptions } from "../support/http";

let a: TestTenant;
let b: TestTenant;
let adminA: TestUser;
let teacherA: TestUser;
let studentA: TestUser;
let studentB: TestUser;

let subjectAId: string;
let studentRecordAId: string;

const cookie: Record<string, string> = {};

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, { baseUrl: SAAS_URL });
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

const lmsApi = (path: string, opts: ApiOptions = {}) => api(path, { baseUrl: SAAS_URL, ...opts });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha LMS Academy" });
  b = await createTenant({ name: "Beta LMS School" });

  adminA = await createUser({ name: "Admin Alpha" });
  teacherA = await createUser({ name: "Teacher Alpha" });
  studentA = await createUser({ name: "Student Alpha" });
  studentB = await createUser({ name: "Student Beta" });

  await addMembership(adminA.id, a.id, Role.ADMIN);
  await addMembership(teacherA.id, a.id, Role.TEACHING_STAFF);
  await addMembership(studentA.id, a.id, Role.STUDENT);
  await addMembership(studentB.id, b.id, Role.STUDENT);

  // Seed subject in tenant A
  const subject = await db.subject.create({
    data: {
      tenantId: a.id,
      name: "Mathematics",
      code: "MTH101",
    },
  });
  subjectAId = subject.id;

  // Seed student record for studentA in tenant A
  const studentRecord = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      userId: studentA.id,
      firstName: "Student",
      lastName: "Alpha",
      admissionNo: "2026/0001",
      dateOfBirth: new Date("2010-01-01"),
    },
  });
  studentRecordAId = studentRecord.id;

  cookie.adminA = await cookieFor(adminA);
  cookie.teacherA = await cookieFor(teacherA);
  cookie.studentA = await cookieFor(studentA);
  cookie.studentB = await cookieFor(studentB);
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("LMS API — Assignments, Submissions & Speed Grading", () => {
  let assignmentId: string;
  let submissionId: string;

  test("teacher can create an assignment", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/assignments`, {
      method: "POST",
      cookie: cookie.teacherA,
      body: {
        title: "Calculus Problem Set 1",
        subjectId: subjectAId,
        description: "Limits and continuity problems 1 through 10.",
        instructions: "Show all working clearly.",
        totalPoints: 50,
        status: "PUBLISHED",
        allowLate: true,
        attachments: [{ title: "Worksheet PDF", url: "https://example.com/worksheet.pdf" }],
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.data.id).toBeTruthy();
    expect(res.json.data.title).toBe("Calculus Problem Set 1");
    assignmentId = res.json.data.id;
  });

  test("student can list published assignments", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/assignments`, {
      cookie: cookie.studentA,
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.data)).toBe(true);
    const found = res.json.data.find((item: { id: string }) => item.id === assignmentId);
    expect(found).toBeTruthy();
    expect(found.subject.name).toBe("Mathematics");
  });

  test("student can submit their work for the assignment", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/assignments/${assignmentId}/submissions`, {
      method: "POST",
      cookie: cookie.studentA,
      body: {
        content: "Here are my solutions to questions 1-10...",
        attachments: [{ title: "My Solutions.pdf", url: "https://example.com/solutions.pdf" }],
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.data.studentId).toBe(studentRecordAId);
    expect(res.json.data.status).toBe("SUBMITTED");
    submissionId = res.json.data.id;
  });

  test("teacher can view assignment details and student submissions", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/assignments/${assignmentId}`, {
      cookie: cookie.teacherA,
    });

    expect(res.status).toBe(200);
    expect(res.json.data.submissions).toHaveLength(1);
    expect(res.json.data.submissions[0].id).toBe(submissionId);
  });

  test("teacher can grade the student submission", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
      method: "PATCH",
      cookie: cookie.teacherA,
      body: {
        score: 48,
        feedback: "Outstanding work on delta-epsilon proofs!",
        status: "GRADED",
      },
    });

    expect(res.status).toBe(200);
    expect(res.json.data.score).toBe(48);
    expect(res.json.data.status).toBe("GRADED");
    expect(res.json.data.feedback).toContain("Outstanding work");
  });

  test("cross-tenant student cannot access tenant A assignment", async () => {
    const res = await lmsApi(`/api/v1/schools/${b.code}/lms/assignments/${assignmentId}`, {
      cookie: cookie.studentB,
    });

    expect(res.status).toBe(404);
  });

  test("an assignment this school does not have is a 404 for an update and for an archive, not a 500; a real one is still updated and archived", async () => {
    const missing = `/api/v1/schools/${a.code}/lms/assignments/cabcdefghijklmnopqrstuvwx`;
    const patch = await lmsApi(missing, { method: "PATCH", cookie: cookie.teacherA, body: { title: "Renamed" } });
    expect(patch.status).toBe(404);
    expect(patch.json.error.code).toBe("NOT_FOUND");
    const del = await lmsApi(missing, { method: "DELETE", cookie: cookie.teacherA });
    expect(del.status).toBe(404);
    expect(del.json.error.code).toBe("NOT_FOUND");

    const real = `/api/v1/schools/${a.code}/lms/assignments/${assignmentId}`;
    const renamed = await lmsApi(real, { method: "PATCH", cookie: cookie.teacherA, body: { title: "Calculus Problem Set 1 (revised)" } });
    expect(renamed.status).toBe(200);
    expect(renamed.json.data.title).toBe("Calculus Problem Set 1 (revised)");
    const archived = await lmsApi(real, { method: "DELETE", cookie: cookie.teacherA });
    expect(archived.status).toBe(200);
    expect(archived.json.data.status).toBe("ARCHIVED");
  });
});

test.describe("LMS API — Course Materials & Online Quizzes", () => {
  let materialId: string;
  let quizId: string;

  test("teacher can upload course learning materials", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/materials`, {
      method: "POST",
      cookie: cookie.teacherA,
      body: {
        title: "Integration Review Notes",
        subjectId: subjectAId,
        description: "Summary guide for integration by parts and substitution.",
        content: "# Integration Techniques\n...",
        attachments: [{ title: "Formula Sheet", url: "https://example.com/formulas.pdf" }],
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.data.id).toBeTruthy();
    materialId = res.json.data.id;
  });

  test("students can view learning materials", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/materials`, {
      cookie: cookie.studentA,
    });

    expect(res.status).toBe(200);
    const found = res.json.data.find((m: { id: string }) => m.id === materialId);
    expect(found).toBeTruthy();
  });

  test("teacher can create an online quiz", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/quizzes`, {
      method: "POST",
      cookie: cookie.teacherA,
      body: {
        title: "Calculus Derivatives Quick Quiz",
        subjectId: subjectAId,
        instructions: "Answer all questions. 10 minutes time limit.",
        timeLimitMinutes: 10,
        passingScore: 60,
        status: "PUBLISHED",
        questions: [
          {
            prompt: "What is the derivative of x^2?",
            questionType: "MULTIPLE_CHOICE",
            options: [
              { id: "A", text: "x" },
              { id: "B", text: "2x" },
              { id: "C", text: "2" },
            ],
            correctAnswer: "B",
            points: 2,
          },
          {
            prompt: "The derivative of a constant is zero.",
            questionType: "TRUE_FALSE",
            correctAnswer: "true",
            points: 1,
          },
        ],
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.data.id).toBeTruthy();
    quizId = res.json.data.id;
  });

  test("student can attempt quiz and receive automated grading", async () => {
    const res = await lmsApi(`/api/v1/schools/${a.code}/lms/quizzes/${quizId}/attempt`, {
      method: "POST",
      cookie: cookie.studentA,
      body: {
        answers: [{ questionId: "placeholder", answer: "B" }],
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.data.score).toBeDefined();
  });

  test("a material this school does not have is a 404 for an archive, not a 500; a real one is archived and leaves the list", async () => {
    const del = await lmsApi(`/api/v1/schools/${a.code}/lms/materials/cabcdefghijklmnopqrstuvwx`, {
      method: "DELETE",
      cookie: cookie.teacherA,
    });
    expect(del.status).toBe(404);
    expect(del.json.error.code).toBe("NOT_FOUND");

    const archived = await lmsApi(`/api/v1/schools/${a.code}/lms/materials/${materialId}`, { method: "DELETE", cookie: cookie.teacherA });
    expect(archived.status).toBe(200);
    const list = await lmsApi(`/api/v1/schools/${a.code}/lms/materials`, { cookie: cookie.studentA });
    expect(list.json.data.find((m: { id: string }) => m.id === materialId)).toBeUndefined();
  });
});
