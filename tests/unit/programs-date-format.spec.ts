import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Every date and time the Programs screens print has one shape, from `when()` and `dayText()` in components/programs/model.ts (en-GB: "17 Nov 2026, 14:24"). A bare toLocaleString() prints in the
// reader's browser locale instead: month before day for en-US ("11/17/2026, 2:24:00 PM"), seconds included. The people history did this (task 0077); this reads the source so no Programs screen can.

const DIR = join(process.cwd(), "src", "components", "programs");
const FILES = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name));

/// The lines of `text` that format a date with no locale: toLocaleString, toLocaleDateString or toLocaleTimeString with nothing between the brackets.
export function bareLocaleCalls(text: string): number[] {
  return text.split("\n").flatMap((line, i) => (/\.toLocale(Date|Time)?String\(\s*\)/.test(line) ? [i + 1] : []));
}

test("the detector finds a date formatted with no locale and leaves one that names its locale", () => {
  expect(bareLocaleCalls("a\nconst x = new Date(r.at).toLocaleString();\nb")).toEqual([2]);
  expect(bareLocaleCalls("d.toLocaleDateString()")).toEqual([1]);
  expect(bareLocaleCalls("d.toLocaleTimeString( )")).toEqual([1]);
  expect(bareLocaleCalls('d.toLocaleDateString("en-GB", { day: "numeric" })')).toEqual([]);
  expect(bareLocaleCalls("n.toFixed(2)")).toEqual([]);
});

test("no Programs component formats a date in the reader's own locale", () => {
  expect(FILES.length).toBeGreaterThan(10);
  const found = FILES.flatMap((name) => bareLocaleCalls(readFileSync(join(DIR, name), "utf8")).map((line) => `${name}:${line}`));
  expect(found, "use when() or dayText() from ./model").toEqual([]);
});
