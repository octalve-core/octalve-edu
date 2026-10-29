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

// What a STUDENT may hand in, and when. Only a PUBLISHED assignment, and not once it has closed to late work (`allowLate` off and the due date passed). Work that has been
// marked (GRADED) is final for the student: a resubmission is possible only when the teacher has asked for one (RESUBMIT_REQUESTED) or the work is not marked yet. Staff who
// hand work in on a student's behalf are not held to the due date or the marks: they decide what to record.

let a: TestTenant;
const user: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
let rec: { id: string };
let subjectId: string;

let seq = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;
const base = () => `/api/v1/schools/${a.code}`;
const submit = (who: string, assignmentId: string, body: object) =>
  api(`${base()}/lms/assignments/${assignmentId}/submissions`, { method: "POST", baseUrl: SAAS_URL, cookie: cookie[who], body });
const hours = (n: number) => new Date(Date.now() + n * 3_600_000);
const assignment = (over: { status?: "DRAFT" | "PUBLISHED"; dueDate?: Date | null; allowLate?: boolean } = {}) =>
  db.assignment.create({
    data: {
      tenantId: a.id,
      subjectId,
      title: uniq("Homework "),
      status: over.status ?? "PUBLISHED",
      dueDate: over.dueDate ?? null,
      allowLate: over.allowLate ?? true,
    },
  });
async function cookieFor(who: TestUser) {
  const res = await loginAs(who, { baseUrl: SAAS_URL });
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "LMS Writes School" });
  for (const [name, role] of [
    ["teacher", Role.TEACHING_STAFF],
    ["student", Role.STUDENT],
  ] as const) {
    user[name] = await createUser({ name });
    await addMembership(user[name].id, a.id, role);
    cookie[name] = await cookieFor(user[name]);
  }
  rec = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      userId: user.student.id,
      firstName: "Alice",
      lastName: uniq("L"),
      admissionNo: uniq("A"),
      dateOfBirth: new Date("2010-01-01"),
    },
  });
  subjectId = (await db.subject.create({ data: { tenantId: a.id, name: "Mathematics", code: "MTH101" } })).id;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test("a student cannot hand in work for a draft assignment: a 404, and nothing is written; staff can still record work for one", async () => {
  const hw = await assignment({ status: "DRAFT" });
  const res = await submit("student", hw.id, { content: "early" });
  expect(res.status).toBe(404);
  expect(res.json.error.code).toBe("NOT_FOUND");
  expect(await db.assignmentSubmission.count({ where: { assignmentId: hw.id } })).toBe(0);
  const staff = await submit("teacher", hw.id, { content: "recorded", studentId: rec.id });
  expect(staff.status).toBe(201);
});

test("marked work is final for the student: a 409, and the marks and the work are untouched", async () => {
  const hw = await assignment();
  const marked = await db.assignmentSubmission.create({
    data: {
      tenantId: a.id,
      assignmentId: hw.id,
      studentId: rec.id,
      content: "the marked answer",
      status: "GRADED",
      score: 80,
      feedback: "good",
      submittedAt: hours(-5),
      gradedAt: hours(-1),
    },
  });
  const res = await submit("student", hw.id, { content: "a better answer" });
  expect(res.status).toBe(409);
  expect(res.json.error.code).toBe("ALREADY_MARKED");
  const after = await db.assignmentSubmission.findUniqueOrThrow({ where: { id: marked.id } });
  expect(after.content).toBe("the marked answer");
  expect(after.status).toBe("GRADED");
  expect(after.score).toBe(80);
  expect(after.feedback).toBe("good");
});

test("work that is not marked yet, or that the teacher asked to have redone, can be handed in again", async () => {
  for (const status of ["SUBMITTED", "LATE", "RESUBMIT_REQUESTED"] as const) {
    const hw = await assignment();
    await db.assignmentSubmission.create({
      data: { tenantId: a.id, assignmentId: hw.id, studentId: rec.id, content: "first", status, submittedAt: hours(-5) },
    });
    const res = await submit("student", hw.id, { content: `second after ${status}` });
    expect(res.status, status).toBe(201);
    expect(res.json.data.content, status).toBe(`second after ${status}`);
  }
});

test("staff may record work on a student's behalf for marked work (they decide what is recorded)", async () => {
  const hw = await assignment();
  await db.assignmentSubmission.create({
    data: {
      tenantId: a.id,
      assignmentId: hw.id,
      studentId: rec.id,
      content: "marked",
      status: "GRADED",
      score: 50,
      submittedAt: hours(-5),
      gradedAt: hours(-1),
    },
  });
  const res = await submit("teacher", hw.id, { content: "corrected by the teacher", studentId: rec.id });
  expect(res.status).toBe(201);
});

test("after the due date: allowed and recorded LATE when late work is allowed; a 409 for a student when it is not (staff may still record it)", async () => {
  const lateOk = await assignment({ dueDate: hours(-2), allowLate: true });
  const late = await submit("student", lateOk.id, { content: "late but welcome" });
  expect(late.status).toBe(201);
  expect(late.json.data.status).toBe("LATE");

  const closed = await assignment({ dueDate: hours(-2), allowLate: false });
  const refused = await submit("student", closed.id, { content: "too late" });
  expect(refused.status).toBe(409);
  expect(refused.json.error.code).toBe("CLOSED");
  expect(await db.assignmentSubmission.count({ where: { assignmentId: closed.id } })).toBe(0);
  const staff = await submit("teacher", closed.id, { content: "accepted by the teacher", studentId: rec.id });
  expect(staff.status).toBe(201);

  const open = await assignment({ dueDate: hours(2), allowLate: false });
  const onTime = await submit("student", open.id, { content: "on time" });
  expect(onTime.status).toBe(201);
  expect(onTime.json.data.status).toBe("SUBMITTED");
});
