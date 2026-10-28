import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi, type ApiResponse } from "../support/http";
import { classArm, member, pupil, type Person, type Pupil } from "../support/qbank-world";

// Who may reach a form BY ITS ID (task 0024, the campus rule for forms). Every staff route that names a form is run as seven people against a form of the NORTH campus and a
// form of the whole school, and the answer must follow one rule:
//   - VIEW (the form and its settings): the school's administrator; the staff of the form's campus; for a whole-school form, any staff. Not another campus: that is a 404, the
//     same as an id that does not exist, so an id is never confirmed to the staff of another campus.
//   - READ (results, answers, turn-ins, marking queues) and MANAGE (edit, close, mark, record turn-ins, print): the school's administrator, the administrator of the form's
//     campus, and the form's own creator. A colleague of the same campus does not, and nobody but the school's administrator reaches a whole-school form's results.
//   - Non-teaching staff are turned away at the door of READ and MANAGE routes (403), as before; the grant that lets them read is held by forms-results-grant.spec.ts.
// "Through" is a 2xx: every call below is made to succeed for someone who may.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

type Access = "view" | "read" | "manage";
type Scope = "north" | "wide";
type Who = "admin" | "northAdmin" | "southAdmin" | "creator" | "colleague" | "southTeacher" | "clerk";
type Kind = "practice" | "questionnaire" | "paper";
type Seeded = { id: string; responseId?: string; answerId?: string };

let t: TestTenant;
let north: string;
let south: string;
let kid: Pupil;
let groupId: string;
const people = {} as Record<Who, Person>;
const forms = {} as Record<`${Kind}:${Scope}`, Seeded>;

const ALLOWED: Record<`${Access}:${Scope}`, Who[]> = {
  "view:north": ["admin", "northAdmin", "creator", "colleague", "clerk"],
  "read:north": ["admin", "northAdmin", "creator"],
  "manage:north": ["admin", "northAdmin", "creator"],
  "view:wide": ["admin", "northAdmin", "southAdmin", "creator", "colleague", "southTeacher", "clerk"],
  "read:wide": ["admin"],
  "manage:wide": ["admin"],
};
const WHO: Who[] = ["admin", "northAdmin", "southAdmin", "creator", "colleague", "southTeacher", "clerk"];

/// A form of `kind` for `campusId` written by `byUserId`, with what its routes need: a pending manual answer to mark, a questionnaire answer, a pupil on the roll call.
async function seedForm(kind: Kind, campusId: string | null, byUserId: string): Promise<Seeded> {
  const form = await db.form.create({
    data: {
      tenantId: t.id,
      campusId,
      kind: kind === "practice" ? "PRACTICE_SET" : kind === "questionnaire" ? "QUESTIONNAIRE" : "PAPER_WORK",
      title: `${kind} of ${campusId ? "north" : "the school"}`,
      status: "PUBLISHED",
      createdById: byUserId,
    },
  });
  if (kind === "paper") {
    await db.formAudience.create({ data: { tenantId: t.id, formId: form.id, kind: "MEMBERS", classGroupIds: [groupId] } });
    await db.formTurnIn.create({ data: { tenantId: t.id, campusId, formId: form.id, studentId: kid.student.id, status: "PENDING" } });
    return { id: form.id };
  }
  const question = await db.formQuestion.create({
    data: {
      tenantId: t.id,
      formId: form.id,
      prompt: "Explain why the sky is blue.",
      questionType: kind === "practice" ? "SHORT" : "TEXT",
      points: 5,
      markingMethod: kind === "practice" ? "MANUAL" : "AUTO",
    },
  });
  const response = await db.formResponse.create({
    data: {
      tenantId: t.id,
      campusId,
      formId: form.id,
      studentId: kid.student.id,
      status: "COMPLETED",
      markingStatus: kind === "practice" ? "PENDING" : "NOT_REQUIRED",
      submittedAt: new Date(),
    },
  });
  const answer = await db.formAnswer.create({
    data: {
      tenantId: t.id,
      responseId: response.id,
      formQuestionId: question.id,
      value: { text: "Because of scattering." },
      markingStatus: kind === "practice" ? "PENDING" : "NOT_REQUIRED",
    },
  });
  return { id: form.id, responseId: response.id, answerId: answer.id };
}

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Campus Scope School", campuses: ["North", "South"] });
  north = t.campuses[0].id;
  south = t.campuses[1].id;
  people.admin = await member(t, Role.ADMIN, null, "School Admin");
  people.northAdmin = await member(t, Role.CAMPUS_ADMIN, north, "North Admin");
  people.southAdmin = await member(t, Role.CAMPUS_ADMIN, south, "South Admin");
  people.creator = await member(t, Role.TEACHING_STAFF, north, "Creator");
  people.colleague = await member(t, Role.TEACHING_STAFF, north, "Colleague");
  people.southTeacher = await member(t, Role.TEACHING_STAFF, south, "South Teacher");
  people.clerk = await member(t, Role.NON_TEACHING_STAFF, north, "Clerk");
  kid = await pupil(t, north, "JSS 1", "Kid");
  groupId = (await classArm(t, north, "JSS 1")).groupId;
  for (const kind of ["practice", "questionnaire", "paper"] as const) {
    forms[`${kind}:north`] = await seedForm(kind, north, people.creator.user.id);
    forms[`${kind}:wide`] = await seedForm(kind, null, people.admin.user.id);
  }
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const base = () => `/api/v1/schools/${t.code}/forms`;

type Case = {
  name: string;
  access: Access;
  kind: Kind;
  /// The call; `fresh` is a new form of the same scope for a call that changes the form for good (closing it).
  call: (who: Person, f: Seeded) => Promise<ApiResponse>;
  fresh?: boolean;
};

const CASES: Case[] = [
  { name: "GET forms/[id]", access: "view", kind: "practice", call: (p, f) => api(`${base()}/${f.id}`, { cookie: p.cookie }) },
  {
    name: "PATCH forms/[id]",
    access: "manage",
    kind: "practice",
    call: (p, f) => api(`${base()}/${f.id}`, { method: "PATCH", cookie: p.cookie, body: { title: "Renamed by a test" } }),
  },
  {
    name: "POST forms/[id]/close",
    access: "manage",
    kind: "practice",
    fresh: true,
    call: (p, f) => api(`${base()}/${f.id}/close`, { method: "POST", cookie: p.cookie, body: {} }),
  },
  {
    name: "POST forms/[id]/print",
    access: "manage",
    kind: "practice",
    call: (p, f) => api(`${base()}/${f.id}/print`, { method: "POST", cookie: p.cookie, body: {} }),
  },
  {
    name: "GET forms/[id]/analytics",
    access: "read",
    kind: "questionnaire",
    call: (p, f) => api(`${base()}/${f.id}/analytics`, { cookie: p.cookie }),
  },
  {
    name: "GET forms/[id]/marking-queue",
    access: "read",
    kind: "practice",
    call: (p, f) => api(`${base()}/${f.id}/marking-queue`, { cookie: p.cookie }),
  },
  {
    name: "GET forms/[id]/responses/[responseId]/marking",
    access: "read",
    kind: "practice",
    call: (p, f) => api(`${base()}/${f.id}/responses/${f.responseId}/marking`, { cookie: p.cookie }),
  },
  {
    name: "PATCH forms/[id]/responses/[responseId]/marking",
    access: "manage",
    kind: "practice",
    call: (p, f) =>
      api(`${base()}/${f.id}/responses/${f.responseId}/marking`, {
        method: "PATCH",
        cookie: p.cookie,
        body: { answerId: f.answerId, score: 2 },
      }),
  },
  {
    name: "GET forms/[id]/turn-ins",
    access: "read",
    kind: "paper",
    call: (p, f) => api(`${base()}/${f.id}/turn-ins`, { cookie: p.cookie }),
  },
  {
    name: "PATCH forms/[id]/turn-ins",
    access: "manage",
    kind: "paper",
    call: (p, f) =>
      api(`${base()}/${f.id}/turn-ins`, { method: "PATCH", cookie: p.cookie, body: { studentId: kid.student.id, status: "HANDED_IN" } }),
  },
  {
    name: "POST forms/[id]/turn-ins/batch",
    access: "manage",
    kind: "paper",
    call: (p, f) =>
      api(`${base()}/${f.id}/turn-ins/batch`, {
        method: "POST",
        cookie: p.cookie,
        body: { updates: [{ studentId: kid.student.id, status: "LATE" }] },
      }),
  },
  {
    name: "POST forms/[id]/turn-ins/sync",
    access: "manage",
    kind: "paper",
    call: (p, f) => api(`${base()}/${f.id}/turn-ins/sync`, { method: "POST", cookie: p.cookie, body: {} }),
  },
];

test.describe("one form, seven people: the campus rule for every route that names a form", () => {
  for (const c of CASES) {
    for (const scope of ["north", "wide"] as const) {
      test(`${c.name} on a ${scope === "north" ? "North campus" : "whole-school"} form`, async () => {
        const allowed = ALLOWED[`${c.access}:${scope}`];
        for (const who of WHO) {
          const target = c.fresh
            ? await seedForm(c.kind, scope === "north" ? north : null, scope === "north" ? people.creator.user.id : people.admin.user.id)
            : forms[`${c.kind}:${scope}`];
          const res = await c.call(people[who], target);
          if (allowed.includes(who)) {
            expect(res.status, `${who} should get through: ${res.text.slice(0, 160)}`).toBeLessThan(300);
          } else {
            // non-teaching staff are refused at the door of READ and MANAGE routes; everyone else is answered as if the form did not exist
            const expected = who === "clerk" && c.access !== "view" ? 403 : 404;
            expect(res.status, `${who} should be refused with ${expected}: ${res.text.slice(0, 160)}`).toBe(expected);
          }
        }
      });
    }
  }

  test("the request names the form in the URL: a response of ANOTHER form is not reached through it", async () => {
    // the creator of the North practice set may mark its answers, but the URL must still name the response's own form
    const own = forms["practice:north"];
    const other = forms["practice:wide"];
    const res = await api(`${base()}/${own.id}/responses/${other.responseId}/marking`, { cookie: people.creator.cookie });
    expect(res.status).toBe(404);
  });
});

test.describe("the lists follow the same rule", () => {
  const idsOf = (res: ApiResponse, key = "forms") => (res.json?.data?.[key] ?? []).map((f: { id: string }) => f.id);

  test("GET forms: the staff of a campus see their campus's forms and the whole school's, not another campus's", async () => {
    const north1 = forms["practice:north"].id;
    const wide1 = forms["practice:wide"].id;
    const asCreator = idsOf(await api(base(), { cookie: people.creator.cookie }));
    expect(asCreator).toContain(north1);
    expect(asCreator).toContain(wide1);
    const asSouth = idsOf(await api(base(), { cookie: people.southTeacher.cookie }));
    expect(asSouth).not.toContain(north1);
    expect(asSouth).toContain(wide1);
    const asAdmin = idsOf(await api(base(), { cookie: people.admin.cookie }));
    expect(asAdmin).toEqual(expect.arrayContaining([north1, wide1]));
  });

  test("GET forms/questionnaires and GET forms/paper-work: the same", async () => {
    for (const [path, kind] of [
      ["questionnaires", "questionnaire"],
      ["paper-work", "paper"],
    ] as const) {
      const n = forms[`${kind}:north`].id;
      const w = forms[`${kind}:wide`].id;
      const asCreator = idsOf(await api(`${base()}/${path}`, { cookie: people.creator.cookie }));
      expect(asCreator, path).toContain(n);
      expect(asCreator, path).toContain(w);
      const asSouth = idsOf(await api(`${base()}/${path}`, { cookie: people.southTeacher.cookie }));
      expect(asSouth, path).not.toContain(n);
      expect(asSouth, path).toContain(w);
    }
  });

  test("GET forms/marking-queue: only the answers of forms a person may READ", async () => {
    // the cases above mark these answers for good: put them back in the queue
    const ids = [forms["practice:north"], forms["practice:wide"]];
    await db.formResponse.updateMany({ where: { id: { in: ids.map((f) => f.responseId!) } }, data: { markingStatus: "PENDING" } });
    await db.formAnswer.updateMany({ where: { id: { in: ids.map((f) => f.answerId!) } }, data: { markingStatus: "PENDING" } });
    const queue = async (who: Who) => idsOf(await api(`${base()}/marking-queue`, { cookie: people[who].cookie }), "queue");
    const mine = forms["practice:north"].responseId!;
    const wideResponse = forms["practice:wide"].responseId!;
    expect(await queue("creator")).toContain(mine);
    expect(await queue("northAdmin")).toContain(mine);
    expect(await queue("colleague")).not.toContain(mine);
    expect(await queue("southTeacher")).not.toContain(mine);
    expect(await queue("southAdmin")).not.toContain(mine);
    const everything = await queue("admin");
    expect(everything).toEqual(expect.arrayContaining([mine, wideResponse]));
    expect(await queue("creator")).not.toContain(wideResponse);
    expect(await queue("northAdmin")).not.toContain(wideResponse);
  });
});
