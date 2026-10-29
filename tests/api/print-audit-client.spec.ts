import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { PrintTargetKind } from "@prisma/client";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { approvedItem, member, pupil, type Person, type Pupil } from "../support/qbank-world";

// A print is written to an append-only log: who, what, when, from where. "From where" must be something the server worked out, not something the browser said.
// `X-Forwarded-For` is whatever the caller types (the leftmost entry costs nothing to forge), so a log that copied it would let anyone put another address, or a
// kilobyte of text, in the record of who printed an answer key. The server reads the one header the proxy owns (see getClientIp), keeps nothing when there is none,
// and caps the browser's own description of itself.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

const REAL = "198.51.100.7";
const FORGED = "6.6.6.6, 203.0.113.9";
const LONG_AGENT = "Mozilla/5.0 " + "x".repeat(5000);

let school: TestTenant;
let base = "";
let teacher: Person;
let pupilN: Pupil;
let formId = "";
let sessionId = "";
let responseId = "";

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Print Audit School", campuses: ["North"] });
  const north = school.campuses[0]!.id;
  base = `/api/v1/schools/${school.code}`;
  teacher = await member(school, Role.TEACHING_STAFF, north, "Teacher");
  pupilN = await pupil(school, north, "JSS 1", "Pupil");

  const form = await db.form.create({
    data: {
      tenantId: school.id,
      campusId: north,
      kind: "PRACTICE_SET",
      title: "Soil practice",
      status: "PUBLISHED",
      createdById: teacher.user.id,
    },
  });
  formId = form.id;
  await db.formQuestion.create({ data: { tenantId: school.id, formId, prompt: "Name a cereal crop.", correctAnswer: "maize", points: 1 } });
  responseId = (
    await db.formResponse.create({
      data: { tenantId: school.id, campusId: north, formId, studentId: pupilN.student.id, status: "COMPLETED", submittedAt: new Date() },
    })
  ).id;

  const item = await approvedItem(school.id, north, teacher.user.id);
  const session = await db.practiceSession.create({
    data: {
      tenantId: school.id,
      campusId: north,
      studentId: pupilN.student.id,
      subjectLabel: "Mathematics",
      subjectKey: "mathematics",
      size: 1,
      itemIds: [item.id],
      feedbackMode: "END",
      finishedAt: new Date(),
    },
  });
  sessionId = session.id;
  await db.practiceAttempt.create({
    data: { tenantId: school.id, sessionId, studentId: pupilN.student.id, bankItemId: item.id, version: 1, answer: "b", correct: false },
  });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

type Sent = { ip: string | null; xff: string; agent: string };
const forged = (ip: string | null): Sent => ({ ip, xff: FORGED, agent: LONG_AGENT });
const headers = (sent: Sent) => ({ "x-forwarded-for": sent.xff, "user-agent": sent.agent });

// Each of the four places that print writes the log; each is reached the way a real caller would.
const routes: Array<{ name: string; kind: PrintTargetKind; call: (sent: Sent) => Promise<{ status: number; targetId: string }> }> = [
  {
    name: "a teacher printing a form (forms route)",
    kind: PrintTargetKind.FORM,
    call: async (sent) => {
      const res = await api(`${base}/forms/${formId}/print`, {
        method: "POST",
        cookie: teacher.cookie,
        ip: sent.ip,
        headers: headers(sent),
        body: {},
      });
      return { status: res.status, targetId: formId };
    },
  },
  {
    name: "a teacher printing through the question bank route",
    kind: PrintTargetKind.FORM,
    call: async (sent) => {
      const res = await api(`${base}/question-bank/print`, {
        method: "POST",
        cookie: teacher.cookie,
        ip: sent.ip,
        headers: headers(sent),
        body: { targetKind: "FORM", targetId: formId },
      });
      return { status: res.status, targetId: formId };
    },
  },
  {
    name: "a pupil printing a finished practice session",
    kind: PrintTargetKind.PRACTICE_SESSION,
    call: async (sent) => {
      const res = await api(`${base}/portal/practice/sessions/${sessionId}/print`, {
        cookie: pupilN.cookie,
        ip: sent.ip,
        headers: headers(sent),
      });
      return { status: res.status, targetId: sessionId };
    },
  },
  {
    name: "a pupil printing a finished practice-set submission",
    kind: PrintTargetKind.FORM_RESPONSE,
    call: async (sent) => {
      const res = await api(`${base}/portal/forms/practice-sets/responses/${responseId}/print`, {
        cookie: pupilN.cookie,
        ip: sent.ip,
        headers: headers(sent),
      });
      return { status: res.status, targetId: responseId };
    },
  },
];

const logOf = (kind: PrintTargetKind, targetId: string) =>
  db.questionBankPrintLog.findFirstOrThrow({ where: { tenantId: school.id, targetKind: kind, targetId }, orderBy: { printedAt: "desc" } });

for (const route of routes) {
  test.describe(route.name, () => {
    test("the log keeps the address the proxy set, never the forged forwarded-for list, and a capped user agent", async () => {
      const done = await route.call(forged(REAL));
      expect(done.status).toBe(200);
      const log = await logOf(route.kind, done.targetId);
      expect(log.ipAddress).toBe(REAL);
      expect(log.ipAddress).not.toContain("6.6.6.6");
      expect(log.userAgent).not.toBeNull();
      expect(log.userAgent!.length).toBeLessThanOrEqual(256);
      expect(log.userAgent!.startsWith("Mozilla/5.0")).toBe(true);
    });

    test("with no address from the proxy nothing is stored in its place", async () => {
      const done = await route.call(forged(null));
      expect(done.status).toBe(200);
      const log = await logOf(route.kind, done.targetId);
      expect(log.ipAddress).toBeNull();
    });
  });
}

// Not only a forged list is wrong: with no forwarded-for header at all the server fills one in with the address of the connection it was reached on, which behind a proxy is
// the proxy's own. The log must hold the client address the proxy reported.
test("an ordinary print records the client address the proxy reported, not the address of the connection, and the agent", async () => {
  const res = await api(`${base}/forms/${formId}/print`, {
    method: "POST",
    cookie: teacher.cookie,
    ip: REAL,
    headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0" },
    body: {},
  });
  expect(res.status).toBe(200);
  const log = await logOf(PrintTargetKind.FORM, formId);
  expect(log.ipAddress).toBe(REAL);
  expect(log.userAgent).toBe("Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0");
});
