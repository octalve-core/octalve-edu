import "../support/env";
import { test, expect } from "@playwright/test";
import { ITEM_LIMITS, cleanText, parseItem, toEditable, type StoredItem } from "@/lib/question-bank/item-input";

// What a teacher may send when writing a question, and what is stored (src/lib/question-bank/item-input.ts). One pure module, so the whole path from request body to stored shape
// is tested here with no database: the four types, every refusal with the field it belongs to, hostile text, the round trip back to what the form edits, and a seeded fuzz.

const single = (over: Record<string, unknown> = {}) => ({
  type: "SINGLE",
  prompt: "Which planet is closest to the Sun?",
  options: ["Mercury", "Venus", "Earth"],
  correct: 0,
  ...over,
});
const multi = (over: Record<string, unknown> = {}) => ({
  type: "MULTI",
  prompt: "Select the prime numbers",
  options: ["2", "3", "4", "5"],
  correct: [0, 1, 3],
  ...over,
});
const trueFalse = (over: Record<string, unknown> = {}) => ({ type: "TRUE_FALSE", prompt: "The Earth is flat.", correct: false, ...over });
const short = (over: Record<string, unknown> = {}) => ({ type: "SHORT", prompt: "Capital of France?", correct: ["Paris"], ...over });

const stored = (raw: unknown): StoredItem => {
  const parsed = parseItem(raw);
  if (!parsed.ok) throw new Error(`expected a valid question, got ${JSON.stringify(parsed.problems)}`);
  return parsed.item;
};
const problems = (raw: unknown) => {
  const parsed = parseItem(raw);
  if (parsed.ok) throw new Error(`expected a refusal for ${JSON.stringify(raw).slice(0, 120)}`);
  return parsed.problems;
};
/// The refusal is reported on the field, or on one element of it (`correct.0`).
const refusedAt = (raw: unknown, path: string) =>
  expect(
    problems(raw).some((p) => p.path === path || p.path.startsWith(`${path}.`)),
    JSON.stringify(raw).slice(0, 100),
  ).toBe(true);

test.describe("the four types are stored in one shape", () => {
  test("SINGLE: options get ids o1, o2, ..., the correct answer is the id of the chosen one, defaults are filled in", () => {
    expect(stored(single())).toEqual({
      type: "SINGLE",
      prompt: "Which planet is closest to the Sun?",
      explanation: null,
      points: 1,
      difficulty: null,
      topic: null,
      options: [
        { id: "o1", text: "Mercury" },
        { id: "o2", text: "Venus" },
        { id: "o3", text: "Earth" },
      ],
      correctAnswer: "o1",
      subjectLabel: null,
      subjectKey: null,
      classTags: [],
    });
    expect(stored(single({ correct: 2 })).correctAnswer).toBe("o3");
  });

  test("MULTI: the correct ids are a sorted list, whatever order they were sent in", () => {
    expect(stored(multi({ correct: [3, 0, 1] })).correctAnswer).toEqual(["o1", "o2", "o4"]);
    expect(stored(multi({ correct: [2] })).correctAnswer).toEqual(["o3"]);
    expect(stored(multi({ correct: [0, 1, 2, 3] })).correctAnswer).toEqual(["o1", "o2", "o3", "o4"]); // every option correct is allowed
  });

  test("TRUE_FALSE has fixed options and a true or false answer; each call gets its own copy of the options", () => {
    const a = stored(trueFalse({ correct: true }));
    expect(a.options).toEqual([
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ]);
    expect(a.correctAnswer).toBe("true");
    expect(stored(trueFalse()).correctAnswer).toBe("false");
    a.options[0].text = "changed";
    expect(stored(trueFalse()).options[0].text).toBe("True");
  });

  test("SHORT has no options and keeps the accepted answers in order", () => {
    const s = stored(short({ correct: ["Paris", "paris, france"] }));
    expect(s.options).toEqual([]);
    expect(s.correctAnswer).toEqual(["Paris", "paris, france"]);
  });

  test("points, difficulty, topic, explanation, subject and class tags: normalised, keyed, de-duplicated, empty means none", () => {
    const s = stored(
      single({
        points: 5,
        difficulty: 3,
        topic: "  Fractions  ",
        explanation: "Because.",
        subject: " Mathematics ",
        classTags: ["JSS 1", "jss-1", "JSS 2", "Primary 6"],
      }),
    );
    expect([s.points, s.difficulty, s.topic, s.explanation]).toEqual([5, 3, "Fractions", "Because."]);
    expect([s.subjectLabel, s.subjectKey]).toEqual(["Mathematics", "mathematics"]);
    expect(s.classTags).toEqual([
      { label: "JSS 1", labelKey: "jss1" },
      { label: "JSS 2", labelKey: "jss2" },
      { label: "Primary 6", labelKey: "primary6" },
    ]);
    const blanks = stored(single({ topic: "   ", explanation: "", subject: "", difficulty: null }));
    expect([blanks.topic, blanks.explanation, blanks.subjectLabel, blanks.subjectKey, blanks.difficulty]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(stored(single({ points: 0 })).points).toBe(0);
    expect(stored(single({ points: ITEM_LIMITS.points.max })).points).toBe(100);
  });

  test("Arabic: the subject key folds like every other label, and Arabic text is kept as written", () => {
    const s = stored(
      single({ prompt: "ما هي عاصمة السعودية؟", options: ["الرياض", "جدة"], subject: "الرياضيات", classTags: ["الصف ١", "الصف 1"] }),
    );
    expect(s.prompt).toBe("ما هي عاصمة السعودية؟");
    expect(s.subjectKey).toBe("الرياضيات");
    expect(s.classTags).toHaveLength(1); // ١ and 1 are the same digit
  });
});

test.describe("what is refused, and where", () => {
  test("the body must be a known type and an object; unknown keys are refused (nothing about status, visibility, bank or ownership can ride along)", () => {
    for (const raw of [
      null,
      undefined,
      "x",
      5,
      [],
      {},
      { type: "ESSAY", prompt: "x", correct: 1 },
      { type: "RATING", prompt: "x" },
      { type: "TEXT", prompt: "x" },
    ]) {
      expect(parseItem(raw).ok).toBe(false);
    }
    for (const key of [
      "status",
      "visibility",
      "visibleFrom",
      "bank",
      "submittedById",
      "approvedById",
      "version",
      "branchId",
      "id",
      "images",
      "correctAnswer",
      "explanationHtml",
    ])
      expect(parseItem(single({ [key]: key === "visibility" ? "PRACTICE" : "x" })).ok, key).toBe(false);
  });

  test("prompt: required, trimmed, at most 4000 characters, text only", () => {
    refusedAt(single({ prompt: "" }), "prompt");
    refusedAt(single({ prompt: "   \n\t " }), "prompt");
    refusedAt(single({ prompt: "x".repeat(ITEM_LIMITS.prompt + 1) }), "prompt");
    refusedAt(single({ prompt: 5 }), "prompt");
    refusedAt(single({ prompt: null }), "prompt");
    refusedAt(single({ prompt: undefined }), "prompt");
    refusedAt(single({ prompt: ["a"] }), "prompt");
    expect(stored(single({ prompt: "x".repeat(ITEM_LIMITS.prompt) })).prompt).toHaveLength(ITEM_LIMITS.prompt);
  });

  test("options: 2 to 8, each required and at most 500 characters, no two the same once case and punctuation are ignored, each with a letter or digit", () => {
    refusedAt(single({ options: ["Only one"], correct: 0 }), "options");
    refusedAt(single({ options: [], correct: 0 }), "options");
    refusedAt(single({ options: Array.from({ length: 9 }, (_, i) => `Option ${i}`), correct: 0 }), "options");
    refusedAt(single({ options: ["A", ""] }), "options.1");
    refusedAt(single({ options: ["A", "   "] }), "options.1");
    refusedAt(single({ options: ["A", "x".repeat(ITEM_LIMITS.option + 1)] }), "options.1");
    refusedAt(single({ options: ["Paris", "paris."] }), "options.1");
    refusedAt(single({ options: ["Paris", " PARIS "] }), "options.1");
    refusedAt(single({ options: ["Yes", "!!!"] }), "options.1");
    refusedAt(single({ options: ["A", 5] }), "options.1");
    refusedAt(single({ options: "A,B" }), "options");
    expect(stored(single({ options: Array.from({ length: 8 }, (_, i) => `Option ${i}`) })).options).toHaveLength(8);
  });

  test("correct: SINGLE needs one option number inside the list, MULTI a list of them without repeats, TRUE_FALSE a boolean, SHORT a list of accepted answers (1 to 10)", () => {
    for (const correct of [-1, 3, 99, 1.5, "0", null, [0], undefined, NaN]) refusedAt(single({ correct }), "correct");
    for (const correct of [[], [4], [-1], [0, 0], ["0"], 0, null, [1.5]]) refusedAt(multi({ correct }), "correct");
    for (const correct of [0, "true", null, undefined, [true]]) refusedAt(trueFalse({ correct }), "correct");
    for (const correct of [
      [],
      [""],
      ["   "],
      ["!!!"],
      "Paris",
      null,
      Array.from({ length: 11 }, (_, i) => `a${i}`),
      ["x".repeat(ITEM_LIMITS.accepted.length + 1)],
    ])
      expect(parseItem(short({ correct })).ok, JSON.stringify(correct).slice(0, 60)).toBe(false);
    expect(stored(short({ correct: Array.from({ length: 10 }, (_, i) => `a${i}`) })).correctAnswer).toHaveLength(10);
  });

  test("a field that belongs to another type is refused: options on a true/false or short question, a list for a single, a number for a multiple", () => {
    refusedAt(trueFalse({ options: ["True", "False"] }), "");
    expect(parseItem(trueFalse({ options: ["True", "False"] })).ok).toBe(false);
    expect(parseItem(short({ options: ["a", "b"] })).ok).toBe(false);
    expect(parseItem({ type: "SINGLE", prompt: "p", correct: 0 }).ok).toBe(false); // no options
  });

  test("points 0 to 100 and whole; difficulty 1 to 5 or none; topic, subject and explanation limits; at most 10 class tags, each with a letter or digit", () => {
    for (const points of [-1, 101, 1.5, "5", null, NaN, Infinity]) refusedAt(single({ points }), "points");
    for (const difficulty of [0, 6, 2.5, "3", NaN]) refusedAt(single({ difficulty }), "difficulty");
    refusedAt(single({ topic: "x".repeat(ITEM_LIMITS.topic + 1) }), "topic");
    refusedAt(single({ subject: "x".repeat(ITEM_LIMITS.subject + 1) }), "subject");
    refusedAt(single({ subject: "!!!" }), "subject");
    refusedAt(single({ explanation: "x".repeat(ITEM_LIMITS.explanation + 1) }), "explanation");
    refusedAt(single({ classTags: Array.from({ length: 11 }, (_, i) => `Class ${i}`) }), "classTags");
    refusedAt(single({ classTags: ["JSS 1", "???"] }), "classTags.1");
    refusedAt(single({ classTags: ["x".repeat(ITEM_LIMITS.tags.length + 1)] }), "classTags.0");
    refusedAt(single({ classTags: "JSS 1" }), "classTags");
  });

  test("every problem names a field and carries a sentence a teacher can read", () => {
    for (const raw of [
      single({ prompt: "", options: ["a"], correct: 5, points: -1 }),
      multi({ correct: [] }),
      short({ correct: [] }),
      { type: "?" },
    ]) {
      const list = problems(raw);
      expect(list.length).toBeGreaterThan(0);
      for (const p of list) {
        expect(typeof p.path).toBe("string");
        expect(p.message.length).toBeGreaterThan(5);
        expect(p.message).not.toMatch(/undefined|\[object|NaN|ZodError|invalid_/i);
      }
    }
  });
});

test.describe("text hygiene", () => {
  test("NUL, other controls, private-use and unassigned characters, lone surrogates and direction overrides are refused everywhere text is taken", () => {
    const bad = [
      "a\u0000b",
      "a\u0001b",
      "a\u007fb",
      "a\u0085b",
      "a\ue000b",
      "a\u0378b",
      "a\ud800b",
      "a\udfffb",
      "a\u202eb",
      "a\u202ab",
      "a\u2066b",
      "a\u2069b",
      "a\u200bb",
      "a\u00adb",
      "a\u2060b",
    ];
    for (const text of bad) {
      const label = JSON.stringify(text);
      expect(parseItem(single({ prompt: text })).ok, `prompt ${label}`).toBe(false);
      expect(parseItem(single({ options: [text, "other"] })).ok, `option ${label}`).toBe(false);
      expect(parseItem(single({ explanation: text })).ok, `explanation ${label}`).toBe(false);
      expect(parseItem(single({ topic: text })).ok, `topic ${label}`).toBe(false);
      expect(parseItem(single({ subject: text })).ok, `subject ${label}`).toBe(false);
      expect(parseItem(single({ classTags: [text] })).ok, `tag ${label}`).toBe(false);
      expect(parseItem(short({ correct: [text] })).ok, `accepted ${label}`).toBe(false);
    }
  });

  test("a byte-order mark inside a prompt is refused; inside a single-line field it is just whitespace, and at either end it is trimmed", () => {
    expect(parseItem(single({ prompt: "a\ufeffb" })).ok).toBe(false);
    expect(stored(single({ options: ["a\ufeffb", "other"] })).options[0].text).toBe("a b");
    expect(stored(single({ prompt: "\ufeffhello\ufeff" })).prompt).toBe("hello");
  });

  test("what Persian and Arabic text needs stays: zero-width joiner and non-joiner, left-to-right and right-to-left marks; so do emoji sequences", () => {
    const text = "می\u200cخواهم\u200f و 👨\u200d👩\u200d👧 \u200e!";
    expect(stored(single({ prompt: text })).prompt).toBe(text);
  });

  test("a prompt keeps its new lines and tabs (CRLF becomes LF); a single-line field turns any run of whitespace into one space", () => {
    expect(stored(single({ prompt: "Line one\r\nLine two\n\n\tIndented\rLine four" })).prompt).toBe(
      "Line one\nLine two\n\n\tIndented\nLine four",
    );
    expect(stored(single({ options: ["a\tb\nc", "other"] })).options[0].text).toBe("a b c");
    expect(stored(single({ topic: "Algebra and geometry" })).topic).toBe("Algebra and geometry");
  });

  test("text is NFC: a letter and its combining accent become the one character, so two spellings of one word are one word", () => {
    expect(stored(single({ prompt: "café" })).prompt).toBe("café");
    expect(cleanText("é", { multiline: false })).toBe("é");
    expect(cleanText("  spaced   out  ", { multiline: false })).toBe("spaced out");
    expect(cleanText("\u0000", { multiline: true })).toBeNull();
  });

  test("a huge body is refused cheaply, before any normalising", () => {
    const started = Date.now();
    expect(parseItem(single({ prompt: "x".repeat(2_000_000) })).ok).toBe(false);
    expect(parseItem(single({ options: Array.from({ length: 50_000 }, (_, i) => `o${i}`) })).ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

test.describe("the round trip", () => {
  test("a stored question turned back into what the form edits, and parsed again, gives the same stored question, for every type", () => {
    for (const raw of [
      single({ subject: "Maths", classTags: ["JSS 1"], points: 3, difficulty: 2, topic: "Space", explanation: "Mercury is nearest." }),
      single({ correct: 2 }),
      multi({ correct: [1, 3] }),
      trueFalse({ correct: true }),
      trueFalse(),
      short({ correct: ["a", "b", "c"] }),
    ]) {
      const first = stored(raw);
      const again = stored(toEditable(first));
      expect(again).toEqual(first);
    }
  });
});

test.describe("seeded fuzz", () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pieces = [
    "a",
    "B",
    " ",
    "  ",
    "\n",
    "\t",
    "é",
    "é",
    "ا",
    "٣",
    "\u200d",
    "\u200e",
    "\u202e",
    "\u0000",
    "\ud800",
    "😀",
    " ",
    "!",
    "?",
    "Paris",
    "12",
    "\ue000",
    "\u0378",
  ];

  test("for random bodies parseItem never throws; an accepted question has clean text, limits respected, and a correct answer that exists", () => {
    const next = rng(20261020);
    const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
    const plain = ["a", "B", "Paris", "12", "é", "ا", " ", "!", "😀"];
    const word = () => Array.from({ length: 1 + Math.floor(next() * 4) }, () => (next() < 0.88 ? pick(plain) : pick(pieces))).join("");
    const junk = (): unknown => pick([null, undefined, 5, -1, 1.5, NaN, true, "x", [], {}, [word()], word()]);
    const maybe = (value: unknown) => (next() < 0.85 ? value : junk());
    let accepted = 0;
    const bad: string[] = [];
    for (let i = 0; i < 9000; i++) {
      const type = pick(["SINGLE", "MULTI", "TRUE_FALSE", "SHORT", "OTHER"]);
      const options = Array.from({ length: Math.floor(next() * 11) }, word);
      const raw: Record<string, unknown> = {
        type,
        prompt: maybe(word()),
        points: maybe(Math.floor(next() * 120) - 5),
        options: type === "SINGLE" || type === "MULTI" ? maybe(options) : undefined,
        correct: maybe(
          type === "SINGLE"
            ? Math.floor(next() * 10) - 1
            : type === "MULTI"
              ? Array.from({ length: Math.floor(next() * 4) }, () => Math.floor(next() * 9))
              : type === "TRUE_FALSE"
                ? next() < 0.5
                : Array.from({ length: Math.floor(next() * 3) }, word),
        ),
        subject: next() < 0.5 ? maybe(word()) : undefined,
        classTags: next() < 0.5 ? maybe(Array.from({ length: Math.floor(next() * 4) }, word)) : undefined,
        topic: next() < 0.3 ? maybe(word()) : undefined,
      };
      for (const key of Object.keys(raw)) if (raw[key] === undefined) delete raw[key];
      let result: ReturnType<typeof parseItem>;
      try {
        result = parseItem(raw);
      } catch (error) {
        bad.push(`threw on ${JSON.stringify(raw).slice(0, 100)}: ${error}`);
        continue;
      }
      if (!result.ok) continue;
      accepted++;
      const item = result.item;
      const texts = [
        item.prompt,
        item.explanation ?? "",
        item.topic ?? "",
        item.subjectLabel ?? "",
        ...item.options.map((o) => o.text),
        ...item.classTags.map((t) => t.label),
        ...(Array.isArray(item.correctAnswer) && item.type === "SHORT" ? item.correctAnswer : []),
      ];
      for (const t of texts)
        if (/[\u0000\ud800-\udfff\u202a-\u202e\u2066-\u2069\ue000]/u.test(t.replace(/[\t\n]/g, " ")))
          bad.push(`forbidden character kept: ${JSON.stringify(t)}`);
      if (item.prompt.length === 0 || item.prompt.length > ITEM_LIMITS.prompt) bad.push("prompt length");
      if (item.type === "SINGLE" && !item.options.some((o) => o.id === item.correctAnswer)) bad.push("SINGLE answer missing");
      if (item.type === "MULTI" && !(item.correctAnswer as string[]).every((id) => item.options.some((o) => o.id === id)))
        bad.push("MULTI answer missing");
      if (item.options.length > 0 && (item.options.length < 2 || item.options.length > 8)) bad.push("option count");
      if (item.points < 0 || item.points > 100) bad.push("points");
      // the stored question survives its own round trip
      const again = parseItem(toEditable(item));
      if (!again.ok || JSON.stringify(again.item) !== JSON.stringify(item))
        bad.push(`round trip changed ${JSON.stringify(item).slice(0, 80)}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(accepted).toBeGreaterThan(100); // the generator reaches the accepting paths too
  });
});
