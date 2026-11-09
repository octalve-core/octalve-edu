import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The promotion and results screens run in the browser, so they must not import a server module: a value import from `@prisma/client` brings the Prisma runtime into the page, which the page's
// Content-Security-Policy refuses (it evaluates code at load) - the bug that every finance page once reported. A TYPE import is erased and is fine. Source-level: no server, no database.

const DIRS = [join("src", "components", "academics", "promotion"), join("src", "components", "results")];
const SERVER_ONLY = [
  /^import (?!type )[^;]*from "@prisma\/client"/m,
  /from "@\/lib\/(promotion\/(rules|service|http|validation)|results\/(service|sheet|rules|http|approver[\w-]*|ranking)|db)"/,
  /from "node:/,
  /from "@\/lib\/tenant\//,
];

test("no promotion or results component imports a server module", () => {
  const offenders: string[] = [];
  let checked = 0;
  for (const dir of DIRS) {
    for (const file of readdirSync(join(process.cwd(), dir)).filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))) {
      const source = readFileSync(join(process.cwd(), dir, file), "utf8");
      if (file.endsWith(".tsx") && !source.startsWith('"use client"')) continue; // a server component may import what it likes
      checked++;
      for (const pattern of SERVER_ONLY) if (pattern.test(source)) offenders.push(`${dir}/${file}: ${pattern}`);
    }
  }
  expect(checked).toBeGreaterThan(6);
  expect(offenders).toEqual([]);
});

test("the pure session rules the promotion panel uses import nothing", () => {
  const source = readFileSync(join(process.cwd(), "src", "lib", "promotion", "choices.ts"), "utf8");
  expect(source).not.toMatch(/^import /m);
});
