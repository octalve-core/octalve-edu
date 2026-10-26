import "../support/env";
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Every GET handler of a school declares which AREA of the school it belongs to (task 0011 slice C, ADR 0017). The area only matters inside a platform
// administrator's support view - read-only, limited to what the school granted - but a route that says nothing is unreachable from there, so the choice has
// to be made on purpose: a new school GET route either declares `area: "<one of the five>"` or goes on the list below WITH the reason it must stay out of
// reach of support. Source-level: no server, no database. It finds a forgotten declaration; the API specs prove the refusal.

const SCHOOL_ROOT = join(process.cwd(), "src", "app", "api", "v1", "schools", "[code]");
const AREAS = ["settings", "academics", "people", "attendance", "results"];

/// "path under schools/[code]" -> why support must NOT reach it.
const OUT_OF_REACH: Record<string, string> = {
  "finance/fee-structures/route.ts": "finance is not a grantable area (ADR 0017)",
  "finance/invoices/route.ts": "finance is not a grantable area (ADR 0017)",
  "finance/invoices/[id]/route.ts": "finance is not a grantable area (ADR 0017)",
  "finance/payments/[ref]/status/route.ts": "finance is not a grantable area (ADR 0017)",
  "announcements/route.ts": "not a grantable area: notices are the school's own words to its families",
  "announcements/[id]/route.ts": "not a grantable area: notices are the school's own words to its families",
  "support-grants/activity/route.ts": "the school's own record of who looked: a support view must never read it",
  "support-grants/route.ts": "the school's own control over who may look: a support view must never read or change it",
  "people/students/export/route.ts": "a bulk download of every student's details is an export, not a view",
  "communication/dispatches/route.ts": "not a grantable area: messages are the school's own communications to its families",
  "communication/templates/[id]/route.ts": "not a grantable area: message templates are the school's own words",
  "communication/templates/route.ts": "not a grantable area: message templates are the school's own words",
  "question-bank/items/[id]/route.ts": "not a grantable area: the question bank is the school's own teaching material and its review, which a support view must not read",
  "question-bank/items/route.ts": "not a grantable area: the question bank is the school's own teaching material and its review, which a support view must not read",
  "question-bank/review-queue/route.ts": "not a grantable area: the question bank is the school's own teaching material and its review, which a support view must not read",
  "question-bank/reviewers/route.ts": "not a grantable area: the question bank is the school's own teaching material and its review, which a support view must not read",
  "question-bank/settings/route.ts": "not a grantable area: the question bank is the school's own teaching material and its review, which a support view must not read",
};

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

test("every school GET route declares its support area, or is on the out-of-reach list with a reason", () => {
  const problems: string[] = [];
  for (const file of routes(SCHOOL_ROOT)) {
    const rel = relative(SCHOOL_ROOT, file);
    const source = readFileSync(file, "utf8");
    const start = source.indexOf("export const GET");
    if (start < 0) continue;
    const next = source.indexOf("export const", start + 5);
    const block = source.slice(start, next < 0 ? undefined : next);
    const declared = /area:\s*"([a-z]+)"/.exec(block)?.[1];
    if (rel in OUT_OF_REACH) {
      if (declared) problems.push(`${rel}: is on the out-of-reach list but declares area "${declared}"`);
    } else if (!declared) {
      problems.push(`${rel}: GET declares no area (add area: "…" or list it as out of reach with the reason)`);
    } else if (!AREAS.includes(declared)) {
      problems.push(`${rel}: area "${declared}" is not one of ${AREAS.join(", ")}`);
    }
  }
  expect(problems).toEqual([]);
});

test("a state-changing handler never declares an area: support is read-only", () => {
  const problems: string[] = [];
  for (const file of routes(SCHOOL_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const start = source.indexOf(`export const ${method}`);
      if (start < 0) continue;
      const next = source.indexOf("export const", start + 5);
      if (/area:\s*"/.test(source.slice(start, next < 0 ? undefined : next)))
        problems.push(`${relative(SCHOOL_ROOT, file)}: ${method} declares an area`);
    }
  }
  expect(problems).toEqual([]);
});
