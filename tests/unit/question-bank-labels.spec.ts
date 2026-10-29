import "../support/env";
import { test, expect } from "@playwright/test";
import { normalizeLabel } from "@/lib/question-bank/labels";

// Class and subject tags in the question bank are TEXT, matched by the normalised name (the maintainer's decision of 2026-10-19, design note 16a): a tag keeps the
// label as typed AND a key, and a branch's class matches when normalizeLabel(ClassGroup.name) equals the key. So this one pure function decides what matches what.
// Properties checked here, beyond the plain examples:
//   L1  it never throws, whatever it is given, and is idempotent (a stored key can be recomputed from itself);
//   L2  its output holds only letters and digits, all lower-case: no space, no control character, no NUL (a NUL would be a Postgres error);
//   L3  it is deliberately plain: it does not guess that "Junior Secondary 1" means "JSS 1".

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test.describe("the plain rules", () => {
  test("spaces, hyphens, dots, underscores and case do not matter", () => {
    for (const label of ["JSS 1", "JSS-1", "jss1", "J.S.S. 1", "J S S 1", "jss_1", "  JSS   1  ", "Jss–1", "JSS 1", "JSS\t1", "JSS\n1"]) {
      expect(normalizeLabel(label), JSON.stringify(label)).toBe("jss1");
    }
  });

  test("Arabic-Indic and Persian digits become ASCII digits; full-width letters and digits too (NFKC)", () => {
    expect(normalizeLabel("JSS ١")).toBe("jss1");
    expect(normalizeLabel("JSS ۱")).toBe("jss1");
    expect(normalizeLabel("Primary ٣")).toBe("primary3");
    expect(normalizeLabel("SSS ۲٣")).toBe("sss23");
    expect(normalizeLabel("ＪＳＳ １")).toBe("jss1");
    expect(normalizeLabel("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeLabel("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  test("Arabic letters are kept, so an Arabic class name matches itself with any digit script", () => {
    expect(normalizeLabel("الصف ١")).toBe("الصف1");
    expect(normalizeLabel("الصف 1")).toBe("الصف1");
    expect(normalizeLabel("الصف-۱")).toBe("الصف1");
    expect(normalizeLabel("الصف ١")).not.toBe(normalizeLabel("الصف ٢"));
  });

  test("it is deliberately plain: different words stay different (no guessing 'Junior Secondary 1' is 'JSS 1')", () => {
    expect(normalizeLabel("Junior Secondary 1")).toBe("juniorsecondary1");
    expect(normalizeLabel("Junior Secondary 1")).not.toBe(normalizeLabel("JSS 1"));
    expect(normalizeLabel("JSS 1")).not.toBe(normalizeLabel("JSS 2"));
    expect(normalizeLabel("JSS 1")).not.toBe(normalizeLabel("SSS 1"));
    expect(normalizeLabel("JSS 1A")).not.toBe(normalizeLabel("JSS 1"));
    expect(normalizeLabel("JSS 11")).not.toBe(normalizeLabel("JSS 1"));
    expect(normalizeLabel("JSS 1 1")).toBe(normalizeLabel("JSS 11")); // known and accepted: separators carry no meaning
  });

  test("compatibility forms fold (NFKC): ligatures, the Kelvin sign, superscripts", () => {
    expect(normalizeLabel("ﬁnal")).toBe("final"); // the "fi" ligature
    expect(normalizeLabel("K1")).toBe("k1"); // the Kelvin sign
    expect(normalizeLabel("Class ²")).toBe("class2");
  });

  test("a dotted capital I folds to i, and the other letters of other scripts are kept", () => {
    expect(normalizeLabel("İ1")).toBe("i1");
    expect(normalizeLabel("Класс 5")).toBe("класс5");
    expect(normalizeLabel("École 3")).toBe("école3");
  });

  test("nothing meaningful left gives the empty key, which callers must refuse", () => {
    for (const label of ["", " ", "\t\n", "---", "...", "___", "!@#$%^&*()", "\u0000", "\u200b", "—", "()[]{}"]) {
      expect(normalizeLabel(label), JSON.stringify(label)).toBe("");
    }
  });

  test("control characters, NUL, zero-width and bidi marks never reach the key", () => {
    expect(normalizeLabel("JSS\u00001")).toBe("jss1");
    expect(normalizeLabel("J\u200bSS\u200d1")).toBe("jss1");
    expect(normalizeLabel("\u202eJSS 1\u202c")).toBe("jss1");
    expect(normalizeLabel("JSS\u0007 1\u007f")).toBe("jss1");
    expect(normalizeLabel("JSS\ufeff1")).toBe("jss1");
  });

  test("emoji and symbols are dropped; a lone surrogate does not throw", () => {
    expect(normalizeLabel("JSS 1 😀")).toBe("jss1");
    expect(normalizeLabel("JSS 1 \ud83d")).toBe("jss1");
    expect(normalizeLabel("\ude00JSS 1")).toBe("jss1");
  });
});

test.describe("L1: it never throws and is idempotent", () => {
  test("non-string input is the empty key, not a crash", () => {
    for (const value of [undefined, null, 0, 1, NaN, true, {}, [], ["JSS 1"], () => 1, Symbol("x")]) {
      expect(() => normalizeLabel(value as never), String(typeof value)).not.toThrow();
      expect(normalizeLabel(value as never)).toBe("");
    }
  });

  test("a very long label is handled quickly", () => {
    const started = Date.now();
    const key = normalizeLabel("JSS 1 ".repeat(200_000));
    expect(key.length).toBe("jss1".length * 200_000);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("seeded random strings from a hostile alphabet: never throws, idempotent, and L2 holds", () => {
    const alphabet = [
      ..."abcXYZ019 -._ ",
      "\u0000",
      "\u0007",
      "\t",
      "\n",
      " ",
      "\u200b",
      "\u202e",
      "\ufeff",
      "́",
      "ـ",
      "١",
      "٢",
      "٣",
      "۱",
      "۲",
      "ＪＳ",
      "１",
      "²",
      "ﬁ",
      "ﬃ",
      "K",
      "İ",
      "ǅ",
      "ß",
      "ς",
      "Σ",
      "ı",
      "é",
      "ñ",
      "ا",
      "ل",
      "ص",
      "ف",
      "ж",
      "漢",
      "한",
      "😀",
      "\ud83d",
      "\ude00",
      "!",
      "'",
      '"',
      "\\",
      "%",
      "_",
      "(",
      ")",
      "—",
      "–",
    ];
    // Problems are collected and asserted once: thousands of `expect` calls (each captures a stack) are slow, and the first ten failures are all that is useful.
    const problems: string[] = [];
    const next = mulberry32(7);
    for (let i = 0; i < 6000; i++) {
      const length = Math.floor(next() * 40);
      let input = "";
      for (let j = 0; j < length; j++) input += alphabet[Math.floor(next() * alphabet.length)];
      let key = "";
      try {
        key = normalizeLabel(input);
      } catch (error) {
        problems.push(`${JSON.stringify(input)} threw ${String(error)}`);
        continue;
      }
      if (normalizeLabel(key) !== key) problems.push(`not idempotent: ${JSON.stringify(input)} -> ${JSON.stringify(key)}`);
      if (!/^[\p{L}\p{N}]*$/u.test(key)) problems.push(`not only letters and digits: ${JSON.stringify(input)} -> ${JSON.stringify(key)}`);
      if (key !== key.toLowerCase()) problems.push(`not lower-case: ${JSON.stringify(input)} -> ${JSON.stringify(key)}`);
      if (key.includes("\u0000")) problems.push(`NUL kept: ${JSON.stringify(input)}`);
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  test("two labels that differ only in separators, case or digit script always share a key (seeded)", () => {
    const next = mulberry32(11);
    const words = ["JSS", "SSS", "Primary", "Nursery", "Basic", "الصف", "Class"];
    const sep = ["", " ", "-", ".", "_", " - ", "  "];
    const digits: Array<[string, string]> = [
      ["1", "١"],
      ["2", "۲"],
      ["3", "٣"],
      ["4", "۴"],
      ["5", "５"],
    ];
    const problems: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const word = words[Math.floor(next() * words.length)];
      const [ascii, other] = digits[Math.floor(next() * digits.length)];
      const a = `${word}${sep[Math.floor(next() * sep.length)]}${ascii}`;
      const b = `${next() < 0.5 ? word.toUpperCase() : word.toLowerCase()}${sep[Math.floor(next() * sep.length)]}${other}`;
      if (normalizeLabel(a) !== normalizeLabel(b)) problems.push(`${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});
