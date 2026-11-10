import "../support/env";
import { test, expect } from "@playwright/test";
import { PdfBuilder, charWidth, encodeWinAnsi } from "@/lib/pdf/builder";
import { pdfDeclaredPages, pdfLinks, pdfPages, pdfProblems } from "../support/pdf";

// The PDF writer (task 0038): the text it can write, the text it can measure, and a file that is well formed.

const info = { title: "A title", author: "A school", producer: "Octalve Edu" };
const DATE = new Date("2026-11-10T12:00:00Z");

test.describe("encodeWinAnsi", () => {
  test("ASCII and Latin-1 letters are written as themselves", () => {
    expect(encodeWinAnsi("Abc 123").bytes).toEqual([...Buffer.from("Abc 123", "latin1")]);
    expect(encodeWinAnsi("Ñoño Ünal é").bytes).toEqual([...Buffer.from("Ñoño Ünal é", "latin1")]);
    expect(encodeWinAnsi("Abc").unsupported).toBe(0);
  });
  test("the Windows-1252 punctuation is written: curly quotes, dashes, the euro, an ellipsis", () => {
    expect(encodeWinAnsi("“A” – — € … ‘x’").bytes).toEqual([
      0x93, 0x41, 0x94, 0x20, 0x96, 0x20, 0x97, 0x20, 0x80, 0x20, 0x85, 0x20, 0x91, 0x78, 0x92,
    ]);
  });
  test("a letter with a mark WinAnsi lacks is written as its base letter (Yoruba), and a lone mark is dropped", () => {
    const yoruba = "ọ̀lá ẹ ṣ"; // ọ̀lá ẹ ṣ
    expect(Buffer.from(encodeWinAnsi(yoruba).bytes).toString("latin1")).toBe("olá e s");
    expect(encodeWinAnsi(yoruba).unsupported).toBe(0);
  });
  test("what cannot be shown is a question mark and is counted: Arabic, Chinese, an emoji", () => {
    const e = encodeWinAnsi("aا中😀b");
    expect(Buffer.from(e.bytes).toString("latin1")).toBe("a???b");
    expect(e.unsupported).toBe(3);
  });
  test("tabs and line ends are spaces and other control characters are refused (a question mark)", () => {
    expect(Buffer.from(encodeWinAnsi("a\tb\nc\rd").bytes).toString("latin1")).toBe("a b c d");
    expect(encodeWinAnsi("a\u0007b").unsupported).toBe(1);
  });
});

test.describe("measuring and wrapping", () => {
  test("widths come from the Helvetica tables: bold is wider, mono is 600, a size scales", () => {
    const pdf = new PdfBuilder(info);
    expect(charWidth(65, "regular")).toBe(667);
    expect(charWidth(105, "regular")).toBe(222);
    expect(charWidth(105, "bold")).toBe(278);
    expect(charWidth(65, "mono")).toBe(600);
    expect(pdf.width("Hi", "regular", 10)).toBeCloseTo(((722 + 222) * 10) / 1000, 5);
    expect(pdf.width("Hi", "bold", 20)).toBeCloseTo(((722 + 278) * 20) / 1000, 5);
    expect(pdf.width("Hello", "bold", 10)).toBeGreaterThan(pdf.width("Hello", "regular", 10));
  });
  test("a text wraps at word boundaries, never wider than the line, and keeps its own line ends", () => {
    const pdf = new PdfBuilder(info);
    const text = "The quick brown fox jumps over the lazy dog and keeps running";
    const lines = pdf.wrap(text, "regular", 10, 120);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(pdf.width(line, "regular", 10)).toBeLessThanOrEqual(120);
    expect(lines.join(" ")).toBe(text);
    expect(pdf.wrap("one\ntwo\n\nfour", "regular", 10, 500)).toEqual(["one", "two", "", "four"]);
    expect(pdf.wrap("a   b", "regular", 10, 500)).toEqual(["a b"]);
  });
  test("a word wider than a line is cut where it overflows, and nothing is lost", () => {
    const pdf = new PdfBuilder(info);
    const word = "W".repeat(60);
    const lines = pdf.wrap(word, "regular", 10, 100);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(pdf.width(line, "regular", 10)).toBeLessThanOrEqual(100);
    expect(lines.join("")).toBe(word);
  });
});

test.describe("the file", () => {
  test("a page with text, a rule and a box is a well-formed PDF whose text can be read back", () => {
    const pdf = new PdfBuilder(info);
    pdf.addPage();
    pdf.text(50, 800, "Hello Ñoño", { font: "bold", size: 14 });
    pdf.text(545, 780, "right", { align: "right" });
    pdf.text(300, 760, "middle", { align: "center", color: [1, 0, 0] });
    pdf.line(50, 700, 545, 700);
    pdf.rect(50, 600, 100, 50, { fill: [0.9, 0.9, 0.9], stroke: [0, 0, 0] });
    const file = pdf.build(DATE);
    expect(pdfProblems(file)).toEqual([]);
    expect(pdfDeclaredPages(file)).toBe(1);
    expect(pdfPages(file)).toEqual(["Hello Ñoño\nright\nmiddle"]);
    const raw = file.toString("latin1");
    expect(raw).toContain("/BaseFont /Helvetica-Bold");
    expect(raw).toContain("/Encoding /WinAnsiEncoding");
    expect(raw).toContain("/CreationDate (D:20261110120000Z)");
  });
  test("several pages, drawn in any order, each with its own content; the same input is the same file", () => {
    const make = () => {
      const pdf = new PdfBuilder(info);
      pdf.addPage();
      pdf.text(50, 800, "one");
      pdf.addPage();
      pdf.text(50, 800, "two");
      pdf.selectPage(0);
      pdf.text(50, 780, "one again");
      return pdf.build(DATE);
    };
    const file = make();
    expect(pdfProblems(file)).toEqual([]);
    expect(pdfDeclaredPages(file)).toBe(2);
    expect(pdfPages(file)).toEqual(["one\none again", "two"]);
    expect(make().equals(file)).toBe(true);
  });
  test("a document with no page still has one; drawing before a page exists, or on a page that does not, is refused", () => {
    expect(pdfDeclaredPages(new PdfBuilder(info).build(DATE))).toBe(1);
    const pdf = new PdfBuilder(info);
    expect(() => pdf.text(0, 0, "x")).toThrow(/Add a page first/);
    pdf.addPage();
    expect(() => pdf.selectPage(3)).toThrow(/No such page/);
  });
  test("a title with Latin-1 letters is stored as such, and the question marks of lost characters are counted in `unsupported`", () => {
    const pdf = new PdfBuilder({ ...info, title: "Rapport de Zoë" });
    pdf.addPage();
    pdf.text(50, 800, "a中b");
    expect(pdf.unsupported).toBe(1);
    expect(pdf.build(DATE).toString("latin1")).toContain(`/Title <${Buffer.from("Rapport de Zoë", "latin1").toString("hex")}>`);
  });
  test("text with parentheses and backslashes needs no escaping (it is written as hex)", () => {
    const pdf = new PdfBuilder(info);
    pdf.addPage();
    pdf.text(50, 800, "a (b) \\ c");
    const file = pdf.build(DATE);
    expect(pdfProblems(file)).toEqual([]);
    expect(pdfPages(file)).toEqual(["a (b) \\ c"]);
  });
});

test.describe("links", () => {
  test("a rectangle becomes a clickable link on its own page, and the file stays well formed", () => {
    const pdf = new PdfBuilder(info);
    pdf.addPage();
    pdf.text(50, 800, "first page");
    pdf.addPage();
    pdf.text(50, 800, "second page");
    expect(pdf.link(50, 790, 120, 12, "https://school.example/verify/abc")).toBe(true);
    pdf.selectPage(0);
    expect(pdf.link(60, 700, 80, 10, "http://localhost:3000/x")).toBe(true);
    const file = pdf.build(DATE);
    expect(pdfProblems(file)).toEqual([]);
    expect(pdfDeclaredPages(file)).toBe(2);
    expect(pdfLinks(file)).toEqual([
      { page: 0, url: "http://localhost:3000/x", rect: [60, 700, 140, 710] },
      { page: 1, url: "https://school.example/verify/abc", rect: [50, 790, 170, 802] },
    ]);
    // The document information is still where the trailer says it is.
    expect(file.toString("latin1")).toMatch(/\/Info \d+ 0 R/);
  });
  test("a page without a link has no annotations at all", () => {
    const pdf = new PdfBuilder(info);
    pdf.addPage();
    pdf.text(50, 800, "plain");
    expect(pdf.build(DATE).toString("latin1")).not.toContain("/Annots");
  });
  test("only a plain http(s) address is accepted: scripts, files, spaces and non-ASCII letters are left as text", () => {
    const pdf = new PdfBuilder(info);
    pdf.addPage();
    for (const bad of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://exa mple.com/",
      "https://\u00e9cole.example/",
      "//school.example/x",
      "",
      "https://",
    ])
      expect(pdf.link(0, 0, 10, 10, bad), bad).toBe(false);
    const file = pdf.build(DATE);
    expect(pdfLinks(file)).toEqual([]);
    expect(pdfProblems(file)).toEqual([]);
  });
  test("parentheses and backslashes in an address are escaped, so the file cannot be broken from inside a link", () => {
    const pdf = new PdfBuilder(info);
    pdf.addPage();
    const url = "https://school.example/a(b)c\\d?x=)>>/Evil<<";
    expect(pdf.link(0, 0, 10, 10, url)).toBe(true);
    const file = pdf.build(DATE);
    expect(pdfProblems(file)).toEqual([]);
    expect(pdfLinks(file).map((l) => l.url)).toEqual([url]);
    expect(file.toString("latin1").match(/\/Type \/Annot/g)).toHaveLength(1);
  });
});
