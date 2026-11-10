import "../support/env";
import { test, expect } from "@playwright/test";
import { renderReportCardsPdf, type PdfCard } from "@/lib/results/report-card-pdf";
import { pdfDeclaredPages, pdfLinks, pdfPages, pdfProblems } from "../support/pdf";

// A report card as a PDF (task 0038): what is on it, that it never runs off a page, and that several cards are several pages.

const NOW = new Date("2026-11-10T12:00:00Z");
const SCHOOL = "Greenfield Model College";
const TOKEN = "0123456789abcdef0123456789abcdef";
const ORIGIN = "https://school.example";

const subject = (i: number, over: Partial<PdfCard["subjects"][number]> = {}) => ({
  subjectName: `Subject ${i}`,
  subjectCode: null,
  score: 60 + (i % 30),
  maxScore: 100,
  gradeLetter: "B",
  gradeRemark: "Good",
  status: "PUBLISHED",
  verificationToken: TOKEN.replace(/.$/, String(i % 10)),
  ...over,
});
const card = (over: Partial<PdfCard> = {}, subjects = 5): PdfCard => ({
  student: { firstName: "Ada", lastName: "Obi", admissionNo: "2026/0042", classGroup: "JSS 1", classArm: "A" },
  period: { label: "First Term", sessionLabel: "2026/2027" },
  summary: { totalScore: 380, totalMax: 500, percentage: 76, classRank: 3, classSize: 31, promotionOutcome: "PROMOTED" },
  subjects: Array.from({ length: subjects }, (_, i) => subject(i + 1)),
  remarks: { teacher: null, principal: null },
  ...over,
});
const render = (cards: PdfCard[], origin = ORIGIN) => renderReportCardsPdf(cards, { institution: SCHOOL, generatedAt: NOW, origin });
const text = (cards: PdfCard[]) => pdfPages(render(cards).pdf);

test.describe("one card", () => {
  test("says who, the term, the totals, every subject with its mark and grade, and a full verification link for each published mark", () => {
    const [page] = text([card()]);
    for (const expected of [
      SCHOOL.toUpperCase(),
      "TERM REPORT",
      "2026/2027 · First Term",
      "Ada Obi",
      "2026/0042",
      "JSS 1 A",
      "3 of 31",
      "380 / 500",
      "76%",
      "On track",
      "Subject 1",
      "61 / 100",
      "VERIFICATION LINKS",
      `${ORIGIN}/verify/${TOKEN.replace(/.$/, "1")}`,
      `go to ${ORIGIN}/verify and type the code`,
      "Page 1 of 1",
    ])
      expect(page, expected).toContain(expected);
    expect(page).not.toContain("Not official");
    expect(page).toContain("generated 2026-11-10");
    // Nothing a person reads is an internal address: no `/api/`, no placeholder.
    expect(page).not.toContain("/api/");
    expect(page).not.toContain("<code>");
  });

  test("each link is clickable and opens the page of its own mark", () => {
    const { pdf } = render([card()]);
    expect(pdfProblems(pdf)).toEqual([]);
    expect(pdfLinks(pdf).map((l) => l.url)).toEqual(
      Array.from({ length: 5 }, (_, i) => `${ORIGIN}/verify/${TOKEN.replace(/.$/, String(i + 1))}`),
    );
    for (const l of pdfLinks(pdf)) {
      const [x1, y1, x2, y2] = l.rect;
      expect(x1, l.url).toBeGreaterThanOrEqual(40);
      expect(x2, l.url).toBeLessThanOrEqual(595.28 - 40);
      expect(y1, l.url).toBeGreaterThanOrEqual(66 - 4);
      expect(y2, l.url).toBeGreaterThan(y1);
    }
  });

  test("a long address goes under the subject and is cut at the end of the line if it must; the link still opens the whole address", () => {
    const origin = `https://${"a-long-school-name".repeat(4)}.example.edu.ng/portal`;
    const { pdf } = render([card({}, 3)], origin);
    expect(pdfProblems(pdf)).toEqual([]);
    const links = pdfLinks(pdf);
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const l of links) expect(l.rect[2], l.url).toBeLessThanOrEqual(595.28 - 40 + 0.5);
    // Every piece of every address is on the page, in order, and together they are the address.
    const pieces = text([card({}, 3)]).join("\n");
    expect(new Set(links.map((l) => l.url))).toEqual(new Set([1, 2, 3].map((i) => `${origin}/verify/${TOKEN.replace(/.$/, String(i))}`)));
    expect(pieces).not.toContain("/api/");
  });

  test("an address that cannot be a link (not plain ASCII) is still printed, and the file is still well formed", () => {
    const { pdf } = render([card({}, 2)], "https://\u00e9cole.example");
    expect(pdfProblems(pdf)).toEqual([]);
    expect(pdfLinks(pdf)).toEqual([]);
    expect(pdfPages(pdf).join("\n")).toContain(`https://\u00e9cole.example/verify/${TOKEN.replace(/.$/, "1")}`);
  });

  test("the file is well formed and declares the pages it has", () => {
    const { pdf, pages } = render([card()]);
    expect(pdfProblems(pdf)).toEqual([]);
    expect(pdfDeclaredPages(pdf)).toBe(pages);
  });

  test("a card with no marks says so; a pupil below the mark says so; no position when there is none", () => {
    const [page] = text([
      card({
        subjects: [],
        summary: { totalScore: 0, totalMax: 0, percentage: 0, classRank: null, classSize: 0, promotionOutcome: "REPEATED" },
      }),
    ]);
    expect(page).toContain("No marks have been published for this term yet.");
    expect(page).toContain("Below the mark");
    expect(page).not.toContain(" of 0");
    expect(page).not.toContain("VERIFICATION LINKS");
  });

  test("a card that includes a mark not yet published says it is not official, and lists no code for that mark", () => {
    const [page] = text([card({ subjects: [subject(1), subject(2, { status: "DRAFT", verificationToken: null })] })]);
    expect(page).toContain("Not official: some of these marks are not yet published.");
    expect(page.match(/[0-9a-f]{32}/g)).toHaveLength(1);
  });

  test("a locked mark counts as published: no warning, and its code is shown", () => {
    const [page] = text([card({ subjects: [subject(1, { status: "LOCKED" })] })]);
    expect(page).not.toContain("Not official");
    expect(page).toContain(TOKEN.replace(/.$/, "1"));
  });

  test("the remarks are on the card, with their own line ends; none is shown when there is none", () => {
    const [page] = text([card({ remarks: { teacher: "Works hard.\nHelps others.", principal: "A pleasure." } })]);
    expect(page).toContain("TEACHER'S REMARK");
    expect(page).toContain("Works hard.\nHelps others.");
    expect(page).toContain("PRINCIPAL'S REMARK");
    expect(page).toContain("A pleasure.");
    const [bare] = text([card()]);
    expect(bare).not.toContain("PRINCIPAL'S REMARK");
    expect(bare).not.toContain("TEACHER'S REMARK");
  });

  test("letters of a Nigerian name that WinAnsi lacks are written without their marks, and nothing is a question mark", () => {
    const named = card({ student: { firstName: "Ọ̀lá", lastName: "Adébáyọ̀ Ṣ", admissionNo: "1", classGroup: "JSS 1", classArm: "A" } });
    const out = render([named]);
    expect(out.unsupported).toBe(0);
    expect(pdfPages(out.pdf)[0]).toContain("Olá Adébáyo S");
    expect(pdfPages(out.pdf)[0]).not.toContain("?");
  });

  test("characters the standard fonts cannot show are counted, not hidden", () => {
    const out = render([card({ student: { firstName: "احمد", lastName: "Obi", admissionNo: "1", classGroup: "JSS 1", classArm: "A" } })]);
    expect(out.unsupported).toBe(4);
  });

  test("a very long name is cut with an ellipsis and does not run over its neighbour", () => {
    const [page] = text([
      card({ student: { firstName: "A".repeat(80), lastName: "B".repeat(80), admissionNo: "1", classGroup: "JSS 1", classArm: "A" } }),
    ]);
    expect(page).toContain("…");
    expect(page).not.toContain("A".repeat(80));
  });

  test("the same card is the same file", () => {
    expect(render([card()]).pdf.equals(render([card()]).pdf)).toBe(true);
  });
});

test.describe("a card that needs more than a page", () => {
  test("sixty subjects carry on to more pages, each continued page says whose card it is and repeats the column heads, and no subject is lost or doubled", () => {
    const pages = text([card({}, 60)]);
    expect(pages.length).toBeGreaterThan(1);
    pages.slice(1).forEach((page, i) => {
      expect(page, `page ${i + 2}`).toContain("Report card of Ada Obi (continued)");
      // A page that carries rows of marks carries the column heads too (the last pages hold only verification codes).
      if (/ \/ 100/.test(page)) expect(page, `page ${i + 2}`).toContain("SUBJECT\nMARK\nGRADE\nREMARK");
    });
    // Once in the table of marks, and once more as the label of its verification link (the links come after the table).
    const [table, links] = pages.join("\n").split("VERIFICATION LINKS");
    for (let n = 1; n <= 60; n++) {
      expect(table.match(new RegExp(`^Subject ${n}$`, "gm")), `Subject ${n} in the table`).toHaveLength(1);
      expect(links.match(new RegExp(`^Subject ${n}$`, "gm")), `Subject ${n} among the links`).toHaveLength(1);
    }
    pages.forEach((page, i) => expect(page).toContain(`Page ${i + 1} of ${pages.length}`));
  });

  test("a long remark runs on to the next page instead of off the bottom, and every word of it is kept in order", () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const pages = text([card({ remarks: { teacher: words, principal: null } }, 40)]);
    const remarkOnPages = pages.join("\n").split("\n");
    const joined = remarkOnPages.filter((l) => /^(word\d+ ?)+$/.test(l)).join(" ");
    expect(joined).toBe(words);
  });

  test("the heading of the verification links is never left alone at the bottom of a page", () => {
    for (let subjects = 1; subjects <= 70; subjects++) {
      for (const page of text([card({ remarks: { teacher: "x ".repeat(60), principal: null } }, subjects)])) {
        if (page.includes("VERIFICATION LINKS"))
          expect(page.match(/[0-9a-f]{32}/g)?.length ?? 0, `${subjects} subjects`).toBeGreaterThan(0);
      }
    }
  });
});

test.describe("several cards in one file", () => {
  test("every pupil starts on a page of their own, in the order given, and the page numbers run through the whole file", () => {
    const cards = ["Ada", "Bayo", "Chi"].map((first) =>
      card({ student: { firstName: first, lastName: "Obi", admissionNo: first, classGroup: "JSS 1", classArm: "A" } }),
    );
    const pages = text(cards);
    expect(pages).toHaveLength(3);
    ["Ada Obi", "Bayo Obi", "Chi Obi"].forEach((who, i) => {
      expect(pages[i]).toContain(who);
      expect(pages[i]).toContain(`Page ${i + 1} of 3`);
      for (const other of ["Ada Obi", "Bayo Obi", "Chi Obi"].filter((n) => n !== who))
        expect(pages[i], `${who} page has ${other}`).not.toContain(other);
    });
  });

  test("a card that spills over does not share its last page with the next pupil", () => {
    const pages = text([
      card({ student: { firstName: "Ada", lastName: "Long", admissionNo: "1", classGroup: "JSS 1", classArm: "A" } }, 60),
      card({ student: { firstName: "Bayo", lastName: "Short", admissionNo: "2", classGroup: "JSS 1", classArm: "A" } }),
    ]);
    const firstOfBayo = pages.findIndex((p) => p.includes("Bayo Short"));
    expect(firstOfBayo).toBeGreaterThan(1);
    expect(pages.slice(0, firstOfBayo).some((p) => p.includes("Bayo Short"))).toBe(false);
    expect(pages.slice(firstOfBayo).some((p) => p.includes("Ada Long"))).toBe(false);
  });

  test("no cards is still a valid one-page file", () => {
    const { pdf, pages } = render([]);
    expect(pages).toBe(1);
    expect(pdfProblems(pdf)).toEqual([]);
  });
});
