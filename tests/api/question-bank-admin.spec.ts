import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
  DEFAULT_PASSWORD,
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  deactivateMembership,
  enableMfa,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader } from "../support/http";
import { createSession } from "@/lib/auth/session";

// The question bank's administration over real HTTP (task 0024 slice B): who reviews questions, and the switches. School and campus administrators only; every change needs a fresh
// proof of who the person is (decision D3) and writes an audit row that records it; a campus can only narrow; one school never reaches another's rows; and a platform
// administrator's support view reaches none of it (parity note section 5).
//
// School A has two campuses, North and South. People: its administrator, a campus administrator for each campus, teachers on North and South and one with no campus, a pupil, a
// parent and a deactivated teacher. School B has an administrator, a teacher and a campus of its own.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: { id: string };
let south: { id: string };
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
const base = () => `/api/v1/schools/${a.code}/question-bank`;
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const proof = (who: string) => ({ type: "password", value: people[who].password });
const get = (path: string, who = "admin") => api(`${base()}${path}`, as(who));
const addReviewer = (who: string, body: Record<string, unknown>, withProof = true) =>
  api(`${base()}/reviewers`, { ...as(who), method: "POST", body: { ...body, ...(withProof ? { stepUp: proof(who) } : {}) } });
const removeReviewer = (who: string, id: string, withProof = true) =>
  api(`${base()}/reviewers/${id}`, { ...as(who), method: "DELETE", body: withProof ? { stepUp: proof(who) } : {} });
const change = (who: string, body: Record<string, unknown>, withProof = true) =>
  api(`${base()}/settings`, { ...as(who), method: "PUT", body: { ...body, ...(withProof ? { stepUp: proof(who) } : {}) } });
const audits = (entity?: string) => db.questionBankAudit.findMany({ where: { tenantId: a.id, ...(entity ? { entity } : {}) }, orderBy: { createdAt: "asc" } });
const sessionFor = async (user: TestUser) => cookieHeader((await createSession(user.id)).token);

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Question Bank", campuses: ["North", "South"] });
  b = await createTenant({ name: "Beta Question Bank", campuses: ["Elsewhere"] });
  [north, south] = a.campuses;
  for (const key of ["admin", "adminB", "campusNorth", "campusSouth", "teacherNorth", "teacherSouth", "teacherWide", "pupil", "parent", "gone", "teacherB", "platform"])
    people[key] = await createUser({ platformAdmin: key === "platform" });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north.id);
  await addMembership(people.campusSouth.id, a.id, Role.CAMPUS_ADMIN, south.id);
  await addMembership(people.teacherNorth.id, a.id, Role.TEACHING_STAFF, north.id);
  await addMembership(people.teacherSouth.id, a.id, Role.TEACHING_STAFF, south.id);
  await addMembership(people.teacherWide.id, a.id, Role.TEACHING_STAFF);
  await addMembership(people.pupil.id, a.id, Role.STUDENT, north.id);
  await addMembership(people.parent.id, a.id, Role.PARENT);
  await addMembership(people.gone.id, a.id, Role.TEACHING_STAFF, north.id);
  await deactivateMembership(people.gone.id, a.id);
  await addMembership(people.teacherB.id, b.id, Role.TEACHING_STAFF);
  await enableMfa(people.platform.id);
  for (const key of Object.keys(people)) cookie[key] = await sessionFor(people[key]);
});
test.beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "QuestionBankAudit", "QuestionBankReviewer", "QuestionBankSetting" RESTART IDENTITY CASCADE`);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("who may call at all", () => {
  test("signed out is 401; a teacher, a pupil and a parent are 403; another school's administrator is a stranger (403); a platform administrator has no way in", async () => {
    for (const [method, path] of [
      ["GET", "/reviewers"],
      ["GET", "/settings"],
      ["POST", "/reviewers"],
      ["PUT", "/settings"],
      ["DELETE", "/reviewers/x"],
    ] as const) {
      expect((await api(`${base()}${path}`, { ...SAAS, method, body: method === "GET" ? undefined : {} })).status, `${method} ${path} signed out`).toBe(401);
      for (const who of ["teacherNorth", "teacherWide", "pupil", "parent", "adminB", "teacherB", "gone", "platform"]) {
        const res = await api(`${base()}${path}`, { ...as(who), method, body: method === "GET" ? undefined : { stepUp: proof(who) } });
        expect(res.status, `${method} ${path} as ${who}`).toBe(403);
      }
    }
    expect(await audits()).toHaveLength(0);
  });
});

test.describe("assigning a reviewer", () => {
  test("it needs the fresh proof: none is a 400, a wrong password a 403, and nothing is written either way", async () => {
    const body = { campusId: north.id, userId: people.teacherNorth.id, scope: "GENERAL" };
    expect((await addReviewer("admin", body, false)).status).toBe(400);
    const wrong = await api(`${base()}/reviewers`, { ...as("admin"), method: "POST", body: { ...body, stepUp: { type: "password", value: "not-the-password-1" } } });
    expect([wrong.status, wrong.json.error.code]).toEqual([403, "WRONG_PASSWORD"]);
    expect(await db.questionBankReviewer.count()).toBe(0);
    expect(await audits()).toHaveLength(0);
  });

  test("the school's administrator assigns for a campus and for every campus; each is audited with when the proof was given; a duplicate is a 409", async () => {
    const before = Date.now();
    const one = await addReviewer("admin", { campusId: north.id, userId: people.teacherNorth.id, scope: "GENERAL" });
    expect(one.status, one.text).toBe(201);
    expect(one.json.data.reviewer).toMatchObject({ campusId: north.id, scope: "GENERAL", isExamApprover: false, inherited: false });
    const wide = await addReviewer("admin", { campusId: null, userId: people.teacherWide.id, scope: "SUBJECT", subjectLabel: "  Mathematics ", isExamApprover: true });
    expect(wide.status, wide.text).toBe(201);
    expect(wide.json.data.reviewer).toMatchObject({ campusId: null, scope: "SUBJECT", subjectLabel: "Mathematics", isExamApprover: true });
    expect((await addReviewer("admin", { campusId: north.id, userId: people.teacherNorth.id, scope: "GENERAL" })).status).toBe(409);
    expect((await addReviewer("admin", { campusId: null, userId: people.teacherWide.id, scope: "SUBJECT", subjectLabel: "mathematics" })).status).toBe(409);

    const rows = await audits("REVIEWER");
    expect(rows.map((r) => r.action)).toEqual(["ASSIGNED", "ASSIGNED"]);
    expect(rows[0]).toMatchObject({ campusId: north.id, actorUserId: people.admin.id, ref: one.json.data.reviewer.id });
    expect(rows[0].stepUpVerifiedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(rows[1].campusId).toBeNull();
    expect(await db.questionBankReviewer.count({ where: { tenantId: a.id } })).toBe(2);
  });

  test("a person who is not active staff of this school, or of that campus, cannot be a reviewer; a campus must be this school's", async () => {
    const ask = (who: string, over: Record<string, unknown> = {}) => addReviewer("admin", { campusId: north.id, userId: people[who].id, scope: "GENERAL", ...over });
    for (const who of ["pupil", "parent", "gone", "teacherB", "adminB", "teacherSouth"]) expect((await ask(who)).status, who).toBe(400);
    expect((await ask("teacherWide")).status).toBe(201); // a membership with no campus belongs to every campus
    expect((await addReviewer("admin", { campusId: null, userId: people.teacherSouth.id, scope: "GENERAL" })).status).toBe(201);
    expect((await ask("campusNorth")).status).toBe(201); // a campus administrator is staff too
    expect((await addReviewer("admin", { campusId: b.campuses[0].id, userId: people.teacherNorth.id, scope: "GENERAL" })).status).toBe(404);
    expect((await addReviewer("admin", { campusId: "nope", userId: people.teacherNorth.id, scope: "GENERAL" })).status).toBe(404);
    expect((await ask("teacherNorth", { userId: "no-such-person-1" })).status).toBe(400);
  });

  test("a subject reviewer needs a subject; a general one names none; the body is strict", async () => {
    const base0 = { campusId: north.id, userId: people.teacherNorth.id };
    expect((await addReviewer("admin", { ...base0, scope: "SUBJECT" })).status).toBe(400);
    expect((await addReviewer("admin", { ...base0, scope: "SUBJECT", subjectLabel: "!!!" })).status).toBe(400);
    expect((await addReviewer("admin", { ...base0, scope: "SUBJECT", subjectLabel: "x".repeat(81) })).status).toBe(400);
    expect((await addReviewer("admin", { ...base0, scope: "SUBJECT", subjectLabel: "Maths‮" })).status).toBe(400);
    expect((await addReviewer("admin", { ...base0, scope: "GENERAL", subjectLabel: "Maths" })).status).toBe(400);
    expect((await addReviewer("admin", { ...base0, scope: "GENERAL", surprise: true })).status).toBe(400);
    expect((await addReviewer("admin", { userId: people.teacherNorth.id, scope: "GENERAL" })).status).toBe(400); // the campus must be said: null is a choice, not a default
    expect(await db.questionBankReviewer.count()).toBe(0);
  });

  test("a campus administrator assigns for their own campus only: not another campus (403), not the whole school (403)", async () => {
    const own = await addReviewer("campusNorth", { campusId: north.id, userId: people.teacherNorth.id, scope: "GENERAL" });
    expect(own.status, own.text).toBe(201);
    expect((await addReviewer("campusNorth", { campusId: south.id, userId: people.teacherSouth.id, scope: "GENERAL" })).status).toBe(403);
    expect((await addReviewer("campusNorth", { campusId: null, userId: people.teacherWide.id, scope: "GENERAL" })).status).toBe(403);
    expect((await addReviewer("campusNorth", { campusId: north.id, userId: people.teacherSouth.id, scope: "GENERAL" })).status).toBe(400); // staff of another campus
    expect(await db.questionBankReviewer.count()).toBe(1);
  });
});

test.describe("seeing and removing reviewers", () => {
  const seed = async () => {
    const mk = async (who: string, campusId: string | null, extra: Record<string, unknown> = {}) =>
      (await addReviewer("admin", { campusId, userId: people[who].id, scope: "GENERAL", ...extra })).json.data.reviewer.id as string;
    return { north: await mk("teacherNorth", north.id), south: await mk("teacherSouth", south.id), wide: await mk("teacherWide", null) };
  };

  test("the school's administrator sees every reviewer; a campus administrator their campus's and the school-wide ones, flagged; neither sees another school's", async () => {
    const ids = await seed();
    const all = await get("/reviewers");
    expect(all.status).toBe(200);
    expect((all.json.data.reviewers as { id: string }[]).map((r) => r.id).sort()).toEqual(Object.values(ids).sort());
    const mine = await get("/reviewers", "campusNorth");
    const list = mine.json.data.reviewers as { id: string; inherited: boolean }[];
    expect(list.map((r) => r.id).sort()).toEqual([ids.north, ids.wide].sort());
    expect(list.find((r) => r.id === ids.wide)!.inherited).toBe(true);
    expect(list.find((r) => r.id === ids.north)!.inherited).toBe(false);
    expect((await get("/reviewers?campusId=" + south.id)).json.data.reviewers).toHaveLength(2);
    expect((await get("/reviewers?campusId=" + south.id, "campusNorth")).status).toBe(403);
    expect((await get("/reviewers?campusId=" + b.campuses[0].id)).status).toBe(404);
    expect((await get("/reviewers?campusId=%00")).status).toBe(400); // a NUL byte in the query is refused for every route, before the route runs
    expect((await get("/reviewers?campusId=x%20y")).status).toBe(404);
    const otherSchool = await api(`/api/v1/schools/${b.code}/question-bank/reviewers`, as("adminB"));
    expect(otherSchool.json.data.reviewers).toEqual([]);
  });

  test("removal needs the fresh proof; the school's administrator removes any; a campus administrator their own campus's, not the school-wide (403) and not another campus's (404)", async () => {
    const ids = await seed();
    expect((await removeReviewer("admin", ids.south, false)).status).toBe(400);
    expect((await removeReviewer("campusNorth", ids.wide)).status).toBe(403);
    expect((await removeReviewer("campusNorth", ids.south)).status).toBe(404);
    expect(await db.questionBankReviewer.count()).toBe(3);
    expect((await removeReviewer("campusNorth", ids.north)).status).toBe(200);
    expect((await removeReviewer("admin", ids.wide)).status).toBe(200);
    expect((await removeReviewer("admin", ids.south)).status).toBe(200);
    expect(await db.questionBankReviewer.count()).toBe(0);
    expect((await audits("REVIEWER")).filter((r) => r.action === "REMOVED")).toHaveLength(3);
    expect((await removeReviewer("admin", ids.south)).status).toBe(404); // gone: not found, and no second audit row
    expect((await audits("REVIEWER")).filter((r) => r.action === "REMOVED")).toHaveLength(3);
  });

  test("an unknown id, another school's reviewer and an id that cannot be one are the same 404; two removals at once write one audit row", async () => {
    const ids = await seed();
    const other = await api(`/api/v1/schools/${b.code}/question-bank/reviewers/${ids.north}`, { ...as("adminB"), method: "DELETE", body: { stepUp: proof("adminB") } });
    expect(other.status).toBe(404);
    for (const id of ["no-such-id", "a".repeat(300), "%00", "x y"]) expect((await removeReviewer("admin", id)).status, id).toBe(404);
    expect(await db.questionBankReviewer.count()).toBe(3);
    const both = await Promise.all([removeReviewer("admin", ids.north), removeReviewer("admin", ids.north)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 404]);
    expect((await audits("REVIEWER")).filter((r) => r.action === "REMOVED")).toHaveLength(1);
  });
});

test.describe("the switches", () => {
  test("the view lists every switch with its default, the school's value, the campus's own and what applies, including what a parent may see (NONE to start)", async () => {
    const res = await get("/settings");
    expect(res.status, res.text).toBe(200);
    const rows = res.json.data.settings as { key: string; default: unknown; school: unknown; override: unknown; effective: unknown; kind: string }[];
    expect(rows).toHaveLength(16);
    expect(rows.find((r) => r.key === "bank.parents.view")).toMatchObject({ default: "NONE", school: "NONE", override: null, effective: "NONE", kind: "choice" });
    expect(rows.find((r) => r.key === "bank.images.max")).toMatchObject({ default: 3, school: 3, effective: 3 });
    const mine = await get("/settings", "campusNorth");
    expect(mine.json.data.campusId).toBe(north.id);
    expect((await get("/settings?campusId=" + south.id, "campusNorth")).status).toBe(403);
    expect((await get("/settings?campusId=" + south.id)).status).toBe(200);
    expect((await get("/settings?campusId=" + b.campuses[0].id)).status).toBe(404);
  });

  test("a change needs the fresh proof (none 400, wrong 403, nothing written); the school's administrator changes the school's value, audited with the old and new value and the proof's time", async () => {
    const body = { scope: "SCHOOL", changes: { "bank.images.max": 4, "bank.parents.view": "SUMMARY" }, reason: "Pictures matter for maths" };
    expect((await change("admin", body, false)).status).toBe(400);
    const wrong = await api(`${base()}/settings`, { ...as("admin"), method: "PUT", body: { ...body, stepUp: { type: "password", value: "not-the-password-1" } } });
    expect(wrong.status).toBe(403);
    expect(await db.questionBankSetting.count()).toBe(0);
    expect(await audits()).toHaveLength(0);

    const res = await change("admin", body);
    expect(res.status, res.text).toBe(200);
    expect((res.json.data.changed as string[]).sort()).toEqual(["bank.images.max", "bank.parents.view"]);
    const rows = res.json.data.settings as { key: string; school: unknown; effective: unknown }[];
    expect(rows.find((r) => r.key === "bank.images.max")).toMatchObject({ school: 4, effective: 4 });
    const trail = await audits("SETTING");
    expect(trail.map((t) => [t.ref, t.action, t.oldValue, t.newValue, t.reason, t.campusId]).sort()).toEqual(
      [
        ["bank.images.max", "SET", null, 4, "Pictures matter for maths", null],
        ["bank.parents.view", "SET", null, "SUMMARY", "Pictures matter for maths", null],
      ].sort(),
    );
    expect(trail.every((t) => t.stepUpVerifiedAt !== null && t.actorUserId === people.admin.id)).toBe(true);
    // the same value again changes nothing and writes nothing
    expect((await change("admin", { scope: "SCHOOL", changes: { "bank.images.max": 4 } })).json.data.changed).toEqual([]);
    expect(await audits("SETTING")).toHaveLength(2);
    // clearing puts it back to the default
    const cleared = await change("admin", { scope: "SCHOOL", changes: { "bank.images.max": null } });
    expect(cleared.json.data.changed).toEqual(["bank.images.max"]);
    expect((await audits("SETTING")).at(-1)).toMatchObject({ action: "CLEARED", oldValue: 4, newValue: null });
  });

  test("a campus may only narrow: a campus administrator makes a switch stricter for their own campus, not looser, not for the school, not for another campus", async () => {
    expect((await change("admin", { scope: "SCHOOL", changes: { "bank.access.staff": true, "bank.images.max": 4, "bank.parents.view": "SUMMARY" } })).status).toBe(200);
    const narrow = await change("campusNorth", { scope: "CAMPUS", campusId: north.id, changes: { "bank.images.max": 3, "bank.parents.view": "NONE", "bank.access.staff": false, "bank.practice.maxQuestions": 30 } });
    expect(narrow.status, narrow.text).toBe(200);
    const view = (narrow.json.data.settings as { key: string; school: unknown; override: unknown; effective: unknown }[]).find((r) => r.key === "bank.parents.view")!;
    expect(view).toMatchObject({ school: "SUMMARY", override: "NONE", effective: "NONE" });
    // the school's other campus is untouched
    const southView = (await get("/settings?campusId=" + south.id)).json.data.settings as { key: string; effective: unknown }[];
    expect(southView.find((r) => r.key === "bank.parents.view")!.effective).toBe("SUMMARY");

    const looser = await change("campusNorth", { scope: "CAMPUS", campusId: north.id, changes: { "bank.parents.view": "FULL" } });
    expect(looser.status).toBe(400);
    expect(looser.json.error.details[0].path).toBe("changes.bank.parents.view");
    expect((await change("campusNorth", { scope: "CAMPUS", campusId: north.id, changes: { "bank.practice.maxQuestions": 150 } })).status).toBe(400); // the school allows 100: a campus cannot raise it
    expect((await change("campusNorth", { scope: "SCHOOL", changes: { "bank.images.max": 3 } })).status).toBe(403);
    expect((await change("campusNorth", { scope: "CAMPUS", campusId: south.id, changes: { "bank.images.max": 3 } })).status).toBe(403);
    expect((await change("campusNorth", { scope: "CAMPUS", campusId: null, changes: { "bank.images.max": 3 } })).status).toBe(400); // null is not "my campus"
    expect((await change("admin", { scope: "CAMPUS", campusId: b.campuses[0].id, changes: { "bank.images.max": 3 } })).status).toBe(404);
    expect((await change("admin", { scope: "CAMPUS", changes: { "bank.images.max": 3 } })).status).toBe(400);
    // clearing an override is always allowed, and the campus is then back on the school's value
    expect((await change("campusNorth", { scope: "CAMPUS", campusId: north.id, changes: { "bank.parents.view": null } })).status).toBe(200);
    const back = (await get("/settings", "campusNorth")).json.data.settings as { key: string; effective: unknown }[];
    expect(back.find((r) => r.key === "bank.parents.view")!.effective).toBe("SUMMARY");
    expect((await audits("SETTING")).every((t) => t.stepUpVerifiedAt !== null)).toBe(true);
  });

  test("a value must fit its switch: the wrong type, out of bounds, an unknown switch, a value that is not one of the choices, school numbers that disagree, too many at once, a NUL byte", async () => {
    const bad = async (changes: Record<string, unknown>, status = 400) => expect((await change("admin", { scope: "SCHOOL", changes })).status, JSON.stringify(changes).slice(0, 80)).toBe(status);
    await bad({ "bank.access.staff": "yes" });
    await bad({ "bank.images.max": 5 });
    await bad({ "bank.images.max": "4" });
    await bad({ "bank.practice.maxQuestions": 0 });
    await bad({ "bank.practice.maxQuestions": 1.5 });
    await bad({ "bank.practice.presets": [20, 10] });
    await bad({ "bank.parents.view": "EVERYTHING" });
    await bad({ "bank.parents.view": "none" });
    await bad({ "bank.nope": 1 });
    await bad({ "__proto__": 1 });
    await bad({ "bank.practice.maxQuestions": 10 }); // below the default set size of 20: the numbers must agree, so the administrator fixes them together
    await bad({});
    await bad(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`bank.k${i}`, 1])));
    const nul = await api(`${base()}/settings`, { ...as("admin"), method: "PUT", rawBody: '{"scope":"SCHOOL","changes":{"bank.images.max":4},"reason":"a\\u0000b","stepUp":{"type":"password","value":"x"}}' });
    expect(nul.status).toBeLessThan(500);
    expect(await db.questionBankSetting.count()).toBe(0);
    expect((await change("admin", { scope: "SCHOOL", changes: { "bank.practice.maxQuestions": 10, "bank.practice.defaultQuestions": 10, "bank.practice.presets": [5, 10], "bank.practice.dailyCap": 10 } })).status).toBe(200);
  });

  test("two changes at once do not lose one", async () => {
    const results = await Promise.all([
      change("admin", { scope: "SCHOOL", changes: { "bank.images.max": 4 } }),
      change("admin", { scope: "SCHOOL", changes: { "bank.parents.view": "FULL" } }),
      change("admin", { scope: "SCHOOL", changes: { "bank.smallSummary.min": 9 } }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const rows = await db.questionBankSetting.findMany({ where: { tenantId: a.id } });
    expect(rows.map((r) => r.key).sort()).toEqual(["bank.images.max", "bank.parents.view", "bank.smallSummary.min"]);
  });
});

test.describe("one school never reaches another's", () => {
  test("a reviewer, a switch and an audit row of school A are invisible to school B's administrator, and B's changes land in B", async () => {
    await addReviewer("admin", { campusId: north.id, userId: people.teacherNorth.id, scope: "GENERAL" });
    await change("admin", { scope: "SCHOOL", changes: { "bank.images.max": 4 } });
    const otherBase = `/api/v1/schools/${b.code}/question-bank`;
    expect((await api(`${otherBase}/reviewers`, as("adminB"))).json.data.reviewers).toEqual([]);
    const view = (await api(`${otherBase}/settings`, as("adminB"))).json.data.settings as { key: string; school: unknown }[];
    expect(view.find((r) => r.key === "bank.images.max")!.school).toBe(3);
    const mine = await api(`${otherBase}/settings`, { ...as("adminB"), method: "PUT", body: { scope: "SCHOOL", changes: { "bank.images.max": 4, "bank.parents.view": "FULL" }, stepUp: proof("adminB") } });
    expect(mine.status, mine.text).toBe(200);
    expect(await db.questionBankSetting.count({ where: { tenantId: b.id } })).toBe(2);
    expect(await db.questionBankSetting.count({ where: { tenantId: a.id } })).toBe(1);
    // school A's code with school B's person is a stranger, not a "no"
    expect((await api(`/api/v1/schools/${a.code}/question-bank/settings`, as("adminB"))).status).toBe(403);
  });
});

test.describe("a platform administrator's support view reaches none of it", () => {
  test("even with every grantable area granted, the question bank routes answer 403 inside a support view", async () => {
    const grant = await api(`/api/v1/schools/${a.code}/support-grants`, {
      ...as("admin"),
      method: "POST",
      body: { areas: ["settings", "academics", "people", "attendance", "results"], hours: 2, reason: "Ticket 1: checking the question bank", stepUp: proof("admin") },
    });
    expect(grant.status, grant.text).toBe(201);
    const opened = await api("/api/v1/platform/support/open", { ...as("platform"), method: "POST", body: { code: a.code, password: DEFAULT_PASSWORD } });
    expect(opened.status, opened.text).toBe(200);
    for (const [method, path] of [
      ["GET", "/reviewers"],
      ["GET", "/settings"],
    ] as const) {
      const res = await api(`${base()}${path}`, { ...as("platform"), method });
      expect([path, res.status, res.json?.error?.code]).toEqual([path, 403, "FORBIDDEN"]);
    }
    expect((await get("/settings")).status).toBe(200); // the school's own administrator is not in a support view
  });
});
