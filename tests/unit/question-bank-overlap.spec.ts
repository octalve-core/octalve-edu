import "../support/env";
import { test, expect } from "@playwright/test";
import { OVERLAP_THRESHOLD, overlapScore, overlapTokens, type OverlapInput } from "@/lib/question-bank/overlap";

// "Is this the same question as one we already have?" Method v1 (design note section 16 left the exact method open; this is the one proposed in the slice 2 plan, replaceable
// because it is one pure function): every part of a question (the prompt, and each option on its own) is folded to plain lower-case words, cut into overlapping runs of three
// words (shingles), and two questions are compared by the Jaccard similarity of their shingle sets: the shared shingles over all the shingles. Options are a SET, so reordering
// them changes nothing. A score of 0.8 or more is "the same question, give or take a word or two". No database, no extension, no external service.
//
// What it is NOT: a paraphrase detector. A question reworded by hand scores low, and that is the documented limit of v1, asserted below so nobody mistakes it for one.

const q = (prompt: string, ...options: string[]): OverlapInput => ({ prompt, options });
const words = (n: number, prefix = "w") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");

test("the threshold is 0.8", () => {
  expect(OVERLAP_THRESHOLD).toBe(0.8);
});

test("identical questions score 1, and case, spacing, punctuation, accents and the order of the options change nothing", () => {
  const a = q("Which planet is closest to the Sun?", "Mercury", "Venus", "Earth", "Mars");
  expect(overlapScore(a, a)).toBe(1);
  expect(overlapScore(a, q("  WHICH   planet is CLOSEST to the sun ", "Mars", "mercury", "VENUS", "earth"))).toBe(1);
  expect(overlapScore(a, q("Which planet — is closest, to the Sun??", "Mercury.", "Venus!", "(Earth)", "Mars;"))).toBe(1);
  expect(overlapScore(q("Qu’est-ce qu’un élève très appliqué ?"), q("Quest ce quun eleve tres applique"))).toBe(1);
  expect(overlapScore(q("Same", "A", "B"), q("Same", "B", "A"))).toBe(1);
});

test("unrelated questions score 0, questions that differ in their numbers score 0 (they are different questions), an empty question scores 0 against everything", () => {
  expect(
    overlapScore(
      q("Which planet is closest to the Sun?", "Mercury"),
      q("Name the capital of France and one river that runs through it", "Paris"),
    ),
  ).toBe(0);
  expect(overlapScore(q("What is 12 + 7?", "19"), q("What is 13 + 7?", "20"))).toBe(0);
  for (const empty of [q(""), q("   "), q("!!! ... ???"), { prompt: "", options: [] }, { prompt: "\u200b\u200d" }]) {
    expect(overlapScore(empty, q("A real question about something", "yes", "no"))).toBe(0);
    expect(overlapScore(empty, empty)).toBe(0);
  }
});

test("the same question with a word or two changed: a long question is still flagged, a short one is not, and the numbers are exactly these", () => {
  // 40 words, one in the middle replaced: 38 shingles, 3 of them change -> 35 shared of 41 in all
  const base = words(40);
  const edited = base.replace("w20", "CHANGED");
  const long = overlapScore(q(base), q(edited));
  expect(long).toBeCloseTo(35 / 41, 10);
  expect(long).toBeGreaterThanOrEqual(OVERLAP_THRESHOLD);
  // 20 words, one replaced: 18 shingles, 3 change -> 15 of 21
  const mid = overlapScore(q(words(20)), q(words(20).replace("w10", "CHANGED")));
  expect(mid).toBeCloseTo(15 / 21, 10);
  expect(mid).toBeLessThan(OVERLAP_THRESHOLD);
  // a word added at the end of a long question
  expect(overlapScore(q(base), q(`${base} extra`))).toBeCloseTo(38 / 39, 10);
});

test("the limit of v1, stated: a question reworded by hand is not flagged", () => {
  const a = q("Which planet is closest to the Sun?", "Mercury", "Venus", "Earth", "Mars");
  const reworded = q("Name the planet that orbits nearest to our Sun.", "Mercury", "Venus", "Earth", "Mars");
  expect(overlapScore(a, reworded)).toBeLessThan(OVERLAP_THRESHOLD);
});

test("a question with fewer than three words is still compared (one shingle of all its words)", () => {
  expect(overlapScore(q("True or false"), q("true OR false"))).toBe(1);
  expect(overlapScore(q("Yes"), q("yes!"))).toBe(1);
  expect(overlapScore(q("Yes"), q("No"))).toBe(0);
  expect(overlapScore(q("Yes no"), q("Yes no maybe"))).toBe(0);
});

test("the options count: the same prompt with different options is a different question, and a changed option lowers the score", () => {
  const prompt = "Which of these is a prime number between ten and twenty";
  const a = q(prompt, "eleven", "twelve", "fourteen", "fifteen");
  const b = q(prompt, "seventeen", "eighteen", "twenty four", "twenty five");
  const same = overlapScore(a, a);
  const swapped = overlapScore(a, q(prompt, "eleven", "twelve", "fourteen", "sixteen"));
  const different = overlapScore(a, b);
  expect(same).toBe(1);
  expect(swapped).toBeLessThan(1);
  expect(different).toBeLessThan(swapped);
  expect(different).toBeLessThan(OVERLAP_THRESHOLD);
  // a prompt word and an option word are never confused with each other
  // (a prompt and an option made of the same words are not the same part of a question: no match at all)
  expect(overlapScore(q("alpha beta gamma"), q("", "alpha beta gamma"))).toBe(0);
  expect(overlapScore(q("alpha beta gamma"), q("delta", "alpha beta gamma"))).toBeLessThan(1);
});

test("Arabic: diacritics, tatweel, the forms of alef, alef maqsura, ta marbuta and the digits are folded, so the same question typed two ways matches", () => {
  const plain = q("ما هي عاصمة المملكة العربية السعودية؟ 3", "الرياض", "جدة", "مكة");
  const decorated = q("مَا هِيَ عَاصِمَةُ الْمَمْلَكَةِ الْعَرَبِيَّةِ السُّعُودِيَّةِ؟ ٣", "الـريـاض", "جدّة", "مكّة");
  expect(overlapScore(plain, decorated)).toBe(1);
  expect(overlapScore(q("أحمد وإبراهيم وآدم"), q("احمد وابراهيم وادم"))).toBe(1);
  expect(overlapScore(q("هذا الفتى يمشي إلى المدرسة"), q("هذا الفتي يمشي الي المدرسه"))).toBe(1);
  // Persian digits too
  expect(overlapScore(q("عدد ۱۲ طالبا"), q("عدد 12 طالبا"))).toBe(1);
});

test("the tokens: lower-case letters and digits only, nothing invisible, combining marks gone, symmetric in what it produces", () => {
  expect(overlapTokens("Hello, WORLD! 42")).toEqual(["hello", "world", "42"]);
  expect(overlapTokens("a\u200bb\u200dc\u00adc d")).toEqual(["abcc", "d"]); // zero-width and soft-hyphen characters do not split or hide a word
  expect(overlapTokens("Éé é")).toEqual(["ee", "e"]);
  expect(overlapTokens("")).toEqual([]);
  expect(overlapTokens("😀 ✔ — … ,")).toEqual([]);
  expect(overlapTokens("ＡＢＣ １２３")).toEqual(["abc", "123"]); // full-width forms
});

test("bounded: a huge input costs a bounded amount of work, whatever it is", () => {
  const huge = q(words(300_000), ...Array.from({ length: 500 }, (_, i) => words(2000, `o${i}`)));
  const started = Date.now();
  const score = overlapScore(huge, huge);
  expect(score).toBe(1);
  expect(overlapScore(huge, q(words(300_000, "z")))).toBe(0);
  expect(Date.now() - started).toBeLessThan(5000);
});

test("hostile text never throws and never gives NaN: unpaired surrogates, NUL, bidi controls, combining floods, very long words, RTL and emoji", () => {
  const nasty = [
    "\ud800",
    "\udfff",
    "a\ud800b",
    "\u0000",
    "a\u0000b c",
    "\u202e\u2066\u2069 reversed",
    "e" + "́".repeat(5000),
    "x".repeat(100_000),
    "😀".repeat(1000),
    "𝔘𝔫𝔦𝔠𝔬𝔡𝔢 𝔱𝔢𝔵𝔱",
    "ﷺ ﷻ ﷼",
    "\u{10ffff}",
    "a\r\nb\tc\vd\fe",
    "\ufeffbom",
    "\u200b",
    "%00%0a<script>alert(1)</script>",
    "' OR 1=1 --",
  ];
  for (const text of nasty) {
    for (const other of [text, "hello world again", ""]) {
      const s = overlapScore(q(text, text), q(other, other));
      expect(Number.isFinite(s), JSON.stringify(text).slice(0, 40)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  }
});

test("fuzz: for random questions the score is within 0 and 1, symmetric, 1 against itself when it has any words, and unchanged by the order of the options", () => {
  let seed = 99;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const vocabulary = [
    "the",
    "sun",
    "moon",
    "planet",
    "water",
    "ice",
    "is",
    "of",
    "a",
    "which",
    "ما",
    "هي",
    "عاصمة",
    "12",
    "٣",
    "café",
    "CAFÉ",
    "x,",
    "y.",
  ];
  const sentence = (n: number) => Array.from({ length: n }, () => vocabulary[Math.floor(next() * vocabulary.length)]).join(" ");
  const random = (): OverlapInput => ({
    prompt: sentence(Math.floor(next() * 14)),
    options: Array.from({ length: Math.floor(next() * 5) }, () => sentence(Math.floor(next() * 4))),
  });
  const problems: string[] = [];
  for (let i = 0; i < 4000; i++) {
    const a = random();
    const b = next() < 0.3 ? { prompt: a.prompt, options: [...(a.options ?? [])].reverse() } : random();
    const ab = overlapScore(a, b);
    const ba = overlapScore(b, a);
    if (!(ab >= 0 && ab <= 1)) problems.push(`out of range ${ab}`);
    if (ab !== ba) problems.push(`not symmetric ${ab} ${ba}`);
    const hasWords = overlapTokens(a.prompt).length > 0 || (a.options ?? []).some((o) => overlapTokens(o).length > 0);
    if (hasWords && overlapScore(a, a) !== 1) problems.push(`self score ${overlapScore(a, a)}`);
    if (!hasWords && overlapScore(a, a) !== 0) problems.push(`empty self score`);
    if (
      b.options &&
      overlapScore({ prompt: a.prompt, options: a.options }, { prompt: a.prompt, options: [...(a.options ?? [])].reverse() }) !==
        (hasWords ? 1 : 0)
    )
      problems.push("options order matters");
  }
  expect(problems.slice(0, 5)).toEqual([]);
});
