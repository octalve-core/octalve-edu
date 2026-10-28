import "../support/env";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { guardianOf, member, pupil, type Person } from "../support/qbank-world";

// The door of every route added by the question bank and forms parity build (task 0024 slices 3 to 10): for each route and method, who is let through and who is turned away. The
// behaviour behind each door has its own specs (portal-practice, question-bank-printing, forms-public-questionnaire, questionnaire-anonymity, and the item specs of the earlier
// slices); this one fails when a route is added, or its roles are changed, without a decision about who may call it:
//   - nobody signed out reaches anything (401);
//   - a person of ANOTHER school reaches nothing (the same 403 as any person who may not);
//   - the kinds of route are the kinds the design names: TEACHING (administrators and teaching staff: building, closing, marking and printing forms, and reading their results),
//     STAFF (the same and non-teaching staff, who review the bank: the list of forms, the print log, the reports), PUPIL (the pupil's portal), PUPIL OR GUARDIAN (the history, which a guardian may read as the school allows)
//     and ADMINS (the question bank's reviewers and switches).
// "Let through" means the refusal at the door did not happen: the request then meets the handler, which answers a missing record, a bad body or a pupil without a record
// as it likes (400 or 404). The public survey routes are not behind a sign-in and are held by forms-public-questionnaire.spec.ts.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

type Kind = "teaching" | "staff" | "pupil" | "pupilOrGuardian" | "admins";
const ID = "cl0000000000000000000000x";

/// "METHOD path under /api/v1/schools/[code]" -> the kind of route it is.
const ROUTES: Record<string, Kind> = {
  // forms: building and reading
  "GET forms": "staff",
  "POST forms": "teaching",
  "GET forms/[id]": "staff",
  "PATCH forms/[id]": "teaching",
  "POST forms/[id]/close": "teaching",
  "POST forms/[id]/print": "teaching",
  "GET forms/[id]/analytics": "teaching",
  "GET forms/marking-queue": "teaching",
  "GET forms/[id]/marking-queue": "teaching",
  "GET forms/[id]/responses/[responseId]/marking": "teaching",
  "PATCH forms/[id]/responses/[responseId]/marking": "teaching",
  "GET forms/paper-work": "teaching",
  "POST forms/paper-work": "teaching",
  "GET forms/[id]/turn-ins": "teaching",
  "PATCH forms/[id]/turn-ins": "teaching",
  "POST forms/[id]/turn-ins/batch": "teaching",
  "POST forms/[id]/turn-ins/sync": "teaching",
  "GET forms/questionnaires": "teaching",
  "POST forms/questionnaires": "teaching",
  // the pupil's portal
  "GET portal/forms/paper-work": "pupil",
  "GET portal/forms/paper-work/[id]": "pupil",
  "POST portal/forms/paper-work/[id]/request-marking": "pupil",
  "GET portal/forms/practice-sets": "pupil",
  "GET portal/forms/practice-sets/[id]": "pupil",
  "POST portal/forms/practice-sets/[id]/start": "pupil",
  "POST portal/forms/practice-sets/[id]/submit": "pupil",
  "GET portal/forms/practice-sets/responses/[responseId]": "pupil",
  "GET portal/forms/practice-sets/responses/[responseId]/print": "pupil",
  "GET portal/forms/questionnaires": "pupil",
  "GET portal/forms/questionnaires/[id]": "pupil",
  "POST portal/forms/questionnaires/[id]/submit": "pupil",
  "GET portal/practice/options": "pupil",
  "POST portal/practice/sessions": "pupil",
  "POST portal/practice/sessions/[id]/answers": "pupil",
  "POST portal/practice/sessions/[id]/finish": "pupil",
  "GET portal/practice/sessions/[id]/print": "pupil",
  "GET portal/practice/reports": "pupil",
  "POST portal/practice/reports": "pupil",
  "GET portal/practice/history": "pupilOrGuardian",
  "PATCH portal/practice/history": "pupilOrGuardian",
  // the question bank: printing, reports, offers back
  "POST question-bank/print": "teaching",
  "GET question-bank/print-logs": "staff",
  "GET question-bank/reports": "staff",
  "PATCH question-bank/reports/[id]": "staff",
  "POST question-bank/items/[id]/report": "staff",
  "POST question-bank/items/offer-back": "staff",
  // the question bank's reviewers and switches
  "GET question-bank/reviewers": "admins",
  "POST question-bank/reviewers": "admins",
  "GET question-bank/settings": "admins",
  "PUT question-bank/settings": "admins",
};

const ALLOWED: Record<Kind, Role[]> = {
  teaching: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  staff: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF],
  pupil: [Role.STUDENT, Role.ADMIN],
  pupilOrGuardian: [Role.STUDENT, Role.PARENT, Role.ADMIN],
  admins: [Role.ADMIN, Role.CAMPUS_ADMIN],
};

let a: TestTenant;
const people = {} as Record<Role, Person>;
let outsider: Person;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Gates", campuses: ["North"] });
  const b = await createTenant({ name: "Beta Gates", campuses: ["Elsewhere"] });
  const north = a.campuses[0].id;
  people[Role.ADMIN] = await member(a, Role.ADMIN, null, "Admin");
  people[Role.CAMPUS_ADMIN] = await member(a, Role.CAMPUS_ADMIN, north, "Campus Admin");
  people[Role.TEACHING_STAFF] = await member(a, Role.TEACHING_STAFF, north, "Teacher");
  people[Role.NON_TEACHING_STAFF] = await member(a, Role.NON_TEACHING_STAFF, north, "Clerk");
  const kid = await pupil(a, north, "JSS 1", "Pupil");
  people[Role.STUDENT] = kid;
  people[Role.PARENT] = await guardianOf(a, [kid.student.id]);
  outsider = await member(b, Role.ADMIN, null, "Outsider Admin"); // an administrator, but of another school
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const pathOf = (route: string) => `/api/v1/schools/${a.code}/${route.split(" ")[1].replace(/\[[A-Za-z]+\]/g, ID)}`;
const methodOf = (route: string) => route.split(" ")[0];
const call = (route: string, who: Person | null) =>
  api(pathOf(route), { method: methodOf(route), cookie: who?.cookie, ...(methodOf(route) === "GET" ? {} : { body: {} }) });

/// The door did not turn the caller away: not "sign in", and not the door's own refusal (a handler may still answer 403 for its own reasons, with another code).
const through = (res: { status: number; json: { error?: { code?: string } } | null }) =>
  res.status !== 401 && !(res.status === 403 && res.json?.error?.code === "FORBIDDEN");

test.describe("the routes are all accounted for", () => {
  test("every route under forms, portal and the printing and report routes of the question bank is in the table, and every row is a route", () => {
    const root = join(process.cwd(), "src", "app", "api", "v1", "schools", "[code]");
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === "route.ts") {
          const rel = relative(root, dir).split("\\").join("/");
          for (const m of readFileSync(full, "utf8").matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)) found.add(`${m[1]} ${rel}`);
        }
      }
    };
    walk(root);
    const own = (key: string) => {
      const path = key.split(" ")[1];
      if (path.startsWith("forms/public/")) return false; // held by forms-public-questionnaire.spec.ts
      return (
        path.startsWith("forms") ||
        path.startsWith("portal/") ||
        path.startsWith("question-bank/print") ||
        path.startsWith("question-bank/reports") ||
        path === "question-bank/items/[id]/report" ||
        path === "question-bank/items/offer-back" ||
        path === "question-bank/reviewers" ||
        path === "question-bank/settings"
      );
    };
    const expected = [...found].filter(own).sort();
    expect(Object.keys(ROUTES).sort()).toEqual(expected);
  });
});

test.describe("who is let through", () => {
  for (const [route, kind] of Object.entries(ROUTES)) {
    test(`${route} (${kind})`, async () => {
      expect((await call(route, null)).status).toBe(401);
      for (const role of [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT]) {
        const res = await call(route, people[role]);
        if (ALLOWED[kind].includes(role))
          expect(through(res), `${role} should be let through, got ${res.status} ${res.text.slice(0, 120)}`).toBe(true);
        else expect(res.status, `${role} should be turned away`).toBe(403);
      }
      const away = await call(route, outsider);
      expect(away.status, "a person of another school should be turned away").toBe(403);
    });
  }
});
