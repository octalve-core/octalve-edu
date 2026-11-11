import "../support/env";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import bidiFactory from "bidi-js";
import { test, expect } from "@playwright/test";
import { PdfBuilder, needsUnicode } from "@/lib/pdf/builder";
import { loadUnicodeFonts } from "@/lib/pdf/unicode-fonts";
import { clusters, reorder, visualRuns, type Run } from "@/lib/pdf/unicode-text";
import { pdfDeclaredPages, pdfEmbeddedFonts, pdfPages, pdfProblems } from "../support/pdf";

// Text the standard fonts cannot write is drawn with embedded Noto fonts (task 0045): Yoruba tone marks, Arabic (shaped, and in bidirectional order), and the rest of what Noto Sans holds. These
// are the pure rules (which text needs the fonts; the runs and their order), what the writer produces (read back through the file's own ToUnicode maps), and what software that is not ours
// makes of it: poppler reads the text and the fonts, Ghostscript draws every page.

const NOW = new Date("2026-11-11T10:00:00Z");
const build = (draw: (pdf: PdfBuilder) => void) => {
  const pdf = new PdfBuilder({ title: "Test", author: "Test", producer: "Test" });
  pdf.addPage();
  draw(pdf);
  return { pdf, bytes: pdf.build(NOW) };
};
const lines = (bytes: Buffer) => pdfPages(bytes)[0].split("\n");

/// What the algorithm's own reference implementation puts on the line, for a text without ligatures: the characters in visual order.
const referenceVisual = (text: string): string => {
  const bidi = bidiFactory() as unknown as {
    getEmbeddingLevels(t: string): unknown;
    getReorderedString(t: string, levels: unknown): string;
  };
  return bidi.getReorderedString(text, bidi.getEmbeddingLevels(text));
};
/// The same line from our runs: a right-to-left run's characters reversed, the runs in the order the line stands.
const ourVisual = (text: string): string =>
  visualRuns(text)
    .runs.map((r) => (r.level % 2 === 1 ? [...r.text].reverse().join("") : r.text))
    .join("");

test.describe("which text needs the embedded fonts", () => {
  test("none of ASCII, Latin-1, the Windows-1252 punctuation or a control character does", () => {
    for (const text of [
      "",
      "Plain ASCII",
      "Ada Obi 2026/0042",
      "Ünïcödé é ñ ß £ © ½",
      "“quoted” – dash … €",
      "tab\tand\nline",
      "bell \u0007 control",
    ])
      expect(needsUnicode(text), JSON.stringify(text)).toBe(false);
  });

  test("a letter with a mark Latin-1 lacks, Arabic, Cyrillic, Greek, the naira sign and CJK do", () => {
    for (const text of ["ọ", "Ṣéyí", "Ọ̀lá", "محمد", "Привет", "Ελλάδα", "₦30,000", "中文", "😀"])
      expect(needsUnicode(text), text).toBe(true);
  });

  test("a letter written as a base letter and a combining mark is the same text as the composed letter (NFC): é is WinAnsi, ọ is not", () => {
    expect(needsUnicode("é")).toBe(false);
    expect(needsUnicode("ọ")).toBe(true);
  });
});

test.describe("the runs of a line and their order", () => {
  test("Latin text is one run, left to right, in Noto Sans", () => {
    expect(visualRuns("Adébáyọ̀ Ṣéyí")).toEqual({ runs: [{ text: "Adébáyọ̀ Ṣéyí".normalize("NFC"), script: "sans", level: 0 }], rtl: false });
  });

  test("Arabic is one right-to-left run in Noto Naskh Arabic", () => {
    expect(visualRuns("محمد عبد")).toEqual({ runs: [{ text: "محمد عبد", script: "naskh", level: 1 }], rtl: true });
  });

  test("Arabic inside Latin stands where it was written; Latin inside Arabic reverses the order of the pieces", () => {
    const inLatin = visualRuns("name محمد end");
    expect(ourVisual("name محمد end")).toBe("name دمحم end"); // the Arabic word where it was written, its letters reversed on the line (the shaper does that)
    expect(inLatin.runs.find((r) => r.text === "محمد")?.level).toBe(1);
    expect(inLatin.rtl).toBe(true);
    expect(ourVisual("محمد Obi عبد")).toBe("دبع Obi دمحم"); // visual: the last word first
    expect(visualRuns("محمد Obi عبد").rtl).toBe(true);
  });

  test("a bracket read right to left is drawn as its mirror", () => {
    // Logical "(محمد)": the bracket that opens is on the right and faces left; the one that closes is on the left. The runs are in visual order and an odd run's characters read reversed.
    expect(ourVisual("(محمد)")).toBe(`(${[..."محمد"].reverse().join("")})`);
    expect(ourVisual("(محمد)")).toBe(referenceVisual("(محمد)"));
  });

  test("the invisible direction marks steer the order and are never drawn", () => {
    expect(
      visualRuns("a\u200Fb")
        .runs.map((r) => r.text)
        .join(""),
    ).toBe("ab");
    expect(
      visualRuns("\uFEFFAda")
        .runs.map((r) => r.text)
        .join(""),
    ).toBe("Ada");
  });

  test("the order of the pieces agrees with the algorithm's reference implementation, for a set of mixed lines without ligatures", () => {
    for (const text of [
      "محمد عبد",
      "name محمد end",
      "محمد Obi عبد",
      "أحمد 2024 (تجربة)",
      "Ada: محمد، عبد",
      "123 محمد 456",
      "محمد (Obi) عبد",
      "x محمد y عبد z",
    ])
      expect(ourVisual(text), text).toBe(referenceVisual(text.normalize("NFC")));
  });

  test("reorder: whole runs, highest level first (rule L2), and nothing changes when nothing is right to left", () => {
    const run = (text: string, level: number): Run => ({ text, script: "sans", level });
    expect(reorder([run("a", 0), run("b", 0)]).map((r) => r.text)).toEqual(["a", "b"]);
    expect(reorder([run("a", 1), run("b", 1)]).map((r) => r.text)).toEqual(["b", "a"]);
    expect(reorder([run("a", 1), run("b", 2), run("c", 1)]).map((r) => r.text)).toEqual(["c", "b", "a"]);
    expect(reorder([run("a", 0), run("b", 1), run("c", 1), run("d", 0)]).map((r) => r.text)).toEqual(["a", "c", "b", "d"]);
  });

  test("clusters keep a letter with its marks, and a surrogate pair whole", () => {
    expect(clusters("ọ̀a")).toEqual(["ọ̀", "a"]);
    expect(clusters("éx")).toEqual(["é", "x"]);
    expect(clusters("😀a")).toEqual(["😀", "a"]);
  });
});

test.describe("what the writer produces", () => {
  test("a document whose words are all WinAnsi embeds no font and is the file it was: three standard fonts, the text as hex bytes", () => {
    const { bytes } = build((pdf) => {
      pdf.text(40, 780, "Ada Obi, Ünïcödé é", { size: 12 });
      pdf.text(40, 760, "Bold line", { font: "bold" });
    });
    expect(pdfEmbeddedFonts(bytes)).toEqual([]);
    expect(bytes.includes(Buffer.from("/CIDFontType2"))).toBe(false);
    expect(bytes.includes(Buffer.from("/FontFile2"))).toBe(false);
    expect(lines(bytes)).toEqual(["Ada Obi, Ünïcödé é", "Bold line"]);
    expect(pdfProblems(bytes)).toEqual([]);
  });

  test("Yoruba text is drawn with Noto Sans exactly as written: every mark, read back through the ToUnicode map", () => {
    const names = ["Ọlá Adébáyọ̀", "Ṣéyí Ẹbùn", "Ọ̀gbẹ́ni Ọláwálé", "Adéwálé"];
    const { pdf, bytes } = build((p) => names.forEach((n, i) => p.text(40, 780 - i * 20, n, { size: 14 })));
    expect(pdf.unsupported).toBe(0);
    expect(lines(bytes)).toEqual(names.map((n) => n.normalize("NFC")));
    expect(pdfEmbeddedFonts(bytes)).toEqual([expect.stringContaining("NotoSans-Regular")]);
    expect(pdfProblems(bytes)).toEqual([]);
  });

  test("bold text uses the bold font, and text in the other fonts of the same line keeps its own", () => {
    const { bytes } = build((p) => {
      p.text(40, 780, "Ọlá", { font: "bold" });
      p.text(40, 760, "Ọlá", { font: "regular" });
      p.text(40, 740, "محمد", { font: "bold" });
    });
    expect(
      pdfEmbeddedFonts(bytes)
        .map((f) => f.split("+")[1])
        .sort(),
    ).toEqual(["NotoNaskhArabic-Bold", "NotoSans-Bold", "NotoSans-Regular"]);
    expect(lines(bytes)).toEqual(["Ọlá".normalize("NFC"), "Ọlá".normalize("NFC"), "دمحم"]);
  });

  test("a bracket in bold Arabic text falls back to Noto Sans Bold, not Regular (the Arabic font has no bracket)", () => {
    const { bytes } = build((p) => p.text(40, 780, "(محمد)", { font: "bold" }));
    expect(
      pdfEmbeddedFonts(bytes)
        .map((f) => f.split("+")[1])
        .sort(),
    ).toEqual(["NotoNaskhArabic-Bold", "NotoSans-Bold"]);
  });

  test("Arabic is shaped and written right to left: the glyphs read back reversed, and every one has its ToUnicode entry", () => {
    const { pdf, bytes } = build((p) => p.text(40, 780, "محمد عبد", { size: 16 }));
    expect(pdf.unsupported).toBe(0);
    expect(lines(bytes)).toEqual([[..."محمد عبد"].reverse().join("")]);
    expect(lines(bytes)[0]).not.toContain("�");
    expect(pdfEmbeddedFonts(bytes).map((f) => f.split("+")[1])).toEqual(["NotoNaskhArabic-Regular"]);
  });

  test("mixed Latin, Yoruba and Arabic in one line: each piece in its own font, in visual order", () => {
    const text = "Adé محمد ṣé عبد end";
    const { bytes } = build((p) => p.text(40, 780, text, { size: 14 }));
    expect(lines(bytes)).toEqual([referenceVisual(text.normalize("NFC"))]);
    expect(
      pdfEmbeddedFonts(bytes)
        .map((f) => f.split("+")[1])
        .sort(),
    ).toEqual(["NotoNaskhArabic-Regular", "NotoSans-Regular"]);
  });

  test("what a glyph stands for does not depend on which document the process wrote first (the e inside é is a glyph of its own once a subset is cut)", () => {
    const first = build((p) => p.text(40, 780, "é Ọ́ أ", { size: 12 })); // composite glyphs: cutting the subset makes their components
    expect(lines(first.bytes)).toEqual([referenceVisual("é Ọ́ أ".normalize("NFC"))]);
    const second = build((p) => p.text(40, 780, "end ا", { size: 12 }));
    expect(lines(second.bytes)[0]).not.toContain("\ufffd");
    expect(lines(second.bytes)[0]).toContain("end");
    expect(lines(second.bytes)[0]).toContain("ا");
  });

  test("a bracket in Arabic text is drawn in Noto Sans (the Arabic font has none), in the right place, and nothing becomes a question mark", () => {
    const text = "(تجربة) 2024";
    const { pdf, bytes } = build((p) => p.text(40, 780, text, { size: 14 }));
    expect(pdf.unsupported).toBe(0);
    expect(lines(bytes)[0]).not.toContain("?");
    expect(lines(bytes)[0]).not.toContain("\ufffd");
    // The line as the reference implementation orders it: the mirrored brackets stand outside the word, which reads reversed.
    expect(lines(bytes)).toEqual([referenceVisual(text)]);
  });

  test("a character no embedded font has is a question mark in Noto Sans, and is counted; the rest of the line is still drawn", () => {
    const { pdf, bytes } = build((p) => p.text(40, 780, "Obi 中文 😀 ọ", { size: 12 }));
    expect(pdf.unsupported).toBe(3);
    expect(lines(bytes)).toEqual(["Obi ?? ? ọ".normalize("NFC")]); // one question mark for each character, in the places of the originals
  });

  test("the text of the line is measured from the font: a mark adds no width, a wider letter is wider, and bold is wider than regular", () => {
    const { pdf } = build(() => undefined);
    const w = (t: string, font: "regular" | "bold" = "regular") => pdf.width(t, font, 10);
    expect(w("ọ̀")).toBeCloseTo(w("ọ"), 5);
    expect(w("ọ")).toBeGreaterThan(0);
    expect(w("Ṣ")).toBeGreaterThan(w("ṣ"));
    expect(w("Ṣéyí Ẹbùn", "bold")).toBeGreaterThan(w("Ṣéyí Ẹbùn"));
    expect(w("محمد")).toBeGreaterThan(0);
    // The width is the sum of the font's own advances, not an estimate: Noto Sans for Latin, Naskh for Arabic (the sum is in thousandths of an em).
    const fonts = loadUnicodeFonts();
    const advances = (key: "sans" | "sansBold" | "naskh", text: string) =>
      fonts.layout(key, text, key === "naskh").reduce((sum, g) => sum + g.advance, 0);
    expect(w("Ṣéyí")).toBeCloseTo((advances("sans", "Ṣéyí".normalize("NFC")) * 10) / 1000, 6);
    expect(w("Ṣéyí", "bold")).toBeCloseTo((advances("sansBold", "Ṣéyí".normalize("NFC")) * 10) / 1000, 6);
    expect(w("محمد")).toBeCloseTo((advances("naskh", "محمد") * 10) / 1000, 6);
    // The standard fonts still measure from their tables.
    expect(w("abc")).toBeCloseTo(((556 + 556 + 500) * 10) / 1000, 5);
  });

  test("right and centre alignment use the measured width", () => {
    const { pdf, bytes } = build((p) => {
      const width = p.width("Ọlá", "regular", 12);
      p.text(300, 780, "Ọlá", { size: 12, align: "right" });
      expect(width).toBeGreaterThan(0);
    });
    const x = Number(/1 0 0 1 ([\d.]+) 780 Tm/.exec(bytes.toString("latin1"))![1]);
    expect(x).toBeCloseTo(300 - pdf.width("Ọlá", "regular", 12), 1);
  });

  test("wrap keeps working with Unicode words: every line fits, nothing is lost, a mark is never cut from its letter", () => {
    const { pdf } = build(() => undefined);
    const text =
      "Ọlá Adébáyọ̀ works very hard and helps others in the class; ṣé daradara; the principal is pleased with the progress made this term.";
    const wrapped = pdf.wrap(text, "regular", 12, 180);
    expect(wrapped.length).toBeGreaterThan(2);
    for (const line of wrapped) expect(pdf.width(line, "regular", 12), line).toBeLessThanOrEqual(180);
    expect(wrapped.join(" ")).toBe(text.normalize("NFC"));
    const cut = pdf.wrap("Ọ̀".repeat(40), "regular", 12, 100);
    expect(cut.length).toBeGreaterThan(1);
    for (const line of cut) {
      expect(line.startsWith("̀")).toBe(false);
      expect([...line.normalize("NFD")].filter((c) => c === "̀").length).toBe([...line.normalize("NFD")].filter((c) => c === "̣").length);
    }
  });

  test("only the glyphs used are embedded: a few words weigh kilobytes, not the half megabyte of the font", () => {
    const { bytes } = build((p) => {
      p.text(40, 780, "Ọlá Ṣéyí", { size: 12 });
      p.text(40, 760, "محمد", { size: 12 });
    });
    expect(bytes.length).toBeLessThan(60_000);
  });

  test("the same drawing is the same bytes", () => {
    const draw = (p: PdfBuilder) => {
      p.text(40, 780, "Ọlá محمد Adé", { size: 14 });
    };
    expect(build(draw).bytes.equals(build(draw).bytes)).toBe(true);
  });

  test("the document information is written exactly: a title with a mark is UTF-16, a plain one stays as it was", () => {
    const pdf = new PdfBuilder({ title: "Report card of Ọlá", author: "School", producer: "Octalve Edu" });
    pdf.addPage();
    const raw = pdf.build(NOW).toString("latin1");
    expect(raw).toContain("/Title <FEFF");
    expect(raw).toMatch(/\/Author <[0-9a-f]+> /);
    expect(raw).not.toMatch(/\/Author <FEFF/);
  });

  test("several pages and links still work beside embedded fonts", () => {
    const pdf = new PdfBuilder({ title: "Test", author: "Test", producer: "Test" });
    pdf.addPage();
    pdf.text(40, 780, "Ọlá", {});
    pdf.link(40, 770, 100, 12, "https://school.example/verify/abc");
    pdf.addPage();
    pdf.text(40, 780, "محمد", {});
    const bytes = pdf.build(NOW);
    expect(pdfDeclaredPages(bytes)).toBe(2);
    expect(pdfPages(bytes)).toEqual(["Ọlá".normalize("NFC"), "دمحم"]);
    expect(pdfProblems(bytes)).toEqual([]);
  });
});

// Software that is not ours. Skipped where it is not installed (poppler's pdftotext and pdffonts, Ghostscript's gs), so a machine without it still runs everything above.
const has = (tool: string) =>
  spawnSync(tool, ["-v"], { stdio: "ignore" }).error === undefined && spawnSync("which", [tool], { stdio: "ignore" }).status === 0;

test.describe("software that is not ours reads and draws the file", () => {
  const sample = () =>
    build((p) => {
      p.text(40, 780, "Plain Helvetica line", { size: 12 });
      p.text(40, 750, "Ọlá Adébáyọ̀ Ṣéyí Ẹbùn Ọ̀gbẹ́ni", { size: 14 });
      p.text(40, 720, "محمد عبد", { size: 16 });
      p.text(40, 690, "Привет Ελλάδα ₦30,000", { size: 12 });
    }).bytes;
  const inTemp = <T>(bytes: Buffer, read: (file: string) => T): T => {
    const dir = mkdtempSync(path.join(tmpdir(), "pdf-unicode-"));
    try {
      const file = path.join(dir, "sample.pdf");
      writeFileSync(file, bytes);
      return read(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("pdftotext reads the Yoruba, Cyrillic, Greek and naira text exactly (left to right text needs only the ToUnicode maps)", () => {
    test.skip(!has("pdftotext"), "poppler is not installed");
    const out = inTemp(sample(), (file) => execFileSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" }));
    for (const expected of ["Plain Helvetica line", "Ọlá Adébáyọ̀ Ṣéyí Ẹbùn Ọ̀gbẹ́ni".normalize("NFC"), "Привет Ελλάδα ₦30,000"])
      expect(out.normalize("NFC"), expected).toContain(expected);
  });

  test("pdftotext reads the Arabic as it reads a browser's: the same letters, in the order it undoes the glyph order to", () => {
    test.skip(!has("pdftotext"), "poppler is not installed");
    const out = inTemp(sample(), (file) => execFileSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" }));
    // Printed by Chromium from the same text, `pdftotext -raw` gives "محمد عبد" with a right-to-left mark around it; ours gives the same.
    expect(out.replace(/[\u202A-\u202E]/g, "")).toContain("عبد محمد");
  });

  test("pdffonts finds the Noto fonts embedded, as subsets, with a ToUnicode map", () => {
    test.skip(!has("pdffonts"), "poppler is not installed");
    const out = inTemp(sample(), (file) => execFileSync("pdffonts", [file], { encoding: "utf8" }));
    for (const name of ["NotoSans-Regular", "NotoNaskhArabic-Regular"]) {
      const row = out.split("\n").find((l) => l.includes(name)) ?? "";
      expect(row, name).toMatch(/CID TrueType\s+Identity-H\s+yes\s+yes\s+yes/);
    }
  });

  test("Ghostscript draws every page without a complaint", () => {
    test.skip(!has("gs"), "Ghostscript is not installed");
    const result = inTemp(sample(), (file) =>
      spawnSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=nullpage", file], { encoding: "utf8" }),
    );
    expect(result.stderr + result.stdout).not.toMatch(/error|warning|unrecoverable/i);
    expect(result.status).toBe(0);
  });
});
