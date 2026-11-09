import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A component that runs in the browser must not import a server module. The finance components once imported `formatNaira` from lib/finance/rules, which brings in Node's crypto and the Prisma
// runtime; that runtime evaluates code at load, the page's Content-Security-Policy refuses it, and every page that mounted one of them reported a violation. Source-level: no server, no
// database.

const DIR = join(process.cwd(), "src", "components", "finance");
const SERVER_ONLY = [
  /from "@prisma\/client"/,
  /from "@\/lib\/finance\/(rules|service|part-payment|part-payment-service|http)"/,
  /from "@\/lib\/db"/,
  /from "node:/,
  /from "@\/lib\/tenant\//,
];

test("no finance component imports a server module", () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith(".tsx"));
  expect(files.length).toBeGreaterThan(3);
  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(DIR, file), "utf8");
    if (!source.startsWith('"use client"')) continue;
    for (const pattern of SERVER_ONLY) if (pattern.test(source)) offenders.push(`${file}: ${pattern}`);
  }
  expect(offenders).toEqual([]);
});
