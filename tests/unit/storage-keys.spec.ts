import "../support/env";
import { test, expect } from "@playwright/test";
import { assertContentType, assertStorageKey, isStorageKey, InvalidStorageKeyError, StorageError } from "@/lib/storage";

// A storage key is one literal relative path of safe segments in every backend. These are the rules, and a property: any string the check accepts survives URL parsing unchanged
// (no traversal, no re-encoding), so a key built from user input can never climb out of its folder.

test("ordinary keys are accepted", () => {
  for (const key of [
    "a",
    "a1",
    "aleemaan/question-bank/cmgx1y2z30000abcd1234efgh",
    "octalve/tenant-1/question-bank/img_01.jpg",
    "A-B_c.d/e",
    "x".repeat(200),
    "a..b",
    "a.b.c",
  ]) {
    expect(isStorageKey(key), key).toBe(true);
    expect(assertStorageKey(key)).toBe(key);
  }
});

test("empty segments, dot segments, slashes at the ends, spaces, control characters, percent signs, non-ASCII and over 200 characters are refused", () => {
  for (const key of [
    "",
    "/",
    "/a",
    "a/",
    "a//b",
    ".",
    "..",
    "../x",
    "a/../b",
    "a/./b",
    "a/.hidden",
    ".hidden",
    "-lead",
    "_lead",
    "a b",
    "a\tb",
    "a\nb",
    "a\u0000",
    "\u0000",
    "a%2e%2e/b",
    "a%00",
    "a\\b",
    "é",
    "😀",
    "a?b",
    "a#b",
    "a:b",
    "x".repeat(201),
  ]) {
    expect(isStorageKey(key), JSON.stringify(key)).toBe(false);
    expect(() => assertStorageKey(key), JSON.stringify(key)).toThrow(InvalidStorageKeyError);
  }
  for (const odd of [undefined, null, 5, {}, [], ["a"], true]) {
    expect(isStorageKey(odd)).toBe(false);
    expect(() => assertStorageKey(odd)).toThrow(InvalidStorageKeyError);
  }
});

test("fuzz: every random string the check accepts survives URL parsing unchanged and has no dot segment; nothing throws", () => {
  let seed = 7;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const alphabet = "abcXYZ019-_./%\\ ?#:\u0000é😀\ud800~+=";
  const problems: string[] = [];
  let accepted = 0;
  for (let i = 0; i < 30_000; i++) {
    const length = 1 + Math.floor(next() * 14);
    let key = "";
    for (let j = 0; j < length; j++) key += alphabet[Math.floor(next() * alphabet.length)];
    let ok = false;
    try {
      ok = isStorageKey(key);
    } catch {
      problems.push(`threw on ${JSON.stringify(key)}`);
    }
    if (!ok) continue;
    accepted++;
    const path = new URL(`/${key}`, "https://bucket.example").pathname;
    if (path !== `/${key}`) problems.push(`changed by URL parsing: ${JSON.stringify(key)} -> ${path}`);
    if (key.split("/").some((s) => s === "" || s === "." || s === "..")) problems.push(`dot or empty segment: ${JSON.stringify(key)}`);
  }
  expect(accepted, "the fuzz must actually exercise accepted keys").toBeGreaterThan(300);
  expect(problems).toEqual([]);
});

// A content type is sent as a request header and stored with the object. It is a lower-case media type with no parameters, spaces or control characters, so a value taken from a
// request can never smuggle a second header (a CR or LF) into the signed request.
test("content types: a plain lower-case media type passes; parameters, upper case, spaces, control characters and anything not a type are refused", () => {
  for (const ok of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    "text/plain",
    "application/octet-stream",
    "application/vnd.api+json",
  ])
    expect(assertContentType(ok), ok).toBe(ok);
  for (const bad of [
    "",
    "image",
    "image/",
    "/png",
    "Image/Png",
    "image/PNG",
    "image/png; charset=utf-8",
    "image/png ",
    " image/png",
    "image/png\r\nX-Evil: 1",
    "image/png\nHost: evil.example",
    "image/png\u0000",
    "image/pn g",
    "image/png,image/gif",
    "image//png",
    "imagé/png",
    "image/" + "x".repeat(100),
    "*/*",
  ])
    expect(() => assertContentType(bad), JSON.stringify(bad)).toThrow(StorageError);
  for (const notAString of [undefined, null, 0, 1, true, {}, [], ["image/png"], Symbol.for("image/png")])
    expect(() => assertContentType(notAString)).toThrow(StorageError);
});

test("fuzz: mutated media types: whatever the content-type check accepts has no CR, LF, space, semicolon or comma; nothing but StorageError is ever thrown", () => {
  let seed = 11;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  // start from real types and break them in small ways: the near misses are where a guard is wrong
  const bases = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    "text/plain",
    "application/octet-stream",
    "application/vnd.api+json",
  ];
  const alphabet = "abcXYZ019/+.-;, \r\n\t\u0000é😀:=*";
  const problems: string[] = [];
  let accepted = 0;
  let refused = 0;
  for (let i = 0; i < 30_000; i++) {
    let candidate = pick(bases);
    for (let m = Math.floor(next() * 3); m > 0; m--) {
      const at = Math.floor(next() * (candidate.length + 1));
      const kind = next();
      if (kind < 0.4) candidate = candidate.slice(0, at) + pick([...alphabet]) + candidate.slice(at);
      else if (kind < 0.7) candidate = candidate.slice(0, at) + candidate.slice(at + 1);
      else candidate = candidate.slice(0, at) + pick([...alphabet]) + candidate.slice(at + 1);
    }
    try {
      assertContentType(candidate);
      accepted++;
      if (/[\r\n ;,\t\u0000]/.test(candidate) || candidate !== candidate.toLowerCase() || candidate.split("/").length !== 2)
        problems.push(`accepted ${JSON.stringify(candidate)}`);
    } catch (error) {
      refused++;
      if (!(error instanceof StorageError)) problems.push(`threw ${String(error)} on ${JSON.stringify(candidate)}`);
    }
  }
  expect(accepted, "the fuzz must accept many strings or it proves nothing").toBeGreaterThan(3000);
  expect(refused, "and refuse many").toBeGreaterThan(3000);
  expect(problems).toEqual([]);
});
