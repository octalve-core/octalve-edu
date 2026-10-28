import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi, type ApiResponse } from "../support/http";
import { member, pupil, type Person, type Pupil } from "../support/qbank-world";

// The answer key of a form (task 0024): the correct answer and the explanation of its questions are for the people who MANAGE the form (its creator, the administrators), and for
// nobody else. A colleague, a non-teaching member of staff and a holder of the "see form results" grant view the form and read its answers WITHOUT the key; a blank copy
// (printed without the answer key) is open to anyone who may view the form and may print at all (teaching staff and administrators), while a copy WITH the key is the managers'.
// The key is a distinctive string, so the tests look for it in the raw bytes of the answer, which also covers a field no test thought of.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

const KEY = { north: "Zanzibar-key-north", wide: "Zanzibar-key-wide" };
const EXPLAIN = { north: "Explained-by-Zanzibar-north", wide: "Explained-by-Zanzibar-wide" };
const PROMPT = { north: "Which island grows cloves, north?", wide: "Which island grows cloves, wide?" };

type Who = "admin" | "northAdmin" | "creator" | "colleague" | "clerk" | "granted" | "southTeacher";
type Scope = "north" | "wide";

let t: TestTenant;
let north: string;
let kid: Pupil;
const people = {} as Record<Who, Person>;
const form = {} as Record<Scope, { id: string; responseId: string }>;

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Answer Key School", campuses: ["North", "South"] });
  north = t.campuses[0].id;
  const south = t.campuses[1].id;
  people.admin = await member(t, Role.ADMIN, null, "School Admin");
  people.northAdmin = await member(t, Role.CAMPUS_ADMIN, north, "North Admin");
  people.creator = await member(t, Role.TEACHING_STAFF, north, "Creator");
  people.colleague = await member(t, Role.TEACHING_STAFF, north, "Colleague");
  people.clerk = await member(t, Role.NON_TEACHING_STAFF, north, "Clerk");
  people.granted = await member(t, Role.NON_TEACHING_STAFF, north, "Granted Clerk");
  people.southTeacher = await member(t, Role.TEACHING_STAFF, south, "South Teacher");
  await db.tenantMembership.updateMany({
    where: { tenantId: t.id, userId: people.granted.user.id },
    data: { permissions: ["CAN_VIEW_FORM_RESULTS"] as never },
  });
  kid = await pupil(t, north, "JSS 1", "Kid");
  for (const scope of ["north", "wide"] as const) {
    const campusId = scope === "north" ? north : null;
    const created = await db.form.create({
      data: {
        tenantId: t.id,
        campusId,
        kind: "PRACTICE_SET",
        title: `Key test ${scope}`,
        status: "PUBLISHED",
        createdById: scope === "north" ? people.creator.user.id : people.admin.user.id,
      },
    });
    const question = await db.formQuestion.create({
      data: {
        tenantId: t.id,
        formId: created.id,
        prompt: PROMPT[scope],
        questionType: "SHORT",
        correctAnswer: KEY[scope],
        explanation: EXPLAIN[scope],
        points: 2,
        markingMethod: "MANUAL",
      },
    });
    const response = await db.formResponse.create({
      data: {
        tenantId: t.id,
        campusId,
        formId: created.id,
        studentId: kid.student.id,
        status: "COMPLETED",
        markingStatus: "PENDING",
        submittedAt: new Date(),
      },
    });
    await db.formAnswer.create({
      data: { tenantId: t.id, responseId: response.id, formQuestionId: question.id, value: { text: "Unguja" }, markingStatus: "PENDING" },
    });
    form[scope] = { id: created.id, responseId: response.id };
  }
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const base = () => `/api/v1/schools/${t.code}`;
const hasKey = (res: ApiResponse, scope: Scope) => res.text.includes(KEY[scope]) || res.text.includes(EXPLAIN[scope]);
const pdfText = (res: ApiResponse) => res.bytes.toString("latin1");
const logs = () => db.questionBankPrintLog.count({ where: { tenantId: t.id } });

test.describe("the form as staff see it", () => {
  const KEEPS_KEY: Record<Scope, Who[]> = { north: ["admin", "northAdmin", "creator"], wide: ["admin"] };
  const SEES_FORM: Record<Scope, Who[]> = {
    north: ["admin", "northAdmin", "creator", "colleague", "clerk", "granted"],
    wide: ["admin", "northAdmin", "creator", "colleague", "clerk", "granted", "southTeacher"],
  };

  for (const scope of ["north", "wide"] as const) {
    test(`GET forms/[id] of a ${scope === "north" ? "North campus" : "whole-school"} form: the key only for those who manage it`, async () => {
      for (const who of SEES_FORM[scope]) {
        const res = await api(`${base()}/forms/${form[scope].id}`, { cookie: people[who].cookie });
        expect(res.status, `${who}: ${res.text.slice(0, 120)}`).toBe(200);
        const question = res.json.data.form.questions[0];
        expect(question.prompt, `${who} still sees the question`).toBe(PROMPT[scope]);
        if (KEEPS_KEY[scope].includes(who)) {
          expect(question.correctAnswer, `${who} manages it`).toBe(KEY[scope]);
          expect(question.explanation, `${who} manages it`).toBe(EXPLAIN[scope]);
        } else {
          expect(hasKey(res, scope), `${who} must not get the key anywhere in the answer`).toBe(false);
          expect(question, who).not.toHaveProperty("correctAnswer");
          expect(question, who).not.toHaveProperty("explanation");
        }
      }
    });
  }

  test("the answers of a form (GET marking): the key only for those who manage it; a holder of the grant reads the pupil's answer without it", async () => {
    const url = (scope: Scope) => `${base()}/forms/${form[scope].id}/responses/${form[scope].responseId}/marking`;
    for (const who of ["admin", "northAdmin", "creator"] as const) {
      const res = await api(url("north"), { cookie: people[who].cookie });
      expect(res.status, who).toBe(200);
      expect(res.json.data.response.answers[0].correctAnswer, who).toBe(KEY.north);
      expect(res.json.data.response.answers[0].explanation, who).toBe(EXPLAIN.north);
    }
    const granted = await api(url("north"), { cookie: people.granted.cookie });
    expect(granted.status, granted.text.slice(0, 160)).toBe(200);
    expect(granted.json.data.response.answers[0].studentValue, "the grant still reads the pupil's answer").toEqual({ text: "Unguja" });
    expect(hasKey(granted, "north"), "but not the key").toBe(false);
    // a form of the whole school: only the school's administrator reads it at all, and with the key
    const wide = await api(url("wide"), { cookie: people.admin.cookie });
    expect(wide.status).toBe(200);
    expect(wide.json.data.response.answers[0].correctAnswer).toBe(KEY.wide);
  });
});

test.describe("printing a form", () => {
  // the two routes that print a form: its own, and the question bank's
  const viaForm = (who: Person | null, scope: Scope, includeAnswerKey?: boolean) =>
    api(`${base()}/forms/${form[scope].id}/print`, { method: "POST", cookie: who?.cookie, body: { includeAnswerKey } });
  const viaBank = (who: Person | null, scope: Scope, includeAnswerKey?: boolean) =>
    api(`${base()}/question-bank/print`, {
      method: "POST",
      cookie: who?.cookie,
      body: { targetKind: "FORM", targetId: form[scope].id, includeAnswerKey },
    });
  const isPdf = (res: ApiResponse) =>
    res.status === 200 && res.headers.get("content-type") === "application/pdf" && pdfText(res).startsWith("%PDF");

  for (const [route, print] of [
    ["forms/[id]/print", viaForm],
    ["question-bank/print", viaBank],
  ] as const) {
    test(`${route}: a blank copy is for anyone who may view the form and print; a copy with the key is the managers'`, async () => {
      // a colleague of the same campus: the blank copy, not the key
      const before = await logs();
      const blank = await print(people.colleague, "north", false);
      expect(isPdf(blank), `a colleague's blank copy: ${blank.status} ${blank.text.slice(0, 100)}`).toBe(true);
      expect(pdfText(blank), "the copy is the real form").toContain(PROMPT.north);
      expect(pdfText(blank), "and carries no key").not.toContain(KEY.north);
      expect(await logs()).toBe(before + 1);
      const omitted = await print(people.colleague, "north", undefined);
      expect(isPdf(omitted), "no flag at all means no key").toBe(true);
      expect(pdfText(omitted)).not.toContain(KEY.north);
      const withKey = await print(people.colleague, "north", true);
      expect(withKey.status, "the key is the managers'").toBe(404);
      expect(await logs(), "a refusal logs nothing").toBe(before + 2);

      // the creator and the administrators: both, and the key is in the file
      for (const who of ["creator", "northAdmin", "admin"] as const) {
        const keyed = await print(people[who], "north", true);
        expect(isPdf(keyed), who).toBe(true);
        expect(pdfText(keyed), `${who}'s copy with the key`).toContain(KEY.north);
        expect(isPdf(await print(people[who], "north", false)), who).toBe(true);
      }
    });

    test(`${route}: a form of the whole school is printed blank by teachers, with the key by the school's administrator only`, async () => {
      for (const who of ["creator", "colleague", "northAdmin", "southTeacher"] as const) {
        const blank = await print(people[who], "wide", false);
        expect(isPdf(blank), `${who}: ${blank.status}`).toBe(true);
        expect(pdfText(blank), who).not.toContain(KEY.wide);
        expect((await print(people[who], "wide", true)).status, `${who} with the key`).toBe(404);
      }
      const keyed = await print(people.admin, "wide", true);
      expect(isPdf(keyed)).toBe(true);
      expect(pdfText(keyed)).toContain(KEY.wide);
    });

    test(`${route}: another campus is a 404 even for a blank copy; non-teaching staff are turned away at the door; nobody signed out`, async () => {
      expect((await print(people.southTeacher, "north", false)).status).toBe(404);
      expect((await print(people.southTeacher, "north", true)).status).toBe(404);
      for (const who of ["clerk", "granted"] as const) {
        expect((await print(people[who], "north", false)).status, `${who} blank`).toBe(403);
        expect((await print(people[who], "north", true)).status, `${who} with key`).toBe(403);
      }
      expect((await print(null, "north", false)).status).toBe(401);
    });
  }
});
