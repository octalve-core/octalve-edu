import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { approvedItem, guardianOf, member, pupil, setBank, type Person, type Pupil } from "../support/qbank-world";

// Archiving is the pupil's way to tidy their own history: the attempt leaves the default list and is found again with ?archived=true. It is not a way to take an
// answer out of what the school reports to the guardian. The first design said so ("toggles archivedAt while preserving analytics"); the summary counted only attempts
// that were not archived, so a pupil could hide every wrong answer from the guardian's summary by archiving it.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let school: TestTenant;
let base = "";
let pupilN: Pupil;
let guardian: Person;
const attemptIds: string[] = [];

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Summary School", campuses: ["North"] });
  const north = school.campuses[0]!.id;
  base = `/api/v1/schools/${school.code}`;
  const teacher = await member(school, Role.TEACHING_STAFF, north, "Teacher");
  pupilN = await pupil(school, north, "JSS 1", "Pupil");
  guardian = await guardianOf(school, [pupilN.student.id]);
  await setBank(school.id, teacher.user.id, "bank.parents.view", "SUMMARY");

  const items: string[] = [];
  for (let i = 0; i < 4; i++) items.push((await approvedItem(school.id, north, teacher.user.id, { topic: "Fractions" })).id);
  const session = await db.practiceSession.create({
    data: {
      tenantId: school.id,
      campusId: north,
      studentId: pupilN.student.id,
      subjectLabel: "Mathematics",
      subjectKey: "mathematics",
      topic: "Fractions",
      size: 4,
      itemIds: items,
      feedbackMode: "END",
      finishedAt: new Date(),
    },
  });
  // one right answer, three wrong
  for (const [i, bankItemId] of items.entries()) {
    const attempt = await db.practiceAttempt.create({
      data: {
        tenantId: school.id,
        sessionId: session.id,
        studentId: pupilN.student.id,
        bankItemId,
        version: 1,
        answer: i === 0 ? "a" : "b",
        correct: i === 0,
      },
    });
    attemptIds.push(attempt.id);
  }
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeEach(async () => {
  // every test starts with nothing archived
  await db.practiceAttempt.updateMany({ where: { tenantId: school.id }, data: { archivedAt: null } });
});

const history = (cookie: string, query = "") => api(`${base}/portal/practice/history?studentId=${pupilN.student.id}${query}`, { cookie });
const archive = (attemptId: string, archived = true) =>
  api(`${base}/portal/practice/history`, { method: "PATCH", cookie: pupilN.cookie, body: { attemptId, archived } });

test("the guardian's summary counts an attempt the pupil has archived", async () => {
  const before = await history(guardian.cookie);
  expect(before.status).toBe(200);
  expect(before.json.data.mode).toBe("SUMMARY");
  expect(before.json.data.summary).toMatchObject({ totalSessions: 1, totalAttempted: 4, totalCorrect: 1, overallAccuracy: 25 });

  // the pupil archives every wrong answer
  for (const id of attemptIds.slice(1)) expect((await archive(id)).status).toBe(200);

  const after = await history(guardian.cookie);
  expect(after.status).toBe(200);
  expect(after.json.data.summary).toMatchObject({ totalSessions: 1, totalAttempted: 4, totalCorrect: 1, overallAccuracy: 25 });
  expect(after.json.data.summary.topics).toEqual([
    { subjectLabel: "Mathematics", topic: "Fractions", attempted: 4, correct: 1, accuracy: 25 },
  ]);
});

test("archiving still tidies the pupil's own history: gone from the default list, found again with archived=true, and restoring brings it back", async () => {
  const own = async (query = "") => (await history(pupilN.cookie, query)).json.data.sessions[0].attempts as Array<{ id: string }>;

  expect(await own()).toHaveLength(4);
  expect((await archive(attemptIds[1]!)).status).toBe(200);
  expect((await archive(attemptIds[2]!)).status).toBe(200);
  expect((await own()).map((a) => a.id).sort()).toEqual([attemptIds[0]!, attemptIds[3]!].sort());
  expect((await own("&archived=true")).map((a) => a.id).sort()).toEqual([attemptIds[1]!, attemptIds[2]!].sort());

  expect((await archive(attemptIds[1]!, false)).status).toBe(200);
  expect(await own()).toHaveLength(3);
});

test("the guardian's summary does not change when an attempt is restored either", async () => {
  await archive(attemptIds[1]!);
  await archive(attemptIds[1]!, false);
  const summary = (await history(guardian.cookie)).json.data.summary;
  expect(summary).toMatchObject({ totalAttempted: 4, totalCorrect: 1 });
});
