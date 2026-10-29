import "../support/env";
import { test, expect } from "@playwright/test";
import { holdsNul } from "@/lib/api/no-nul";

// PostgreSQL cannot store a NUL character in text or JSON, so a request that holds one is refused before any handler runs (lib/api/no-nul.ts). This is the
// scan: what counts as holding one, and what must never be mistaken for one.

const NUL = String.fromCharCode(0);

test.describe("holdsNul", () => {
  test("a string with a NUL anywhere in it: first, middle, last, alone, repeated", () => {
    for (const value of [`${NUL}a`, `a${NUL}b`, `a${NUL}`, NUL, `${NUL}${NUL}`, `name${NUL}`])
      expect(holdsNul(value), JSON.stringify(value)).toBe(true);
  });

  test("everything else is clean: other control characters, invisible characters, the text of an escape, emoji, empty, non-strings", () => {
    const literalEscape = ["\\", "u0000"].join(""); // six characters: a backslash, a u and four zeros. It is text, not a NUL
    const clean: unknown[] = [
      "",
      "plain",
      String.fromCharCode(1),
      String.fromCharCode(8),
      String.fromCharCode(31),
      String.fromCharCode(0x200b),
      String.fromCharCode(0x2028),
      literalEscape,
      "Núñez \u{1f600}",
      0,
      1.5,
      true,
      false,
      null,
      undefined,
      [],
      {},
      [1, "a", null, { x: [true] }],
    ];
    for (const value of clean) expect(holdsNul(value), JSON.stringify(value)).toBe(false);
  });

  test("a NUL inside an array, an object's value, an object's KEY, and nested to any depth", () => {
    expect(holdsNul([1, 2, `a${NUL}`])).toBe(true);
    expect(holdsNul({ name: `a${NUL}b` })).toBe(true);
    expect(holdsNul({ [`na${NUL}me`]: "x" })).toBe(true);
    expect(holdsNul({ a: [{ b: { c: [`${NUL}`] } }] })).toBe(true);
    expect(holdsNul({ a: [{ b: { c: ["fine"] } }] })).toBe(false);
  });

  test("the query string's shape: a key or any one of several values", () => {
    expect(holdsNul({ q: "a", status: ["live", `ar${NUL}chived`] })).toBe(true);
    expect(holdsNul({ [`q${NUL}`]: "a" })).toBe(true);
    expect(holdsNul({ q: "a", status: ["live", "archived"] })).toBe(false);
  });

  test("a body a megabyte deep and a very wide one are scanned without running out of stack", () => {
    // a million brackets of nesting built from the inside out (a recursive walk would overflow long before)
    let deep: unknown = "end";
    for (let i = 0; i < 1_000_000; i++) deep = [deep];
    expect(holdsNul(deep)).toBe(false);
    let deepWithNul: unknown = `end${NUL}`;
    for (let i = 0; i < 1_000_000; i++) deepWithNul = { k: deepWithNul };
    expect(holdsNul(deepWithNul)).toBe(true);

    const wide = Array.from({ length: 1_000_000 }, (_, i) => `v${i}`);
    expect(holdsNul(wide)).toBe(false);
    wide[999_999] = `v${NUL}`;
    expect(holdsNul(wide)).toBe(true);
  });
});
