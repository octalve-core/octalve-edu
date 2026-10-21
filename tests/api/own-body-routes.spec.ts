import "../support/env";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { NUL_MESSAGE } from "@/lib/api/no-nul";

// The routes that read their own request body (sign-in, two-step verification, passwords, email change, invitations, profile, ...) read it through readJsonBody()
// (lib/api/validate.ts), the one place a body is read and parsed: no further than 1 MiB (413), a body that is not JSON is 400 INVALID_BODY, a NUL character in a key or a
// value is 400 VALIDATION (PostgreSQL cannot store one). The routes are found by reading the route files, so a route that adopts the reader later is held to the rule without
// a line here (tests/unit/route-body-guard.spec.ts fails on a route that reads its body any other way). The first-run wizard, which only exists on the solo server, is in
// setup.spec.ts; the payment webhook, which needs the raw text for its signature, and the student restore route, whose body is optional, are at the end of this file.

const NUL = String.fromCharCode(0);
const MIB = 1024 * 1024;
const API_ROOT = path.join(process.cwd(), "src", "app", "api", "v1");
/// The wizard answers 404 on the multi-school server (setup.spec.ts covers it on the solo one).
const SOLO_ONLY = new Set(["setup"]);

type OwnBodyRoute = { rel: string; method: string };

function ownBodyRoutes(dir = API_ROOT): OwnBodyRoute[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ownBodyRoutes(full);
    if (entry.name !== "route.ts") return [];
    const source = fs.readFileSync(full, "utf8");
    if (!source.includes("readJsonBody(")) return [];
    const rel = path.relative(API_ROOT, dir).split(path.sep).join("/");
    if (SOLO_ONLY.has(rel)) return [];
    return [...new Set([...source.matchAll(/^export (?:const|async function) (POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]))].map(
      (method) => ({
        rel,
        method,
      }),
    );
  });
}
const routes = ownBodyRoutes();

let school: TestTenant;
let cookie: string;

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: "Own Body School" });
  const admin = await createUser({ name: "Ada Admin" });
  await addMembership(admin.id, school.id, Role.ADMIN);
  const login = await loginAs(admin, { baseUrl: SAAS_URL });
  expect(login.status).toBe(200);
  cookie = cookieHeader(login.token!);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const send = (route: OwnBodyRoute, opts: { body?: unknown; rawBody?: string }) =>
  api(`/api/v1/${route.rel}`, { method: route.method, baseUrl: SAAS_URL, cookie, ...opts });

test.describe("every route that reads its own body", () => {
  test("the sweep finds the routes (so it cannot pass by looking at none)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(15);
    expect(routes.map((r) => r.rel)).toEqual(
      expect.arrayContaining(["auth/login", "auth/change-password", "invitations/accept", "account/profile"]),
    );
  });

  for (const route of routes) {
    test.describe(`${route.method} ${route.rel}`, () => {
      test("a body over the cap is 413 PAYLOAD_TOO_LARGE, before anything is looked at", async () => {
        const res = await send(route, { rawBody: JSON.stringify({ pad: "x".repeat(MIB + 10) }) });
        expect(res.status, res.text.slice(0, 200)).toBe(413);
        expect(res.json.error.code).toBe("PAYLOAD_TOO_LARGE");
      });

      test("a NUL character in a value is 400 VALIDATION with the one message", async () => {
        const res = await send(route, { body: { probe: `a${NUL}b` } });
        expect(res.status, res.text.slice(0, 200)).toBe(400);
        expect(res.json.error.code).toBe("VALIDATION");
        expect(res.json.error.details).toEqual([{ path: "body", message: NUL_MESSAGE }]);
      });

      test("a NUL character in a key, nested, is refused the same way", async () => {
        const res = await send(route, { body: { outer: [{ [`k${NUL}`]: 1 }] } });
        expect(res.status, res.text.slice(0, 200)).toBe(400);
        expect(res.json.error.code).toBe("VALIDATION");
      });

      test("a body that is not JSON, and an empty one, are 400 INVALID_BODY", async () => {
        for (const rawBody of ["{nope", ""]) {
          const res = await send(route, { rawBody });
          expect(res.status, `${JSON.stringify(rawBody)}: ${res.text.slice(0, 200)}`).toBe(400);
          expect(res.json.error.code).toBe("INVALID_BODY");
        }
      });

      test("control: a small body that is JSON reaches the route's own check (never the reader's refusals, never a 5xx)", async () => {
        const res = await send(route, { body: { probe: "a" } });
        expect(res.status, res.text.slice(0, 200)).toBeLessThan(500);
        expect(["PAYLOAD_TOO_LARGE", "INVALID_BODY"]).not.toContain(res.json?.error?.code);
        expect(res.json?.error?.details).not.toEqual([{ path: "body", message: NUL_MESSAGE }]);
      });
    });
  }
});

test.describe("the payment webhook (its signature is over the exact bytes, so it reads the raw text)", () => {
  test("a body over its 256 KiB cap is 413, by its length", async () => {
    const res = await api("/api/v1/webhooks/paystack", { baseUrl: SAAS_URL, origin: null, rawBody: "x".repeat(300 * 1024) });
    expect(res.status).toBe(413);
    expect(res.json).toEqual({ received: false, error: "Payload too large." });
  });

  test("control: a small unsigned body is judged on its signature (401), not on its size", async () => {
    const res = await api("/api/v1/webhooks/paystack", {
      baseUrl: SAAS_URL,
      origin: null,
      rawBody: JSON.stringify({ event: "charge.success" }),
    });
    expect(res.status).toBe(401);
  });
});

test.describe("the student restore route (its body is optional)", () => {
  let studentId: string;
  test.beforeAll(async () => {
    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        firstName: "Rita",
        lastName: "Restore",
        dateOfBirth: new Date("2012-04-04"),
        admissionNo: `OB-${Date.now()}`,
      },
    });
    studentId = student.id;
  });
  const restore = (rawBody?: string) =>
    api(`/api/v1/schools/${school.code}/people/students/${studentId}/restore`, {
      method: "POST",
      baseUrl: SAAS_URL,
      cookie,
      ...(rawBody === undefined ? {} : { rawBody }),
    });

  test("a body over the cap is 413", async () => {
    const res = await restore(JSON.stringify({ allowDuplicate: false, pad: "x".repeat(MIB + 10) }));
    expect(res.status, res.text.slice(0, 200)).toBe(413);
    expect(res.json.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("control: no body, an empty body and a body that is not JSON all keep the default and succeed (the student is not archived: nothing changes)", async () => {
    for (const rawBody of [undefined, "", "{nope", JSON.stringify({ allowDuplicate: true })]) {
      const res = await restore(rawBody);
      expect(res.status, `${JSON.stringify(rawBody)}: ${res.text.slice(0, 200)}`).toBe(200);
      expect(res.json.data.changed).toBe(false);
    }
  });
});
