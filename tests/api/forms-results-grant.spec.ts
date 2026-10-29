import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi, type ApiResponse } from "../support/http";
import { classArm, member, pupil, type Person, type Pupil } from "../support/qbank-world";

// The grant that lets a non-teaching member of staff READ form results (task 0024): non-teaching staff keep the question bank, the list of forms, the print log and the reports, but
// read no results, answers or turn-ins UNLESS an administrator gives them CAN_VIEW_FORM_RESULTS. The grant:
//   - is given and taken away by the school's administrator only, through the members API, and is audited there;
//   - opens the READ routes only (analytics, marking queues and answers, turn-ins): editing, closing, marking, recording turn-ins and printing stay with the form's creator and
//     the administrators, grant or no grant;
//   - is held to the campus rule: it reaches the forms of the holder's own campus (a membership with no campus covers every campus), and a form of the whole school only for
//     a holder whose membership covers the whole school.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

const GRANT = "CAN_VIEW_FORM_RESULTS";

let t: TestTenant;
let north: string;
let south: string;
let kid: Pupil;
let admin: Person;
let campusAdmin: Person;
let creator: Person;
let clerk: Person; // North, non-teaching, no grant (to start with)
let southClerk: Person; // South, non-teaching, granted straight in the database
let wideClerk: Person; // the whole school, non-teaching, granted straight in the database
const seeded = {} as Record<
  "north" | "south" | "wide",
  { form: string; paper: string; response: string; answer: string; questionnaire: string }
>;

async function seedAll(campusId: string | null, by: string) {
  const mk = (kind: "PRACTICE_SET" | "QUESTIONNAIRE" | "PAPER_WORK") =>
    db.form.create({ data: { tenantId: t.id, campusId, kind, title: kind, status: "PUBLISHED", createdById: by } });
  const practice = await mk("PRACTICE_SET");
  const questionnaire = await mk("QUESTIONNAIRE");
  const paper = await mk("PAPER_WORK");
  const question = await db.formQuestion.create({
    data: { tenantId: t.id, formId: practice.id, prompt: "Explain.", questionType: "SHORT", points: 5, markingMethod: "MANUAL" },
  });
  const response = await db.formResponse.create({
    data: {
      tenantId: t.id,
      campusId,
      formId: practice.id,
      studentId: kid.student.id,
      status: "COMPLETED",
      markingStatus: "PENDING",
      submittedAt: new Date(),
    },
  });
  const answer = await db.formAnswer.create({
    data: { tenantId: t.id, responseId: response.id, formQuestionId: question.id, value: { text: "x" }, markingStatus: "PENDING" },
  });
  await db.formTurnIn.create({ data: { tenantId: t.id, campusId, formId: paper.id, studentId: kid.student.id, status: "PENDING" } });
  return { form: practice.id, paper: paper.id, response: response.id, answer: answer.id, questionnaire: questionnaire.id };
}

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Grant School", campuses: ["North", "South"] });
  north = t.campuses[0].id;
  south = t.campuses[1].id;
  admin = await member(t, Role.ADMIN, null, "School Admin");
  campusAdmin = await member(t, Role.CAMPUS_ADMIN, north, "North Admin");
  creator = await member(t, Role.TEACHING_STAFF, north, "Creator");
  const southTeacher = await member(t, Role.TEACHING_STAFF, south, "South Teacher");
  clerk = await member(t, Role.NON_TEACHING_STAFF, north, "Clerk");
  southClerk = await member(t, Role.NON_TEACHING_STAFF, south, "South Clerk");
  wideClerk = await member(t, Role.NON_TEACHING_STAFF, null, "Wide Clerk");
  for (const who of [southClerk, wideClerk])
    await db.tenantMembership.updateMany({ where: { tenantId: t.id, userId: who.user.id }, data: { permissions: [GRANT] as never } });
  kid = await pupil(t, north, "JSS 1", "Kid");
  await classArm(t, north, "JSS 1");
  seeded.north = await seedAll(north, creator.user.id);
  seeded.south = await seedAll(south, southTeacher.user.id);
  seeded.wide = await seedAll(null, admin.user.id);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const base = () => `/api/v1/schools/${t.code}`;
const grant = (who: Person, by: Person, permissions: string[]) =>
  api(`${base()}/members/${who.user.id}`, { method: "PATCH", cookie: by.cookie, body: { permissions } });

/// The READ routes of the form `ids`, each as a call.
const reads = (ids: (typeof seeded)["north"]) => ({
  analytics: (p: Person) => api(`${base()}/forms/${ids.questionnaire}/analytics`, { cookie: p.cookie }),
  markingQueue: (p: Person) => api(`${base()}/forms/${ids.form}/marking-queue`, { cookie: p.cookie }),
  answers: (p: Person) => api(`${base()}/forms/${ids.form}/responses/${ids.response}/marking`, { cookie: p.cookie }),
  turnIns: (p: Person) => api(`${base()}/forms/${ids.paper}/turn-ins`, { cookie: p.cookie }),
});
/// The MANAGE routes of the form `ids`.
const manages = (ids: (typeof seeded)["north"]) => ({
  edit: (p: Person) => api(`${base()}/forms/${ids.form}`, { method: "PATCH", cookie: p.cookie, body: { title: "Renamed" } }),
  close: (p: Person) => api(`${base()}/forms/${ids.form}/close`, { method: "POST", cookie: p.cookie, body: {} }),
  mark: (p: Person) =>
    api(`${base()}/forms/${ids.form}/responses/${ids.response}/marking`, {
      method: "PATCH",
      cookie: p.cookie,
      body: { answerId: ids.answer, score: 1 },
    }),
  turnIn: (p: Person) =>
    api(`${base()}/forms/${ids.paper}/turn-ins`, {
      method: "PATCH",
      cookie: p.cookie,
      body: { studentId: kid.student.id, status: "HANDED_IN" },
    }),
  print: (p: Person) => api(`${base()}/forms/${ids.form}/print`, { method: "POST", cookie: p.cookie, body: {} }),
});
const statuses = async (calls: Record<string, (p: Person) => Promise<ApiResponse>>, who: Person) =>
  Object.fromEntries(await Promise.all(Object.entries(calls).map(async ([name, call]) => [name, (await call(who)).status])));

test.describe.serial("the grant", () => {
  test("without it a non-teaching member of staff reads no results, and still has the form list", async () => {
    for (const [name, status] of Object.entries(await statuses(reads(seeded.north), clerk))) expect(status, name).toBe(403);
    expect((await api(`${base()}/forms`, { cookie: clerk.cookie })).status).toBe(200);
    expect((await api(`${base()}/forms/${seeded.north.form}`, { cookie: clerk.cookie })).status).toBe(200);
    expect((await api(`${base()}/question-bank/print-logs`, { cookie: clerk.cookie })).status).toBe(200);
  });

  test("only the school's administrator gives it: a campus administrator, a teacher and the holder are turned away", async () => {
    expect((await grant(clerk, campusAdmin, [GRANT])).status).toBe(403);
    expect((await grant(clerk, creator, [GRANT])).status).toBe(403);
    expect((await grant(clerk, clerk, [GRANT])).status).toBe(403);
    expect((await statuses(reads(seeded.north), clerk)).analytics).toBe(403);
  });

  test("the administrator gives it: the READ routes of the holder's campus open, the MANAGE routes stay shut", async () => {
    const res = await grant(clerk, admin, [GRANT]);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.member.permissions).toEqual([GRANT]);
    for (const [name, status] of Object.entries(await statuses(reads(seeded.north), clerk))) expect(status, name).toBe(200);
    for (const [name, status] of Object.entries(await statuses(manages(seeded.north), clerk))) expect(status, name).toBe(403);
    // the marking queue of the school lists the holder's campus's answers
    const queue = (await api(`${base()}/forms/marking-queue`, { cookie: clerk.cookie })).json?.data?.queue.map((r: { id: string }) => r.id);
    expect(queue).toContain(seeded.north.response);
    expect(queue).not.toContain(seeded.south.response);
    expect(queue).not.toContain(seeded.wide.response);
  });

  test("the grant is audited by the members service", async () => {
    const audit = await db.auditLog.findFirstOrThrow({
      where: { tenantId: t.id, targetId: clerk.user.id, action: "MEMBER_PERMISSIONS_CHANGED" },
    });
    expect(audit).toMatchObject({ actorUserId: admin.user.id, beforeValue: { permissions: [] }, afterValue: { permissions: [GRANT] } });
  });

  test("it is held to the campus rule: another campus and a whole-school form are a 404 for a holder bound to a campus", async () => {
    for (const ids of [seeded.south, seeded.wide])
      for (const [name, status] of Object.entries(await statuses(reads(ids), clerk))) expect(status, name).toBe(404);
  });

  test("a holder bound to the SOUTH campus reads South and not North; a holder with no campus reads every campus and the whole school's forms", async () => {
    for (const [name, status] of Object.entries(await statuses(reads(seeded.south), southClerk))) expect(status, name).toBe(200);
    for (const [name, status] of Object.entries(await statuses(reads(seeded.north), southClerk))) expect(status, name).toBe(404);
    for (const ids of [seeded.north, seeded.south, seeded.wide])
      for (const [name, status] of Object.entries(await statuses(reads(ids), wideClerk))) expect(status, name).toBe(200);
    for (const [name, status] of Object.entries(await statuses(manages(seeded.north), wideClerk))) expect(status, name).toBe(403);
  });

  test("taking it away closes the READ routes again at the next request", async () => {
    const res = await grant(clerk, admin, []);
    expect(res.status, res.text).toBe(200);
    for (const [name, status] of Object.entries(await statuses(reads(seeded.north), clerk))) expect(status, name).toBe(403);
  });

  test("the people who always could read still do, grant or no grant", async () => {
    for (const who of [admin, campusAdmin, creator])
      for (const [name, status] of Object.entries(await statuses(reads(seeded.north), who))) expect(status, `${name}`).toBe(200);
  });
});
