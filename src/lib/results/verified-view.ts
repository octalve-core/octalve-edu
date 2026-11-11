// What the public page says about a code (task 0043): a published mark, a school's vocational certificate or a certificate of completion of a program, each as a heading, a sentence and the
// rows the public API already makes public: nothing more. Pure, so the words are tested without a browser.

export type MarkAnswer = {
  institution: string;
  studentName: string;
  academicSession: string;
  academicPeriod: string;
  subject: string;
  gradeLetter: string | null;
  publishedAt: string | null;
};
export type VocationalAnswer = {
  verified: boolean;
  certificateNo: string;
  title: string;
  studentName: string;
  institution: string;
  issueDate: string;
  sessionPeriod: string | null;
};
export type ProgramAnswer = {
  kind: "PROGRAM_CERTIFICATE";
  genuine: true;
  withdrawn: boolean;
  school: string;
  program: string;
  title: string;
  person: string;
  completedOn: string;
  issuedOn: string;
  serialNo: string;
};

/// What the page reads from the two public routes, tagged by which one answered.
export type Found = { kind: "MARK"; data: MarkAnswer } | { kind: "CERTIFICATE"; data: VocationalAnswer | ProgramAnswer };

/// "10 December 2093" from an ISO date or date-time (a date alone is read as that day in UTC, as the API means it); `null` when it is not a date.
export function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export type View = {
  /// "good": a genuine thing; "warn": a certificate that was withdrawn or does not match; the page draws the heading with a tick for the first and as a warning for the second.
  tone: "good" | "warn";
  heading: string;
  lead: string;
  rows: [string, string][];
};

const rowsOf = (rows: [string, string | null | undefined][]): [string, string][] =>
  rows.filter((r): r is [string, string] => typeof r[1] === "string" && r[1] !== "");

const isProgram = (data: VocationalAnswer | ProgramAnswer): data is ProgramAnswer => (data as ProgramAnswer).kind === "PROGRAM_CERTIFICATE";

export function describe(found: Found): View {
  if (found.kind === "MARK") {
    const c = found.data;
    return {
      tone: "good",
      heading: "This mark is genuine",
      lead: "The school below published this result.",
      rows: rowsOf([
        ["School", c.institution],
        ["Pupil", c.studentName],
        ["Session", c.academicSession],
        ["Term", c.academicPeriod],
        ["Subject", c.subject],
        ["Grade", c.gradeLetter],
        ["Published on", longDate(c.publishedAt)],
      ]),
    };
  }
  const data = found.data;
  if (isProgram(data)) {
    if (data.withdrawn)
      return {
        tone: "warn",
        heading: "This certificate was withdrawn",
        lead: "The school withdrew this certificate and it is no longer valid. Do not rely on it; contact the school.",
        rows: rowsOf([
          ["School", data.school],
          ["Number", data.serialNo],
        ]),
      };
    return {
      tone: "good",
      heading: "This certificate is genuine",
      lead: "The school below issued this certificate. This page shows no marks and no personal details beyond the name.",
      rows: rowsOf([
        ["School", data.school],
        ["Program", data.program],
        ["Certificate", data.title],
        ["Awarded to", data.person],
        ["Completed on", longDate(data.completedOn)],
        ["Issued on", longDate(data.issuedOn)],
        ["Number", data.serialNo],
      ]),
    };
  }
  if (!data.verified)
    return {
      tone: "warn",
      heading: "This code does not match the school's record",
      lead: "This code exists, but the certificate it points to does not match what the school recorded. Do not rely on this document; contact the school.",
      rows: [],
    };
  return {
    tone: "good",
    heading: "This certificate is genuine",
    lead: "The school below issued this certificate.",
    rows: rowsOf([
      ["School", data.institution],
      ["Awarded to", data.studentName],
      ["Certificate", data.title],
      ["Number", data.certificateNo],
      ["Issued on", longDate(data.issueDate)],
      ["Session", data.sessionPeriod],
    ]),
  };
}
