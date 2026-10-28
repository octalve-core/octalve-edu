import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { member, type Person } from "../support/qbank-world";

// The public survey link (task 0024 slice 8): a questionnaire whose audience is the public is answered by anyone holding its link, with no sign-in.
// The link names no session, so the request has no school until the link's token has been looked up; the lookup and every write after it go through the database's row-level
// security like any other school data. What these cases hold:
//   - the survey can be read and answered at all (the first version read and wrote with no school selected, which the database refuses: the link answered "not found" for every
//     survey and a submission could never be stored);
//   - the school in the address must be the school that owns the survey (a link under another school's code is "not found" and writes nothing);
//   - a draft, a closed survey and a survey for members only are not answered here, and a suspended school's survey is not found;
//   - what is stored carries the survey's school, no respondent, and (for an anonymous survey) a time that names the day only;
//   - a link cannot be hammered: requests from one address are limited.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let a: TestTenant;
let b: TestTenant;
let admin: Person;
const token = () => crypto.randomBytes(16).toString("hex");

type Seed = {
  status?: "DRAFT" | "PUBLISHED" | "CLOSED";
  audience?: "PUBLIC" | "MEMBERS";
  anonymous?: boolean;
  opensAt?: Date | null;
  closesAt?: Date | null;
};
/// A questionnaire with a yes/no question and a free-text one; returns its link token and the ids of its questions.
async function survey(over: Seed = {}) {
  const shareToken = token();
  const form = await db.form.create({
    data: {
      tenantId: a.id,
      campusId: a.campuses[0].id,
      kind: "QUESTIONNAIRE",
      title: "Public survey",
      status: over.status ?? "PUBLISHED",
      isAnonymous: over.anonymous ?? true,
      shareToken,
      opensAt: over.opensAt ?? null,
      closesAt: over.closesAt ?? null,
      createdById: admin.user.id,
    },
  });
  await db.formAudience.create({ data: { tenantId: a.id, formId: form.id, kind: over.audience ?? "PUBLIC" } });
  const yesNo = await db.formQuestion.create({
    data: {
      tenantId: a.id,
      formId: form.id,
      prompt: "Do you like the canteen?",
      questionType: "SINGLE",
      options: [
        { id: "yes", text: "Yes" },
        { id: "no", text: "No" },
      ],
      points: 0,
      sortOrder: 0,
    },
  });
  const text = await db.formQuestion.create({
    data: { tenantId: a.id, formId: form.id, prompt: "Anything else?", questionType: "SHORT", points: 0, sortOrder: 1 },
  });
  return { formId: form.id, token: shareToken, yesNo: yesNo.id, text: text.id };
}

const read = (code: string, t: string, ip?: string) => api(`/api/v1/schools/${code}/forms/public/${t}`, { ip });
const send = (code: string, t: string, answers: unknown, ip?: string) =>
  api(`/api/v1/schools/${code}/forms/public/${t}/submit`, { method: "POST", body: { answers }, ip });

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Survey", campuses: ["North"] });
  b = await createTenant({ name: "Beta Survey", campuses: ["Elsewhere"] });
  admin = await member(a, Role.ADMIN, null, "Admin");
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("answering a public survey", () => {
  test("the link shows the survey's questions to a visitor who is not signed in", async () => {
    const s = await survey();
    const res = await read(a.code, s.token);
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ id: s.formId, title: "Public survey", isAnonymous: true });
    expect((res.json.data.questions as { id: string }[]).map((q) => q.id)).toEqual([s.yesNo, s.text]);
    expect(res.text).not.toContain(s.token); // the response does not hand the token back, nor any staff member
    expect(res.text).not.toContain(admin.user.email);
  });

  test("an answer is stored against the survey's school, with no respondent and only the day on an anonymous survey", async () => {
    const s = await survey({ anonymous: true });
    const res = await send(a.code, s.token, [
      { formQuestionId: s.yesNo, value: "yes" },
      { formQuestionId: s.text, value: "More chairs please" },
    ]);
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ ok: true, formId: s.formId });
    const responses = await db.formResponse.findMany({ where: { formId: s.formId }, include: { answers: true } });
    expect(responses).toHaveLength(1);
    const [stored] = responses;
    expect(stored).toMatchObject({ tenantId: a.id, respondentId: null, studentId: null, status: "COMPLETED" });
    expect(stored.answers).toHaveLength(2);
    expect(stored.answers.every((x) => x.tenantId === a.id)).toBe(true);
    const day = (d: Date | null) => d !== null && d.getTime() % 86_400_000 === 0;
    expect(day(stored.submittedAt)).toBe(true);
    expect(day(stored.startedAt)).toBe(true);
    expect(stored.answers.every((x) => day(x.createdAt))).toBe(true);
  });

  test("a survey that is not anonymous keeps the moment of the answer", async () => {
    const s = await survey({ anonymous: false });
    expect((await send(a.code, s.token, [{ formQuestionId: s.yesNo, value: "no" }])).status).toBe(200);
    const stored = await db.formResponse.findFirstOrThrow({ where: { formId: s.formId } });
    expect(stored.submittedAt!.getTime() % 86_400_000).not.toBe(0);
  });

  test("a bad answer is a 400 and stores nothing", async () => {
    const s = await survey();
    const res = await send(a.code, s.token, [{ formQuestionId: s.yesNo, value: 7 }]);
    expect(res.status).toBe(400);
    expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(0);
    expect((await send(a.code, s.token, "not a list")).status).toBe(400);
  });
});

test.describe("which links answer", () => {
  test("an unknown token, and a token with the wrong shape, are 'not found'", async () => {
    for (const t of [token(), "x", "../../etc/passwd", "a".repeat(200)]) {
      expect((await read(a.code, t)).status).toBe(404);
      expect((await send(a.code, t, [])).status).toBe(404);
    }
  });

  test("the school in the address must be the school that owns the survey", async () => {
    const s = await survey();
    expect((await read(b.code, s.token)).status).toBe(404);
    const res = await send(b.code, s.token, [{ formQuestionId: s.yesNo, value: "yes" }]);
    expect(res.status).toBe(404);
    expect((await read("no-such-school", s.token)).status).toBe(404);
    expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(0);
    expect((await read(a.code, s.token)).status).toBe(200);
  });

  test("a draft, a closed survey and a survey that is not open yet are not answered", async () => {
    const draft = await survey({ status: "DRAFT" });
    expect((await read(a.code, draft.token)).status).toBe(404);
    expect((await send(a.code, draft.token, [{ formQuestionId: draft.yesNo, value: "yes" }])).status).toBe(404);

    const closed = await survey({ status: "CLOSED" });
    expect((await read(a.code, closed.token)).status).toBe(404);

    const over = await survey({ closesAt: new Date(Date.now() - 60_000) });
    expect((await read(a.code, over.token)).status).toBe(403);
    expect((await send(a.code, over.token, [{ formQuestionId: over.yesNo, value: "yes" }])).status).toBe(403);

    const later = await survey({ opensAt: new Date(Date.now() + 3_600_000) });
    expect((await read(a.code, later.token)).status).toBe(403);
    expect((await send(a.code, later.token, [{ formQuestionId: later.yesNo, value: "yes" }])).status).toBe(403);

    for (const s of [draft, closed, over, later]) expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(0);
  });

  test("a survey for the school's members is not answered through the public link", async () => {
    const s = await survey({ audience: "MEMBERS" });
    expect((await read(a.code, s.token)).status).toBe(403);
    expect((await send(a.code, s.token, [{ formQuestionId: s.yesNo, value: "yes" }])).status).toBe(403);
    expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(0);
  });

  test("a suspended school's survey is 'not found' until the school is back", async () => {
    const s = await survey();
    await db.tenant.update({ where: { id: a.id }, data: { suspendedAt: new Date() } });
    try {
      expect((await read(a.code, s.token)).status).toBe(404);
      expect((await send(a.code, s.token, [{ formQuestionId: s.yesNo, value: "yes" }])).status).toBe(404);
      expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(0);
    } finally {
      await db.tenant.update({ where: { id: a.id }, data: { suspendedAt: null } });
    }
    expect((await read(a.code, s.token)).status).toBe(200);
  });
});

test.describe("hammering a link", () => {
  test("reading is limited per address, and one address's limit is not another's", async () => {
    const s = await survey();
    const ip = "203.0.113.50";
    let last = 0;
    for (let i = 0; i < 130 && last !== 429; i++) last = (await read(a.code, s.token, ip)).status;
    expect(last).toBe(429);
    expect((await read(a.code, s.token, "203.0.113.51")).status).toBe(200);
  });

  test("answering is limited per address, whatever the answer", async () => {
    const s = await survey();
    const ip = "203.0.113.60";
    let last = 0;
    let sent = 0;
    for (; sent < 80 && last !== 429; sent++) last = (await send(a.code, s.token, "bad", ip)).status;
    expect(last).toBe(429);
    expect(sent).toBeGreaterThan(5); // a class on one school connection is not locked out by a handful
    expect((await send(a.code, s.token, [{ formQuestionId: s.yesNo, value: "yes" }], "203.0.113.61")).status).toBe(200);
  });
});
