import "../support/env";
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// A request body is read in ONE place: validate() for a route that declares a schema, readJsonBody() (lib/api/validate.ts) for a route that reads its own, and
// readBoundedText() (lib/api/read-body.ts) for a route that needs the raw text (the payment webhook: its signature is over the exact bytes). Reading it straight from
// the request (`req.json()`, `req.text()`, `req.formData()`, `req.arrayBuffer()`, `req.blob()`) buffers the whole of it with no cap, accepts a NUL character the database
// cannot store, and answers its own way to a body that is not JSON. Source-level: no server, no database.

const SRC = join(process.cwd(), "src");
/// The request, under every name it has in this code base.
const DIRECT = /\b(?:req|request|_req)\.(?:json|text|formData|arrayBuffer|blob)\s*\(/;
/// The files that ARE the readers, and what they may do.
const READERS = new Set(["lib/api/read-body.ts", "lib/api/validate.ts"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

test("no route or library reads a request body straight from the request", () => {
  const offenders: string[] = [];
  for (const file of sources(SRC)) {
    const rel = relative(SRC, file).split("\\").join("/");
    if (READERS.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (DIRECT.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*"))
          offenders.push(`${rel}:${index + 1}: ${line.trim().slice(0, 100)}`);
      });
  }
  expect(offenders, `read the body through readJsonBody() or readBoundedText():\n${offenders.join("\n")}`).toEqual([]);
});

test("the guard can see what it guards (so it cannot pass by looking at none)", () => {
  expect(DIRECT.test("body = await req.json();")).toBe(true);
  expect(DIRECT.test("const text = await _req.text().catch(() => '');")).toBe(true);
  expect(DIRECT.test("const form = await request.formData();")).toBe(true);
  expect(DIRECT.test("const read = await readJsonBody(req);")).toBe(false);
  expect(DIRECT.test("return res.json();")).toBe(false);
  const routes = sources(join(SRC, "app", "api")).filter((file) => file.endsWith("route.ts"));
  expect(routes.length).toBeGreaterThan(100);
  const readers = routes.filter((file) => readFileSync(file, "utf8").includes("readJsonBody("));
  expect(readers.length).toBeGreaterThanOrEqual(15);
});
