import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

// No source file holds a literal invisible, direction-changing, control or private-use character. Such a character is invisible in an editor and in a review, and a bidi control
// (U+202A to U+202E, U+2066 to U+2069) can make code READ differently from how it runs ("Trojan Source"). Where a string or a regular expression needs one (a name check that
// refuses direction overrides, a test that feeds a zero-width space to a parser) it is written as an escape, \u202e, which means exactly the same and can be seen.
//
// This was found when the same regular expression, with four literal bidi controls in it, turned out to be in production code in both repos: an editing tool had turned the
// escapes someone typed into the characters themselves. The check is here so it cannot come back unnoticed.

const SOURCE = /\.(ts|tsx|js|mjs|cjs|css|json|prisma|sql|ya?ml)$/;
const SKIP = /(^|\/)(node_modules|\.next|\.git|test-results|playwright-report|\.tmp)\//;
// Everything that renders as nothing or as a direction change: format characters (zero-width, bidi, byte-order mark, soft hyphen), controls other than tab, new line and
// carriage return, private use, unassigned, and the line and paragraph separators.
const INVISIBLE = /[\p{Cf}\p{Cc}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;
const ALLOWED = new Set(["\t", "\n", "\r"]);

/// Every line of `text` that holds such a character, with the code points on it.
export function findInvisible(text: string): { line: number; codePoints: string[] }[] {
  const found: { line: number; codePoints: string[] }[] = [];
  text.split("\n").forEach((line, i) => {
    const codePoints = [...line]
      .filter((ch) => !ALLOWED.has(ch) && INVISIBLE.test(ch))
      .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
    if (codePoints.length > 0) found.push({ line: i + 1, codePoints });
  });
  return found;
}

function trackedFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean);
  } catch {
    // no git (an exported tree): walk the folders that hold code
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (SKIP.test(`${path}/`)) continue;
        if (statSync(path).isDirectory()) walk(path);
        else out.push(path);
      }
    };
    for (const dir of ["src", "tests", "scripts", "prisma"]) walk(dir);
    return out;
  }
}

test("the detector finds each kind of character it is for, and nothing in ordinary text", () => {
  // built from code points so that this file holds none of them itself
  const sample = (...codePoints: number[]) => `a${String.fromCodePoint(...codePoints)}b`;
  for (const cp of [
    0x202e, 0x202a, 0x2066, 0x2069, 0x200b, 0x200d, 0x200e, 0xfeff, 0x00ad, 0x2060, 0x0000, 0x0007, 0x007f, 0x0085, 0xe000, 0x2028, 0x2029,
    0x0378, 0xe0001,
  ])
    expect(findInvisible(sample(cp)), `U+${cp.toString(16)}`).toHaveLength(1);
  expect(findInvisible("plain text\twith a tab\r\nand lines\nالعربية é 😀  ")).toEqual([]);
  expect(findInvisible(`one\ntwo${String.fromCodePoint(0x202e)}\nthree`)).toEqual([{ line: 2, codePoints: ["U+202E"] }]);
});

test("no tracked source file contains a literal invisible, direction-changing, control or private-use character (write it as an escape)", () => {
  const problems: string[] = [];
  let scanned = 0;
  for (const file of trackedFiles()) {
    if (!SOURCE.test(file) || SKIP.test(file) || file.endsWith("pnpm-lock.yaml")) continue;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    scanned++;
    for (const hit of findInvisible(text)) problems.push(`${file}:${hit.line} ${hit.codePoints.join(" ")}`);
  }
  expect(scanned).toBeGreaterThan(100); // it really looked at the code
  expect(problems, "use \\uXXXX in a string or regular expression instead of the character").toEqual([]);
});
