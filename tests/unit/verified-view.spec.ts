import "../support/env";
import { test, expect } from "@playwright/test";
import { wantsPage } from "@/lib/api/wants-page";
import { describe, longDate, type MarkAnswer, type ProgramAnswer, type VocationalAnswer } from "@/lib/results/verified-view";

// What the public page says about a code (task 0043): a mark, a vocational certificate and a certificate of completion of a program, as a heading, a sentence and rows, with no more than the
// public API already says; and which requests a browser's navigation is (so an old printed address can be sent to the page).

const MARK: MarkAnswer = {
  institution: "Greenfield College",
  studentName: "Ada Obi",
  academicSession: "2026/2027",
  academicPeriod: "First Term",
  subject: "Mathematics",
  gradeLetter: "A",
  publishedAt: "2026-12-10T10:00:00.000Z",
};
const VOCATIONAL: VocationalAnswer = {
  verified: true,
  certificateNo: "OCT-VOC-2026-00042",
  title: "Certificate in Welding",
  studentName: "Ngozi Eze",
  institution: "Greenfield College",
  issueDate: "2026-11-05T00:00:00.000Z",
  sessionPeriod: "Second Term",
};
const PROGRAM: ProgramAnswer = {
  kind: "PROGRAM_CERTIFICATE",
  genuine: true,
  withdrawn: false,
  school: "Greenfield College",
  program: "Quran Memorisation",
  title: "Certificate of Completion",
  person: "Ibrahim B.",
  completedOn: "2026-10-01",
  issuedOn: "2026-10-03",
  serialNo: "CERT-0007",
};
const labels = (rows: [string, string][]) => rows.map(([label]) => label);

test.describe("a published mark", () => {
  test("is genuine, with the school, pupil, session, term, subject, grade and the day it was published", () => {
    const view = describe({ kind: "MARK", data: MARK });
    expect(view).toMatchObject({ tone: "good", heading: "This mark is genuine" });
    expect(view.rows).toEqual([
      ["School", "Greenfield College"],
      ["Pupil", "Ada Obi"],
      ["Session", "2026/2027"],
      ["Term", "First Term"],
      ["Subject", "Mathematics"],
      ["Grade", "A"],
      ["Published on", "10 December 2026"],
    ]);
  });
  test("leaves out a grade and a date that are not there", () => {
    const view = describe({ kind: "MARK", data: { ...MARK, gradeLetter: null, publishedAt: null } });
    expect(labels(view.rows)).toEqual(["School", "Pupil", "Session", "Term", "Subject"]);
  });
});

test.describe("a school's vocational certificate", () => {
  test("is genuine, with the school, who it was awarded to, its title, number, issue day and session", () => {
    const view = describe({ kind: "CERTIFICATE", data: VOCATIONAL });
    expect(view).toMatchObject({ tone: "good", heading: "This certificate is genuine" });
    expect(view.rows).toEqual([
      ["School", "Greenfield College"],
      ["Awarded to", "Ngozi Eze"],
      ["Certificate", "Certificate in Welding"],
      ["Number", "OCT-VOC-2026-00042"],
      ["Issued on", "5 November 2026"],
      ["Session", "Second Term"],
    ]);
  });
  test("has no session row when it has no session", () => {
    expect(labels(describe({ kind: "CERTIFICATE", data: { ...VOCATIONAL, sessionPeriod: null } }).rows)).not.toContain("Session");
  });
  test("whose fingerprint does not match the school's record is a warning with no details at all", () => {
    const view = describe({ kind: "CERTIFICATE", data: { ...VOCATIONAL, verified: false } });
    expect(view.tone).toBe("warn");
    expect(view.heading).toBe("This code does not match the school's record");
    expect(view.lead).toContain("Do not rely on this document");
    expect(view.rows).toEqual([]);
  });
});

test.describe("a certificate of completion of a program", () => {
  test("is genuine, with the school, program, title, the person as the API gives them, both days and the number", () => {
    const view = describe({ kind: "CERTIFICATE", data: PROGRAM });
    expect(view).toMatchObject({ tone: "good", heading: "This certificate is genuine" });
    expect(view.rows).toEqual([
      ["School", "Greenfield College"],
      ["Program", "Quran Memorisation"],
      ["Certificate", "Certificate of Completion"],
      ["Awarded to", "Ibrahim B."],
      ["Completed on", "1 October 2026"],
      ["Issued on", "3 October 2026"],
      ["Number", "CERT-0007"],
    ]);
  });
  test("that was withdrawn says so, is a warning, and shows only the school and the number", () => {
    const view = describe({ kind: "CERTIFICATE", data: { ...PROGRAM, withdrawn: true } });
    expect(view.tone).toBe("warn");
    expect(view.heading).toBe("This certificate was withdrawn");
    expect(view.lead).toContain("no longer valid");
    expect(view.rows).toEqual([
      ["School", "Greenfield College"],
      ["Number", "CERT-0007"],
    ]);
    expect(JSON.stringify(view)).not.toContain("Ibrahim");
  });
});

test.describe("what is never shown", () => {
  test("a certificate's free-form metadata and a mark's score are not in any answer", () => {
    const withExtras = { ...VOCATIONAL, metadata: { honours: "First class", secret: "x" }, score: 91.5 } as unknown as VocationalAnswer;
    const text = JSON.stringify(describe({ kind: "CERTIFICATE", data: withExtras }));
    expect(text).not.toContain("honours");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("91.5");
    const mark = { ...MARK, score: 91.5, admissionNo: "ADM-SECRET" } as unknown as MarkAnswer;
    expect(JSON.stringify(describe({ kind: "MARK", data: mark }))).not.toMatch(/91\.5|ADM-SECRET/);
  });
});

test.describe("longDate", () => {
  test("reads a date alone as that day in UTC, and a date-time as its UTC day; anything else is nothing", () => {
    expect(longDate("2026-01-05")).toBe("5 January 2026");
    expect(longDate("2026-01-05T23:59:59.000Z")).toBe("5 January 2026");
    expect(longDate("")).toBeNull();
    expect(longDate(null)).toBeNull();
    expect(longDate("not a date")).toBeNull();
  });
});

test.describe("which requests are a browser asking for a page", () => {
  test("a navigation (text/html among its types) is; a script, curl, a JSON fetch and no header are not", () => {
    for (const accept of [
      "text/html",
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "application/xhtml+xml, TEXT/HTML;q=0.9",
      " text/html ; q=1 ",
    ])
      expect(wantsPage(accept), accept).toBe(true);
    for (const accept of [
      undefined,
      null,
      "",
      "*/*",
      "application/json",
      "application/json, text/plain, */*",
      "text/html;q=0",
      "text/htmlx",
      "image/*",
    ])
      expect(wantsPage(accept), String(accept)).toBe(false);
  });
});
