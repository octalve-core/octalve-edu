import { parseCsv, toCsv } from "@/lib/people/csv";
import type { SchemePart } from "./scheme";

// The pure rules of importing marks from a CSV file (task 0039): what a sheet looks like as a file, how a file is read against the sheet, and what would happen to each row. No database and no
// writing here: the service judges a file with this and, only when every row is fine, hands the new and changed rows to `recordStudentResults`, the single writer of marks.

export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_ROWS = 1000;

/// One column of marks: a part of the class's scheme (the components, then the exam), or, for a class with no scheme, the single mark.
export type MarkColumn = { name: string; maxScore: number };

/// The columns a sheet is entered in: the scheme's parts, or one "Mark" out of the total when the class has no parts.
export const markColumns = (parts: readonly SchemePart[], totalMax: number): MarkColumn[] =>
  parts.length > 0 ? parts.map((p) => ({ name: p.name, maxScore: p.maxScore })) : [{ name: "Mark", maxScore: totalMax }];

const number = (n: number) => String(Math.round(n * 100) / 100);
/// The header of a mark column as the template writes it: "Test 1 (20)".
export const columnHeader = (column: MarkColumn) => `${column.name} (${number(column.maxScore)})`;

/// A pupil on the roll of the class for the term, with what is saved: `marks` is aligned with the columns (null where a part is not saved).
export type RollEntry = {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  saved: { status: string; marks: (number | null)[] } | null;
};

/// The sheet as a CSV file: `admission_no`, `name`, a column per part, one row per pupil in the order given, the saved marks filled in (so a file can be edited and imported again, and importing it
/// unedited changes nothing). Every cell is neutralised against spreadsheet formulas by `toCsv`; the name is for the person and is never used to find a pupil. A leading byte-order mark is NOT
/// added here: the route adds it, so that a spreadsheet reads the names as UTF-8.
export function templateCsv(columns: readonly MarkColumn[], roll: readonly RollEntry[]): string {
  return toCsv([
    ["admission_no", "name", ...columns.map(columnHeader)],
    ...roll.map((p) => [
      p.admissionNo,
      `${p.firstName} ${p.lastName}`,
      ...columns.map((_, i) => {
        const mark = p.saved?.marks[i];
        return mark === null || mark === undefined ? "" : number(mark);
      }),
    ]),
  ]);
}

export type RowStatus = "new" | "changed" | "unchanged" | "blank" | "error";
export type PlanRow = {
  /// The row as a spreadsheet numbers it: the header is row 1.
  row: number;
  admissionNo: string;
  /// The pupil's name once the admission number has found them.
  name: string | null;
  status: RowStatus;
  /// The total of the marks in the file, and of what is saved, for the preview (null when not all there).
  total: number | null;
  savedTotal: number | null;
  /// One sentence for the person, for every status that is not simply new or changed.
  note: string | null;
  problems: string[];
};
export type Plan = {
  headerProblems: string[];
  rows: PlanRow[];
  counts: { rows: number; new: number; changed: number; unchanged: number; blank: number; errors: number };
  /// Pupils on the roll who have no row in the file (left as they are).
  notInFile: number;
  /// What would be written: the new and changed rows, as the marks in the order of the columns.
  entries: { studentId: string; marks: number[] }[];
};

const collapse = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
const key = (value: string) => collapse(value).replace(/[\s-]+/g, "_");
const hundredths = (n: number) => Math.round(n * 100);
const MARK = /^\d+(\.\d{1,2})?$/;
const WITH_MAX = /^(.*?)\s*\(\s*(\d+(?:\.\d{1,2})?)\s*\)$/;

/// What a result that has left DRAFT is called in a sentence.
const WORD: Record<string, string> = {
  SUBMITTED: "sent for review",
  APPROVED: "approved",
  PUBLISHED: "published",
  LOCKED: "locked",
};

/// Reads a file against a sheet. A problem with the header (a missing or unknown column, a part with another maximum, a file that is not CSV) is reported and no row is judged; otherwise every row is
/// judged and every problem is reported, so a person can fix the whole file at once.
export function planImport(text: string, columns: readonly MarkColumn[], roll: readonly RollEntry[]): Plan {
  const empty = (headerProblems: string[]): Plan => ({
    headerProblems,
    rows: [],
    counts: { rows: 0, new: 0, changed: 0, unchanged: 0, blank: 0, errors: 0 },
    notInFile: roll.length,
    entries: [],
  });
  const parsed = parseCsv(text);
  if (!parsed.ok) return empty([`The file is not a valid CSV file (line ${parsed.line}): ${parsed.message}`]);
  const [header, ...body] = parsed.rows;
  if (!header) return empty(["The file is empty. Start from the template: it has the header this class's marks need."]);

  // ---- the header ----
  const problems: string[] = [];
  const single = columns.length === 1 && columns[0].name === "Mark";
  const columnOf: (number | null)[] = columns.map(() => null);
  let admissionAt: number | null = null;
  const ignored = new Set<number>();
  const blankColumn = (i: number) => body.every((r) => (r[i] ?? "").trim() === "");
  const sheetHas = ["admission_no", "name", ...columns.map(columnHeader)].join(", ");
  header.forEach((raw, i) => {
    if (raw.trim() === "") {
      // A spreadsheet often leaves empty columns at the end: harmless when nothing is in them.
      if (blankColumn(i)) ignored.add(i);
      else problems.push(`Column ${i + 1} has values but no name. This sheet has: ${sheetHas}.`);
      return;
    }
    const k = key(raw);
    if (k === "admission_no" || k === "admission_number") {
      if (admissionAt !== null) problems.push("The admission_no column is in the file twice.");
      else admissionAt = i;
      return;
    }
    if (k === "name" || k === "pupil" || k === "student") {
      ignored.add(i);
      return;
    }
    const withMax = WITH_MAX.exec(raw.trim());
    const wanted = collapse(withMax ? withMax[1] : raw);
    const at = columns.findIndex((c, j) => collapse(c.name) === wanted || (single && j === 0 && (wanted === "mark" || wanted === "score")));
    if (at < 0) {
      problems.push(`Unknown column "${raw.trim()}". This sheet has: ${sheetHas}.`);
      return;
    }
    if (columnOf[at] !== null) {
      problems.push(`"${columns[at].name}" is in the file twice.`);
      return;
    }
    if (withMax && hundredths(Number(withMax[2])) !== hundredths(columns[at].maxScore))
      problems.push(
        `"${columns[at].name}" is out of ${number(columns[at].maxScore)} in this class's scheme; the file says ${number(Number(withMax[2]))}.`,
      );
    columnOf[at] = i;
  });
  if (admissionAt === null) problems.push("The file needs an admission_no column.");
  columns.forEach((c, j) => {
    if (columnOf[j] === null) problems.push(`The file needs a column for "${columnHeader(c)}".`);
  });
  if (problems.length > 0) return empty(problems);
  if (body.every((r) => r.every((c) => c.trim() === ""))) return empty(["The file has a header and no pupils."]);

  // ---- the pupils: an exact admission number first, then ignoring case and spacing ----
  const exact = new Map(roll.map((p) => [p.admissionNo, p]));
  const loose = new Map<string, RollEntry[]>();
  for (const p of roll) loose.set(collapse(p.admissionNo), [...(loose.get(collapse(p.admissionNo)) ?? []), p]);

  const rows: PlanRow[] = [];
  const entries: Plan["entries"] = [];
  const firstRowOf = new Map<string, number>();
  body.forEach((cells, index) => {
    if (cells.every((c) => c.trim() === "")) return; // a blank line a spreadsheet left behind
    const row = index + 2;
    const admissionNo = (cells[admissionAt!] ?? "").trim();
    const out: PlanRow = { row, admissionNo, name: null, status: "error", total: null, savedTotal: null, note: null, problems: [] };
    rows.push(out);
    const bad = (message: string) => out.problems.push(message);

    if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim() !== ""))
      bad(`This row has ${cells.length} values but the header has ${header.length} columns.`);

    let pupil: RollEntry | undefined;
    if (admissionNo === "") bad("Give the admission number.");
    else {
      pupil = exact.get(admissionNo);
      if (!pupil) {
        const candidates = loose.get(collapse(admissionNo)) ?? [];
        if (candidates.length === 1) pupil = candidates[0];
        else if (candidates.length > 1)
          bad("More than one pupil on this roll has a number like this. Write it exactly as it is printed on the sheet.");
        else bad("No pupil with this admission number is on the roll of this class for this term.");
      }
    }
    if (pupil) {
      out.name = `${pupil.firstName} ${pupil.lastName}`;
      const before = firstRowOf.get(pupil.studentId);
      if (before !== undefined) bad(`This pupil is already in row ${before}.`);
      else firstRowOf.set(pupil.studentId, row);
    }

    // ---- the marks ----
    const typed = columns.map((_, j) => (cells[columnOf[j]!] ?? "").trim());
    const given = typed.filter((t) => t !== "").length;
    const marks: number[] = [];
    columns.forEach((c, j) => {
      const t = typed[j];
      if (t === "") return;
      if (!MARK.test(t)) return bad(`${c.name}: use a number with at most two decimals (no commas, no % sign).`);
      if (Number(t) > c.maxScore) return bad(`${c.name}: at most ${number(c.maxScore)}.`);
      marks[j] = Number(t);
    });
    if (given > 0 && given < columns.length) bad("Fill every part, or leave the whole row blank.");

    if (out.problems.length > 0) {
      out.status = "error";
      return;
    }
    if (given === 0) {
      out.status = "blank";
      out.note = "No marks: left as it is.";
      return;
    }
    out.total = Math.round(marks.reduce((a, b) => a + b, 0) * 100) / 100;
    const saved = pupil!.saved;
    if (saved && saved.marks.every((m) => m !== null))
      out.savedTotal = Math.round((saved.marks as number[]).reduce((a, b) => a + b, 0) * 100) / 100;
    const same = saved !== null && marks.every((m, j) => saved.marks[j] !== null && hundredths(saved.marks[j]!) === hundredths(m));
    if (saved === null) {
      out.status = "new";
    } else if (same) {
      out.status = "unchanged";
      out.note = "Already saved with these marks.";
    } else if (saved.status === "DRAFT") {
      out.status = "changed";
    } else {
      out.status = "error";
      bad(
        `This pupil's marks are ${WORD[saved.status] ?? saved.status.toLowerCase()}, so they cannot be changed here. They must be back in draft first.`,
      );
      return;
    }
    if (out.status === "new" || out.status === "changed") entries.push({ studentId: pupil!.studentId, marks });
  });

  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const counts = {
    rows: rows.length,
    new: count("new"),
    changed: count("changed"),
    unchanged: count("unchanged"),
    blank: count("blank"),
    errors: count("error"),
  };
  return { headerProblems: [], rows, counts, notInFile: roll.length - firstRowOf.size, entries };
}
