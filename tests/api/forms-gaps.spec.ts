import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi, parseSetCookie } from "../support/http";
import { approvedItem, classArm, guardianOf, member, pupil, resetPractice, setBank, type Person, type Pupil } from "../support/qbank-world";

// The things the Forms screens needed from the API (task 0025, slices O3 to O8). What these cases hold:
//   - a practice set is answered once (a start after a finished attempt is refused), the start answers with the school's clock, and the pupil's list shows the latest attempt;
//   - a pupil reaches the questionnaires of their own campus and their own class only, and a questionnaire written for a class opens for that class;
//   - an answer still waiting for marking carries neither the key nor the explanation anywhere in the result;
//   - a member of staff reads their own reports and no one else's;
//   - a session left open can be opened to carry on with, by its owner, while practice is open;
//   - a public questionnaire asks each browser to answer once, and the cookie it sets names no one;
//   - staff and guardians read and answer the questionnaires addressed to them, by role and campus;
//   - a guardian lists exactly the pupils their approved links name.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let a: TestTenant;
let admin: Person;
let teacher: Person;
let teacher2: Person;
let nonTeaching: Person;
let campusAdmin: Person;
let pNorth: Pupil; // North, "JSS 1"
let pNorth2: Pupil; // North, "JSS 2"
let pSouth: Pupil; // South, "JSS 1"
let parent: Person; // linked to pNorth and pNorth2
let parentPending: Person;
let parentRevoked: Person;
let BASE = "";
let north = "";
let south = "";
let jss1North = "";
const token = () => crypto.randomBytes(16).toString("hex");

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Gaps", campuses: ["North", "South"] });
  BASE = `/api/v1/schools/${a.code}`;
  north = a.campuses[0].id;
  south = a.campuses[1].id;
  admin = await member(a, Role.ADMIN, null, "Admin");
  teacher = await member(a, Role.TEACHING_STAFF, north, "Teacher");
  teacher2 = await member(a, Role.TEACHING_STAFF, north, "Teacher Two");
  nonTeaching = await member(a, Role.NON_TEACHING_STAFF, north, "Bursar");
  campusAdmin = await member(a, Role.CAMPUS_ADMIN, north, "Campus Admin");
  pNorth = await pupil(a, north, "JSS 1", "PupilNorth");
  pNorth2 = await pupil(a, north, "JSS 2", "PupilNorthTwo");
  pSouth = await pupil(a, south, "JSS 1", "PupilSouth");
  jss1North = (await classArm(a, north, "JSS 1")).groupId;
  parent = await guardianOf(a, [pNorth.student.id, pNorth2.student.id], "APPROVED", "Parent");
  parentPending = await guardianOf(a, [pNorth.student.id], "PENDING", "ParentPending");
  parentRevoked = await guardianOf(a, [pNorth.student.id], "REVOKED", "ParentRevoked");
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

/// A published practice set of the campus with one single-answer question (the key is "a") and, when asked, a hand-marked short answer whose model answer is `secret`.
async function practiceSet(campusId: string | null, secret?: string) {
  const form = await db.form.create({
    data: {
      tenantId: a.id,
      campusId,
      kind: "PRACTICE_SET",
      title: `Set ${Math.random()}`,
      status: "PUBLISHED",
      createdById: admin.user.id,
    },
  });
  const single = await db.formQuestion.create({
    data: {
      tenantId: a.id,
      formId: form.id,
      prompt: "Pick the first",
      questionType: "SINGLE",
      options: [
        { id: "a", text: "First" },
        { id: "b", text: "Second" },
      ],
      correctAnswer: "a",
      points: 1,
      sortOrder: 0,
    },
  });
  const short = secret
    ? await db.formQuestion.create({
        data: {
          tenantId: a.id,
          formId: form.id,
          prompt: "Explain in a sentence",
          questionType: "SHORT",
          correctAnswer: secret,
          explanation: `${secret} explained`,
          markingMethod: "MANUAL",
          points: 4,
          sortOrder: 1,
        },
      })
    : null;
  return { formId: form.id, single: single.id, short: short?.id ?? null };
}

const startSet = (who: Person, formId: string) =>
  api(`${BASE}/portal/forms/practice-sets/${formId}/start`, { method: "POST", cookie: who.cookie, body: {} });
const submitSet = (who: Person, formId: string, responseId: string, answers: { formQuestionId: string; value: unknown }[]) =>
  api(`${BASE}/portal/forms/practice-sets/${formId}/submit`, { method: "POST", cookie: who.cookie, body: { responseId, answers } });

test.describe("a practice set is answered once", () => {
  test("a start after a finished attempt is refused; the start carries the school's clock; the list shows the finished attempt", async () => {
    const set = await practiceSet(north);
    const started = await startSet(pNorth, set.formId);
    expect(started.status).toBe(201);
    expect(Math.abs(Date.parse(started.json.data.serverTime) - Date.now())).toBeLessThan(60_000);
    const responseId = started.json.data.responseId as string;
    expect((await submitSet(pNorth, set.formId, responseId, [{ formQuestionId: set.single, value: "a" }])).status).toBe(200);

    const again = await startSet(pNorth, set.formId);
    expect(again.status).toBe(400);
    expect(again.json.error.code).toBe("ALREADY_COMPLETED");
    expect(await db.formResponse.count({ where: { formId: set.formId, studentId: pNorth.student.id } })).toBe(1);

    const list = await api(`${BASE}/portal/forms/practice-sets`, { cookie: pNorth.cookie });
    const listed = (list.json.data.practiceSets as { id: string; hasSubmitted: boolean; submission: { id: string } | null }[]).find(
      (s) => s.id === set.formId,
    );
    expect(listed).toMatchObject({ hasSubmitted: true });
    expect(listed?.submission?.id).toBe(responseId);
  });

  test("an attempt in progress is resumed, not duplicated, and another pupil can still start", async () => {
    const set = await practiceSet(north);
    const first = await startSet(pNorth, set.formId);
    const second = await startSet(pNorth, set.formId);
    expect(second.status).toBe(200);
    expect(second.json.data).toMatchObject({ isResume: true, responseId: first.json.data.responseId });
    expect((await startSet(pNorth2, set.formId)).status).toBe(201);
  });
});

test.describe("a waiting answer carries no key", () => {
  test("the result of an attempt with a hand-marked answer has neither the model answer nor its explanation anywhere", async () => {
    const SECRET = `Model answer ${crypto.randomBytes(4).toString("hex")}`;
    const set = await practiceSet(north, SECRET);
    const started = await startSet(pNorth, set.formId);
    const responseId = started.json.data.responseId as string;
    const sent = await submitSet(pNorth, set.formId, responseId, [
      { formQuestionId: set.single, value: "b" },
      { formQuestionId: set.short!, value: "My own words" },
    ]);
    expect(sent.status).toBe(200);
    expect(sent.text).not.toContain(SECRET);

    const result = await api(`${BASE}/portal/forms/practice-sets/responses/${responseId}`, { cookie: pNorth.cookie });
    expect(result.status).toBe(200);
    expect(result.text).not.toContain(SECRET);
    const answers = result.json.data.response.answers as {
      isPending: boolean;
      correctAnswer: string | null;
      formQuestion: { prompt: string };
    }[];
    const waiting = answers.find((x) => x.formQuestion.prompt === "Explain in a sentence");
    expect(waiting).toMatchObject({ isPending: true, correctAnswer: null });
    // the machine-marked answer shows its key once the attempt is done
    const marked = answers.find((x) => x.formQuestion.prompt === "Pick the first");
    expect(marked).toMatchObject({ isPending: false, correctAnswer: "a" });
  });
});

test.describe("questionnaires follow the pupil's campus and class", () => {
  async function questionnaire(over: { campusId: string | null; roles?: string[]; classGroupIds?: string[]; title?: string }) {
    const form = await db.form.create({
      data: {
        tenantId: a.id,
        campusId: over.campusId,
        kind: "QUESTIONNAIRE",
        title: over.title ?? `Survey ${Math.random()}`,
        status: "PUBLISHED",
        createdById: admin.user.id,
      },
    });
    await db.formAudience.create({
      data: { tenantId: a.id, formId: form.id, kind: "MEMBERS", roles: over.roles ?? ["STUDENT"], classGroupIds: over.classGroupIds ?? [] },
    });
    const q = await db.formQuestion.create({
      data: { tenantId: a.id, formId: form.id, prompt: "Do you like it?", questionType: "SHORT", points: 0, sortOrder: 0 },
    });
    return { formId: form.id, q: q.id };
  }
  const listIds = async (who: Person) => {
    const res = await api(`${BASE}/portal/forms/questionnaires`, { cookie: who.cookie });
    expect(res.status).toBe(200);
    return (res.json.data.questionnaires as { id: string }[]).map((x) => x.id);
  };

  test("a questionnaire of another campus is not listed, not opened and not answered; the whole school's is for everybody", async () => {
    const southOnly = await questionnaire({ campusId: south });
    const wholeSchool = await questionnaire({ campusId: null });
    expect(await listIds(pNorth)).not.toContain(southOnly.formId);
    expect(await listIds(pNorth)).toContain(wholeSchool.formId);
    expect(await listIds(pSouth)).toContain(southOnly.formId);

    const open = await api(`${BASE}/portal/forms/questionnaires/${southOnly.formId}`, { cookie: pNorth.cookie });
    expect(open.status).toBe(404);
    const sent = await api(`${BASE}/portal/forms/questionnaires/${southOnly.formId}/submit`, {
      method: "POST",
      cookie: pNorth.cookie,
      body: { answers: [{ formQuestionId: southOnly.q, value: "yes" }] },
    });
    expect(sent.status).toBe(404);
    expect(await db.formResponse.count({ where: { formId: southOnly.formId } })).toBe(0);
    expect((await api(`${BASE}/portal/forms/questionnaires/${southOnly.formId}`, { cookie: pSouth.cookie })).status).toBe(200);
  });

  test("a questionnaire written for a class opens for that class and not for another", async () => {
    const forClass = await questionnaire({ campusId: north, classGroupIds: [jss1North] });
    expect(await listIds(pNorth)).toContain(forClass.formId);
    expect(await listIds(pNorth2)).not.toContain(forClass.formId);
    expect((await api(`${BASE}/portal/forms/questionnaires/${forClass.formId}`, { cookie: pNorth.cookie })).status).toBe(200);
    const refused = await api(`${BASE}/portal/forms/questionnaires/${forClass.formId}`, { cookie: pNorth2.cookie });
    expect(refused.status).toBe(403);
  });
});

test.describe("a member of staff reads their own reports", () => {
  test("only the caller's reports, with the reviewer's outcome and reason; never a pupil's; not for pupils or guardians", async () => {
    await db.questionReport.deleteMany({ where: { tenantId: a.id } });
    const item = await approvedItem(a.id, north, admin.user.id, { prompt: "Mine and only mine?" });
    await db.questionReport.create({
      data: {
        tenantId: a.id,
        campusId: north,
        bankItemId: item.id,
        reporterUserId: teacher.user.id,
        reporterRole: "TEACHER",
        reason: "The key is wrong",
        status: "RESOLVED",
        outcome: "FIXED",
        explanation: "Corrected the key",
        resolvedAt: new Date(),
      },
    });
    await db.questionReport.create({
      data: {
        tenantId: a.id,
        campusId: north,
        bankItemId: item.id,
        reporterUserId: teacher2.user.id,
        reporterRole: "TEACHER",
        reason: "Someone else's reason",
      },
    });
    await db.questionReport.create({
      data: {
        tenantId: a.id,
        campusId: north,
        bankItemId: item.id,
        reporterUserId: pNorth.user.id,
        reporterStudentId: pNorth.student.id,
        reporterRole: "PUPIL",
        reason: "A pupil's reason",
      },
    });

    const mine = await api(`${BASE}/question-bank/my-reports`, { cookie: teacher.cookie });
    expect(mine.status).toBe(200);
    expect(mine.json.data.reports).toHaveLength(1);
    expect(mine.json.data.reports[0]).toMatchObject({
      questionPrompt: "Mine and only mine?",
      reason: "The key is wrong",
      status: "RESOLVED",
      outcome: "FIXED",
      outcomeReason: "Corrected the key",
    });
    expect(mine.text).not.toContain("Someone else's reason");
    expect(mine.text).not.toContain("A pupil's reason");

    const other = await api(`${BASE}/question-bank/my-reports`, { cookie: teacher2.cookie });
    expect(other.json.data.reports).toHaveLength(1);
    expect(other.json.data.reports[0].reason).toBe("Someone else's reason");
    expect((await api(`${BASE}/question-bank/my-reports`, { cookie: nonTeaching.cookie })).json.data.reports).toEqual([]);
    expect((await api(`${BASE}/question-bank/my-reports`, { cookie: pNorth.cookie })).status).toBe(403);
    expect((await api(`${BASE}/question-bank/my-reports`, { cookie: parent.cookie })).status).toBe(403);
    expect((await api(`${BASE}/question-bank/my-reports`)).status).toBe(401);
  });
});

test.describe("carrying on a practice session", () => {
  test.beforeEach(async () => {
    await resetPractice();
    await db.questionBankItem.deleteMany({ where: { tenantId: a.id } });
    for (let i = 0; i < 6; i++) await approvedItem(a.id, null, admin.user.id);
    await setBank(a.id, admin.user.id, "bank.practice.minPoolSize", 3);
    await setBank(a.id, admin.user.id, "bank.practice.dailyCap", 20);
  });
  const PRACTICE = () => `${BASE}/portal/practice`;
  const openSession = async (who: Person) => {
    const res = await api(`${PRACTICE()}/sessions`, { method: "POST", cookie: who.cookie, body: { size: 3 } });
    expect(res.status).toBe(201);
    return res.json.data as { session: { id: string }; questions: { id: string }[] };
  };

  test("the owner gets the questions still to answer, without keys, and a count of those answered", async () => {
    const started = await openSession(pNorth);
    const first = started.questions[0].id;
    expect(
      (
        await api(`${PRACTICE()}/sessions/${started.session.id}/answers`, {
          method: "POST",
          cookie: pNorth.cookie,
          body: { bankItemId: first, answer: "a" },
        })
      ).status,
    ).toBe(200);

    const resumed = await api(`${PRACTICE()}/sessions/${started.session.id}`, { cookie: pNorth.cookie });
    expect(resumed.status).toBe(200);
    expect(resumed.json.data.answeredCount).toBe(1);
    expect((resumed.json.data.questions as { id: string }[]).map((q) => q.id)).toEqual(started.questions.slice(1).map((q) => q.id));
    expect(resumed.text).not.toContain("correctAnswer");
    expect(resumed.text).not.toContain("Because the first is right.");
  });

  test("another pupil's session is not found; a finished one is refused; a closed practice is refused as an answer is", async () => {
    const started = await openSession(pNorth);
    expect((await api(`${PRACTICE()}/sessions/${started.session.id}`, { cookie: pNorth2.cookie })).status).toBe(404);
    expect((await api(`${PRACTICE()}/sessions/${started.session.id}`, { cookie: parent.cookie })).status).toBe(403);
    expect((await api(`${PRACTICE()}/sessions/${started.session.id}`)).status).toBe(401);

    await db.questionBankSetting.create({
      data: { tenantId: a.id, campusId: null, key: "bank.access.pupils", value: false as never, updatedById: admin.user.id },
    });
    const closed = await api(`${PRACTICE()}/sessions/${started.session.id}`, { cookie: pNorth.cookie });
    expect(closed.status).toBe(403);
    expect(closed.json.error.code).toBe("PRACTICE_CLOSED");
    await db.questionBankSetting.deleteMany({ where: { tenantId: a.id, key: "bank.access.pupils" } });

    expect(
      (await api(`${PRACTICE()}/sessions/${started.session.id}/finish`, { method: "POST", cookie: pNorth.cookie, body: {} })).status,
    ).toBe(200);
    const finished = await api(`${PRACTICE()}/sessions/${started.session.id}`, { cookie: pNorth.cookie });
    expect(finished.status).toBe(400);
    expect(finished.json.error.code).toBe("SESSION_FINISHED");
  });

  test("a question the school has withdrawn since is not offered again, and the finished session and the history carry each question's kind and options", async () => {
    const started = await openSession(pNorth);
    const withdrawn = started.questions[1].id;
    await db.questionBankItem.update({ where: { id: withdrawn }, data: { status: "RETIRED", retiredReason: "Withdrawn for the test" } });
    const resumed = await api(`${PRACTICE()}/sessions/${started.session.id}`, { cookie: pNorth.cookie });
    expect((resumed.json.data.questions as { id: string }[]).map((q) => q.id)).not.toContain(withdrawn);

    await api(`${PRACTICE()}/sessions/${started.session.id}/answers`, {
      method: "POST",
      cookie: pNorth.cookie,
      body: { bankItemId: started.questions[0].id, answer: "a" },
    });
    const finish = await api(`${PRACTICE()}/sessions/${started.session.id}/finish`, { method: "POST", cookie: pNorth.cookie, body: {} });
    expect(finish.json.data.attempts[0]).toMatchObject({
      type: "SINGLE",
      options: [
        { id: "a", text: "First" },
        { id: "b", text: "Second" },
      ],
    });
    const history = await api(`${PRACTICE()}/history`, { cookie: pNorth.cookie });
    expect(history.json.data.sessions[0].attempts[0]).toMatchObject({ type: "SINGLE" });
    expect(history.json.data.sessions[0].attempts[0].options).toHaveLength(2);
  });
});

test.describe("a public questionnaire asks each browser to answer once", () => {
  async function survey() {
    const shareToken = token();
    const form = await db.form.create({
      data: {
        tenantId: a.id,
        campusId: north,
        kind: "QUESTIONNAIRE",
        title: "Public one",
        status: "PUBLISHED",
        isAnonymous: true,
        shareToken,
        createdById: admin.user.id,
      },
    });
    await db.formAudience.create({ data: { tenantId: a.id, formId: form.id, kind: "PUBLIC" } });
    const q = await db.formQuestion.create({
      data: { tenantId: a.id, formId: form.id, prompt: "Anything else?", questionType: "SHORT", points: 0, sortOrder: 0 },
    });
    return { formId: form.id, token: shareToken, q: q.id };
  }
  const read = (t: string, cookie?: string) => api(`${BASE}/forms/public/${t}`, { cookie });
  const send = (t: string, q: string, cookie?: string) =>
    api(`${BASE}/forms/public/${t}/submit`, { method: "POST", body: { answers: [{ formQuestionId: q, value: "More chairs" }] }, cookie });

  test("the first answer is stored and marks the browser; a second from that browser is refused and stores nothing; another browser is not affected", async () => {
    const s = await survey();
    expect((await read(s.token)).json.data.answeredHere).toBe(false);

    const first = await send(s.token, s.q);
    expect(first.status).toBe(200);
    const cookie = first.setCookies.map(parseSetCookie).find((c) => c.name === "qa");
    expect(cookie).toBeDefined();
    expect(cookie!.value).toBe("1");
    expect(cookie!.attributes.get("path")).toBe(`${BASE}/forms/public/${s.token}`);
    expect(cookie!.attributes.has("httponly")).toBe(true);
    expect(String(cookie!.attributes.get("samesite")).toLowerCase()).toBe("lax");
    // the cookie names no one and the body does not hand the token back
    expect(cookie!.raw).not.toMatch(/respond|student|user/i);
    expect(first.text).not.toContain(s.token);

    expect((await read(s.token, "qa=1")).json.data.answeredHere).toBe(true);
    const second = await send(s.token, s.q, "qa=1");
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("ALREADY_SUBMITTED");
    expect(second.json.error.message).toBe("You have already answered this questionnaire from this browser.");
    expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(1);

    // a browser without the cookie may answer (the courtesy is not a guarantee, and the page says so)
    expect((await send(s.token, s.q)).status).toBe(200);
    expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(2);
  });

  test("a refused answer does not mark the browser, and a token of another shape never sets a cookie", async () => {
    const s = await survey();
    const bad = await api(`${BASE}/forms/public/${s.token}/submit`, {
      method: "POST",
      body: { answers: "nope" },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.setCookies.map(parseSetCookie).find((c) => c.name === "qa")).toBeUndefined();

    const odd = await api(`${BASE}/forms/public/not-a-token/submit`, {
      method: "POST",
      body: { answers: [{ formQuestionId: "x", value: "y" }] },
      cookie: "qa=1",
    });
    expect(odd.status).toBe(404);
    expect(odd.setCookies).toEqual([]);
  });
});

test.describe("questionnaires addressed to staff and guardians", () => {
  async function addressed(over: {
    campusId?: string | null;
    roles?: string[];
    classGroupIds?: string[];
    kind?: "MEMBERS" | "PUBLIC";
    status?: "PUBLISHED" | "DRAFT";
    anonymous?: boolean;
    title: string;
  }) {
    const form = await db.form.create({
      data: {
        tenantId: a.id,
        campusId: over.campusId === undefined ? north : over.campusId,
        kind: "QUESTIONNAIRE",
        title: over.title,
        status: over.status ?? "PUBLISHED",
        isAnonymous: over.anonymous ?? false,
        createdById: admin.user.id,
      },
    });
    await db.formAudience.create({
      data: {
        tenantId: a.id,
        formId: form.id,
        kind: over.kind ?? "MEMBERS",
        roles: over.roles ?? [],
        classGroupIds: over.classGroupIds ?? [],
      },
    });
    const q = await db.formQuestion.create({
      data: { tenantId: a.id, formId: form.id, prompt: "How was the term?", questionType: "SHORT", points: 0, sortOrder: 0 },
    });
    return { id: form.id, q: q.id, title: over.title };
  }
  const forYou = async (who: Person) => {
    const res = await api(`${BASE}/forms/for-you`, { cookie: who.cookie });
    expect(res.status).toBe(200);
    return (res.json.data.questionnaires as { id: string; hasSubmitted: boolean }[]).map((x) => x.id);
  };

  test("a member is addressed only when the audience names their role (or everyone); a class's questionnaire, a draft, a public one and another campus's are not theirs", async () => {
    const tag = `T${Math.random()}`;
    const teachers = await addressed({ title: `${tag} teachers`, roles: ["TEACHING_STAFF"] });
    const everyone = await addressed({ title: `${tag} everyone`, roles: [] });
    const admins = await addressed({ title: `${tag} admins`, roles: ["ADMIN"] });
    const forClass = await addressed({ title: `${tag} class`, roles: [], classGroupIds: [jss1North] });
    const draft = await addressed({ title: `${tag} draft`, roles: ["TEACHING_STAFF"], status: "DRAFT" });
    const isPublic = await addressed({ title: `${tag} public`, roles: ["TEACHING_STAFF"], kind: "PUBLIC" });
    const southOnly = await addressed({ title: `${tag} south`, roles: ["TEACHING_STAFF"], campusId: south });

    const t = await forYou(teacher);
    expect(t).toEqual(expect.arrayContaining([teachers.id, everyone.id]));
    for (const not of [admins.id, forClass.id, draft.id, isPublic.id, southOnly.id]) expect(t).not.toContain(not);

    const bursar = await forYou(nonTeaching);
    expect(bursar).toContain(everyone.id);
    expect(bursar).not.toContain(teachers.id);

    const head = await forYou(campusAdmin); // a campus administrator answers as an administrator
    expect(head).toEqual(expect.arrayContaining([admins.id, everyone.id]));
    expect(head).not.toContain(teachers.id);

    expect(await forYou(parent)).toContain(everyone.id); // a guardian too
    expect(await forYou(parent)).not.toContain(teachers.id);
  });

  test("pupils and strangers are refused the routes; a questionnaire that is not the caller's is refused or not found", async () => {
    const teachers = await addressed({ title: "Refusals teachers", roles: ["TEACHING_STAFF"] });
    const southOnly = await addressed({ title: "Refusals south", roles: ["TEACHING_STAFF"], campusId: south });
    expect((await api(`${BASE}/forms/for-you`, { cookie: pNorth.cookie })).status).toBe(403);
    expect((await api(`${BASE}/forms/for-you/${teachers.id}`, { cookie: pNorth.cookie })).status).toBe(403);
    expect((await api(`${BASE}/forms/for-you`)).status).toBe(401);

    expect((await api(`${BASE}/forms/for-you/${teachers.id}`, { cookie: teacher.cookie })).status).toBe(200);
    const notTheirs = await api(`${BASE}/forms/for-you/${teachers.id}`, { cookie: nonTeaching.cookie });
    expect(notTheirs.status).toBe(403);
    expect((await api(`${BASE}/forms/for-you/${southOnly.id}`, { cookie: teacher.cookie })).status).toBe(404);
    const sentToWrong = await api(`${BASE}/forms/for-you/${teachers.id}/submit`, {
      method: "POST",
      cookie: nonTeaching.cookie,
      body: { answers: [{ formQuestionId: teachers.q, value: "fine" }] },
    });
    expect(sentToWrong.status).toBe(403);
    expect(await db.formResponse.count({ where: { formId: teachers.id } })).toBe(0);
  });

  test("an answer is stored once; an anonymous questionnaire keeps no link to the person", async () => {
    const named = await addressed({ title: "Named teachers", roles: ["TEACHING_STAFF"] });
    const anon = await addressed({ title: "Anonymous teachers", roles: ["TEACHING_STAFF"], anonymous: true });
    for (const form of [named, anon]) {
      const body = { answers: [{ formQuestionId: form.q, value: "Busy but good" }] };
      expect((await api(`${BASE}/forms/for-you/${form.id}/submit`, { method: "POST", cookie: teacher.cookie, body })).status).toBe(200);
      const again = await api(`${BASE}/forms/for-you/${form.id}/submit`, { method: "POST", cookie: teacher.cookie, body });
      expect(again.status).toBe(400);
      expect(again.json.error.code).toBe("ALREADY_SUBMITTED");
      expect(await db.formResponse.count({ where: { formId: form.id } })).toBe(1);
    }
    const listed = (await api(`${BASE}/forms/for-you`, { cookie: teacher.cookie })).json.data.questionnaires as {
      id: string;
      hasSubmitted: boolean;
    }[];
    expect(listed.find((x) => x.id === named.id)?.hasSubmitted).toBe(true);

    const storedNamed = await db.formResponse.findFirstOrThrow({ where: { formId: named.id } });
    expect(storedNamed.respondentId).toBe(teacher.user.id);
    expect(storedNamed.studentId).toBeNull();
    const storedAnon = await db.formResponse.findFirstOrThrow({ where: { formId: anon.id } });
    expect(storedAnon.respondentId).toBeNull();
    expect(storedAnon.studentId).toBeNull();
    const participation = await db.formParticipation.findMany({ where: { formId: anon.id } });
    expect(participation).toHaveLength(1);
    expect(participation[0].respondentId).not.toBe(teacher.user.id);
  });
});

test.describe("a guardian lists the pupils their approved links name", () => {
  test("approved links only; a pending or revoked link names nobody; only a guardian asks", async () => {
    const mine = await api(`${BASE}/portal/practice/children`, { cookie: parent.cookie });
    expect(mine.status).toBe(200);
    const ids = (mine.json.data.children as { id: string; name: string; admissionNo: string }[]).map((c) => c.id).sort();
    expect(ids).toEqual([pNorth.student.id, pNorth2.student.id].sort());
    expect(mine.json.data.children[0]).toEqual({
      id: expect.any(String),
      name: expect.stringContaining("Pupil"),
      admissionNo: expect.any(String),
    });

    expect((await api(`${BASE}/portal/practice/children`, { cookie: parentPending.cookie })).json.data.children).toEqual([]);
    expect((await api(`${BASE}/portal/practice/children`, { cookie: parentRevoked.cookie })).json.data.children).toEqual([]);
    for (const who of [pNorth, teacher, admin])
      expect((await api(`${BASE}/portal/practice/children`, { cookie: who.cookie })).status).toBe(403);
    expect((await api(`${BASE}/portal/practice/children`)).status).toBe(401);
  });
});
