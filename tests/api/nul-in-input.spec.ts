import "../support/env";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, enableMfa, removeCreatedTenants, seedInstance } from "../support/db";
import { api, cookieHeader } from "../support/http";
import { createSession } from "@/lib/auth/session";
import { NUL_MESSAGE } from "@/lib/api/no-nul";

// A NUL character in a request (lib/api/no-nul.ts). PostgreSQL cannot store one, so a route that passed it on answered 500. It is refused before any handler runs - a 404 for a path
// segment, a 400 for the query string and for a JSON body - on EVERY route behind withAuth. The routes are found by reading the route files, so a route added later is held to the
// rule without a line here. The routes that read their own body (sign-in, passwords, two-step verification, invitations, setup, profile) are not behind the central scan: each is
// tried with a NUL in the fields it reads and must answer something other than a 5xx.

const NUL = String.fromCharCode(0);
const API_ROOT = path.join(process.cwd(), "src", "app", "api", "v1");
/// Routes that would end the session the sweeps use, or open a support view, if a request got through to them.
const SKIPPED = new Set(["auth/logout", "auth/sessions/revoke-others", "platform/support/open", "platform/support/close"]);
const PLACEHOLDER_ID = "cabcdefghijklmnopqrstuvwx";

type RouteFile = { rel: string; methods: string[]; guarded: boolean };

function routeFiles(dir = API_ROOT): RouteFile[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    if (entry.name !== "route.ts") return [];
    const source = fs.readFileSync(full, "utf8");
    const methods = [...new Set([...source.matchAll(/^export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]))];
    return [{ rel: path.relative(API_ROOT, dir).split(path.sep).join("/"), methods, guarded: source.includes("withAuth(") }];
  });
}
/// The routes behind withAuth: what the central scan covers.
const guardedRoutes = routeFiles().filter((route) => route.guarded && !SKIPPED.has(route.rel));

let a: { id: string; code: string };
let admin: string;
let platform: string;
const fill = (rel: string, segment: string) => rel.replace("[code]", a.code).replace(/\[[^\]]+\]/g, segment);
const cookieFor = (rel: string) => (rel.startsWith("platform/") ? platform : admin);
/// A GET has no body; any other method gets an empty one (the scan runs before the handler reads it).
const call = (rel: string, method: string, url: string) =>
  api(url, { method, baseUrl: SAAS_URL, cookie: cookieFor(rel), ...(method === "GET" ? {} : { body: {} }) });
const school = (rest: string) => `/api/v1/schools/${a.code}/${rest}`;

test.beforeAll(async () => {
  await seedInstance();
  const school = await createTenant({ name: "Nul School", campuses: ["Main"] });
  a = { id: school.id, code: school.code };
  const adminUser = await createUser({ name: "Ada Admin" });
  await addMembership(adminUser.id, school.id, Role.ADMIN);
  admin = cookieHeader((await createSession(adminUser.id)).token);
  const platformUser = await createUser({ name: "Plat Admin", platformAdmin: true });
  await enableMfa(platformUser.id);
  platform = cookieHeader((await createSession(platformUser.id)).token);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("every route behind withAuth", () => {
  test("the sweep finds the routes (so it cannot pass by looking at none)", () => {
    expect(guardedRoutes.length).toBeGreaterThan(80);
    expect(guardedRoutes.filter((route) => /\[(?!code\])/.test(route.rel)).length).toBeGreaterThan(40);
  });

  test("a NUL in a path segment is 404 NOT_FOUND, whatever the method", async () => {
    test.setTimeout(300_000);
    const wrong: string[] = [];
    let tried = 0;
    for (const route of guardedRoutes.filter((r) => /\[(?!code\])/.test(r.rel))) {
      for (const method of route.methods) {
        const url = `/api/v1/${fill(route.rel, "a%00b")}`;
        const res = await call(route.rel, method, url);
        tried++;
        if (res.status !== 404 || res.json?.error?.code !== "NOT_FOUND") wrong.push(`${res.status} ${method} ${url}`);
      }
    }
    expect(tried).toBeGreaterThan(80);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  test("a NUL in the query string - a value, a key, one of several values - is 400 VALIDATION, whatever the method", async () => {
    test.setTimeout(300_000);
    const wrong: string[] = [];
    let tried = 0;
    for (const route of guardedRoutes) {
      for (const method of route.methods) {
        for (const query of ["q=a%00b", "q%00=1", "tag=ok&tag=x%00"]) {
          const url = `/api/v1/${fill(route.rel, PLACEHOLDER_ID)}?${query}`;
          const res = await call(route.rel, method, url);
          tried++;
          const details = res.json?.error?.details;
          if (res.status !== 400 || res.json?.error?.code !== "VALIDATION" || details?.[0]?.message !== NUL_MESSAGE)
            wrong.push(`${res.status} ${method} ${url}`);
        }
      }
    }
    expect(tried).toBeGreaterThan(300);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  test("other hostile values in a path segment (control characters, a line break, path tricks, SQL, 300 and 5000 characters) are never a 5xx", async () => {
    test.setTimeout(600_000);
    const hostile = ["%01", "%1f", "%7f", "a%0Ab", "..%2F..%2Fx", "'%20OR%201%3D1--", "x".repeat(300), "x".repeat(5000)];
    const problems: string[] = [];
    let tried = 0;
    for (const route of guardedRoutes.filter((r) => /\[(?!code\])/.test(r.rel))) {
      for (const junk of hostile) {
        for (const method of route.methods) {
          const res = await call(route.rel, method, `/api/v1/${fill(route.rel, junk)}`);
          tried++;
          if (res.status >= 500) problems.push(`${res.status} ${method} ${route.rel} [${junk.slice(0, 10)}]`);
        }
      }
    }
    expect(tried).toBeGreaterThan(500);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("signed out the answer is the usual 401, not a statement about the address", async () => {
    const res = await api(school(`lms/assignments/a%00b?q=a%00b`), { baseUrl: SAAS_URL });
    expect(res.status).toBe(401);
  });
});

test.describe("a JSON body", () => {
  const text = `a${NUL}b`;
  // Each body is complete and valid but for the NUL, so the NUL is the only reason to refuse it.
  const bodies: [string, string, string, Record<string, unknown>][] = [
    ["a notice's title", "POST", "announcements", { title: text, body: "x", targetRoles: [], status: "PUBLISHED", isPinned: false }],
    ["a notice's text", "POST", "announcements", { title: "t", body: text, targetRoles: [], status: "PUBLISHED", isPinned: false }],
    ["a subject's name", "POST", "academics/subjects", { name: text, code: "NUL1" }],
    ["a subject's code", "POST", "academics/subjects", { name: "Name", code: text }],
    ["a class group's name", "POST", "academics/class-groups", { name: text }],
    ["a campus's name", "POST", "campuses", { name: text }],
    ["the school's name", "PATCH", "settings", { name: text }],
    ["an invitation's address", "POST", "invitations", { email: `x${NUL}@example.test`, role: "TEACHING_STAFF" }],
    ["a student's first name", "POST", "people/students", { firstName: text, lastName: "L", dateOfBirth: "2015-01-01" }],
    [
      "a template's name",
      "POST",
      "communication/templates",
      { code: "CODE1", name: text, channel: "SMS", bodyTemplate: "b", variables: [] },
    ],
    ["a material's title", "POST", "lms/materials", { title: text, subjectId: PLACEHOLDER_ID, content: "c" }],
    ["a key of the body", "POST", "academics/subjects", { name: "Name", code: "NUL2", [`x${NUL}`]: 1 }],
    ["a value nested in the body", "POST", "academics/subjects", { name: "Name", code: "NUL3", extra: { deep: [text] } }],
  ];
  for (const [what, method, rest, body] of bodies) {
    test(`a NUL in ${what} is 400 VALIDATION`, async () => {
      const res = await api(school(rest), { method, baseUrl: SAAS_URL, cookie: admin, body });
      expect(res.status, res.text.slice(0, 200)).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION");
      expect(res.json.error.details).toEqual([{ path: "body", message: NUL_MESSAGE }]);
    });
  }

  test("what only looks like a NUL is stored as the text it is: the six characters of an escape, a tab, a line break", async () => {
    const literalEscape = ["\\", "u0000"].join("");
    const title = `Notice ${literalEscape}`;
    const body = "first line\n\tsecond line, indented";
    const made = await api(school("announcements"), {
      method: "POST",
      baseUrl: SAAS_URL,
      cookie: admin,
      body: { title, body, targetRoles: [], status: "PUBLISHED", isPinned: false },
    });
    expect(made.status, made.text.slice(0, 200)).toBe(201);
    const read = await api(school(`announcements/${made.json.data.id}`), { baseUrl: SAAS_URL, cookie: admin });
    expect(read.status).toBe(200);
    expect(read.json.data.title).toBe(title);
    expect(read.json.data.body).toBe(body);
  });

  test("a list asked for with ordinary query values still answers", async () => {
    const res = await api(school("people/students?q=ab&status=live"), { baseUrl: SAAS_URL, cookie: admin });
    expect(res.status).toBe(200);
  });
});

test.describe("the routes that are not behind withAuth", () => {
  test("a public address with a NUL in it is refused by its own check: 400, never a 5xx", async () => {
    for (const rel of ["verify/a%00b", "verify-certificate/a%00b"]) {
      const res = await api(`/api/v1/${rel}`, { baseUrl: SAAS_URL });
      expect(res.status, rel).toBe(400);
    }
  });

  test("the routes that read their own body answer something other than a 5xx for a NUL in the fields they read", async () => {
    const text = `a${NUL}b`;
    const email = `a${NUL}@example.test`;
    const password = "correct-horse-battery-9";
    const direct: [string, string, Record<string, unknown>][] = [
      ["PATCH", "account/profile", { name: text }],
      ["POST", "auth/login", { email, password: "x" }],
      ["POST", "auth/login", { email: "a@example.test", password: text }],
      ["POST", "auth/forgot-password", { email }],
      ["POST", "auth/reset-password", { token: text, password }],
      ["POST", "auth/change-password", { currentPassword: text, newPassword: password }],
      ["POST", "auth/email-change/request", { newEmail: email, password: "x" }],
      ["POST", "auth/email-change/confirm", { token: text }],
      ["POST", "auth/mfa/confirm", { code: text }],
      ["POST", "auth/mfa/disable", { password: text }],
      ["POST", "auth/mfa/recovery-codes", { password: text }],
      ["POST", "auth/sessions/revoke", { id: text }],
      ["POST", "invitations/accept", { token: text, name: "N", password }],
      ["POST", "invitations/accept", { token: "a".repeat(64), name: text, password }],
      ["POST", "invitations/preview", { token: text }],
    ];
    const wrong: string[] = [];
    for (const [method, rel, body] of direct) {
      const res = await api(`/api/v1/${rel}`, { method, baseUrl: SAAS_URL, cookie: admin, body });
      if (res.status >= 500) wrong.push(`${res.status} ${method} ${rel} ${JSON.stringify(body).slice(0, 80)}`);
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });
});
