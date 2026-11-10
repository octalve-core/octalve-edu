import "../support/env";
import { test, expect } from "@playwright/test";
import { columnHeader, markColumns, planImport, templateCsv, type MarkColumn, type RollEntry } from "@/lib/results/mark-import";
import { parseCsv } from "@/lib/people/csv";

// Importing marks from a file (task 0039), the pure rules: what a sheet looks like as a file, how a file is read against the sheet, and what would happen to each row.

const PARTS: MarkColumn[] = [
  { name: "CA 1", maxScore: 20 },
  { name: "CA 2", maxScore: 20 },
  { name: "Exam", maxScore: 60 },
];
const HEADER = "admission_no,name,CA 1 (20),CA 2 (20),Exam (60)";

const pupil = (adm: string, first: string, saved: RollEntry["saved"] = null): RollEntry => ({
  studentId: `id-${adm}`,
  admissionNo: adm,
  firstName: first,
  lastName: "Obi",
  saved,
});
const roll = (): RollEntry[] => [
  pupil("A/1", "Ada"),
  pupil("A/2", "Bayo", { status: "DRAFT", marks: [10, 12, 40] }),
  pupil("A/3", "Chi", { status: "SUBMITTED", marks: [15, 15, 50] }),
  pupil("A/4", "Dayo", { status: "PUBLISHED", marks: [20, 20, 60] }),
];
const plan = (text: string, columns = PARTS, rolled = roll()) => planImport(text, columns, rolled);
const file = (...lines: string[]) => `${HEADER}\n${lines.join("\n")}\n`;
const only = (text: string) => plan(text).rows.map((r) => `${r.row}:${r.status}`);

test.describe("the template", () => {
  test("is the sheet: a header with each part and its maximum, a row per pupil in order, saved marks filled in", () => {
    const rows = parseCsv(templateCsv(PARTS, roll()));
    expect(rows.ok && rows.rows).toEqual([
      ["admission_no", "name", "CA 1 (20)", "CA 2 (20)", "Exam (60)"],
      ["A/1", "Ada Obi", "", "", ""],
      ["A/2", "Bayo Obi", "10", "12", "40"],
      ["A/3", "Chi Obi", "15", "15", "50"],
      ["A/4", "Dayo Obi", "20", "20", "60"],
    ]);
  });
  test("a class with no scheme has one column, Mark, out of the total", () => {
    const columns = markColumns([], 100);
    expect(columns).toEqual([{ name: "Mark", maxScore: 100 }]);
    expect(columnHeader(columns[0])).toBe("Mark (100)");
    const rows = parseCsv(templateCsv(columns, [pupil("A/1", "Ada", { status: "DRAFT", marks: [72.5] })]));
    expect(rows.ok && rows.rows).toEqual([
      ["admission_no", "name", "Mark (100)"],
      ["A/1", "Ada Obi", "72.5"],
    ]);
  });
  test("a part's maximum with decimals is written as it is, and a part with a comma in its name is quoted", () => {
    const text = templateCsv([{ name: "Quiz, weekly", maxScore: 12.5 }], [pupil("A/1", "Ada")]);
    expect(text.split("\r\n")[0]).toBe('admission_no,name,"Quiz, weekly (12.5)"');
  });
  test("every cell is neutralised against spreadsheet formulas: a name or number that starts like a formula is written as text", () => {
    const text = templateCsv(PARTS, [pupil("=1+1", "=HYPERLINK(1)"), pupil("@A", "+cmd"), pupil("-2", "\tTab")]);
    for (const cell of ["'=1+1", "'=HYPERLINK(1) Obi", "'@A", "'+cmd Obi", "'-2"]) expect(text, cell).toContain(cell);
    expect(text).not.toMatch(/(^|,)[=@+\-\t]/m);
  });
  test("a file that was just downloaded, imported unedited, changes nothing and has no problem", () => {
    const p = plan(templateCsv(PARTS, roll()));
    expect(p.headerProblems).toEqual([]);
    expect(p.counts).toEqual({ rows: 4, new: 0, changed: 0, unchanged: 3, blank: 1, errors: 0 });
    expect(p.entries).toEqual([]);
    expect(p.notInFile).toBe(0);
  });
});

test.describe("the header", () => {
  test("a part may be written with or without its maximum, in any case and spacing, in any order, with the name column ignored", () => {
    for (const header of [
      "admission_no,ca 1,ca 2,exam",
      "Admission No,Exam (60),CA  2 (20),ca 1(20)",
      "admission-number,name,CA 1 (20.00),CA 2,EXAM (60)",
      "ADMISSION_NO,pupil,CA 1,CA 2,Exam",
    ]) {
      const cols = header.split(",");
      const row = cols.map((c) => (/^(admission|ADMISSION)/i.test(c) ? "A/1" : /^(name|pupil)$/i.test(c) ? "Whoever" : "5")).join(",");
      const p = plan(`${header}\n${row}\n`);
      expect(p.headerProblems, header).toEqual([]);
      expect(p.counts.new, header).toBe(1);
      expect(p.entries[0].marks, header).toEqual([5, 5, 5]);
    }
  });
  test("the marks follow the scheme's order, whatever order the file's columns are in", () => {
    const p = plan("admission_no,Exam,CA 2,CA 1\nA/1,50,12,8\n");
    expect(p.entries).toEqual([{ studentId: "id-A/1", marks: [8, 12, 50] }]);
  });
  test("a Windows file (CRLF) with a byte-order mark and quoted cells reads the same", () => {
    const bom = String.fromCharCode(0xfeff);
    const p = plan(`${bom}"admission_no","CA 1 (20)","CA 2 (20)","Exam (60)"\r\n"A/1","10","10","10"\r\n`);
    expect(p.headerProblems).toEqual([]);
    expect(p.counts.new).toBe(1);
  });
  test("a missing admission_no column, a missing part, an unknown column, a repeated column and a wrong maximum are each said, and no row is judged", () => {
    const cases: [string, RegExp][] = [
      ["CA 1,CA 2,Exam\n1,2,3\n", /needs an admission_no column/],
      ["admission_no,CA 1,CA 2\nA/1,1,2\n", /needs a column for "Exam \(60\)"/],
      [
        "admission_no,CA 1,CA 2,Exam,Behaviour\nA/1,1,2,3,4\n",
        /Unknown column "Behaviour"\. This sheet has: admission_no, name, CA 1 \(20\)/,
      ],
      ["admission_no,CA 1,CA 2,Exam,CA 1\nA/1,1,2,3,4\n", /"CA 1" is in the file twice/],
      ["admission_no,admission_no,CA 1,CA 2,Exam\nA/1,A/1,1,2,3\n", /admission_no column is in the file twice/],
      ["admission_no,CA 1 (30),CA 2,Exam\nA/1,1,2,3\n", /"CA 1" is out of 20 in this class's scheme; the file says 30/],
    ];
    for (const [text, message] of cases) {
      const p = plan(text);
      expect(p.headerProblems.join("\n"), text).toMatch(message);
      expect(p.rows, text).toEqual([]);
      expect(p.entries, text).toEqual([]);
    }
  });
  test("every header problem is listed at once, not one at a time", () => {
    const p = plan("CA 1 (30),Behaviour\n1,2\n");
    expect(p.headerProblems).toHaveLength(5); // out of 30, unknown Behaviour, no admission_no, no CA 2, no Exam
  });
  test("a file that is not CSV, an empty file, and a file with a header only are refused in words", () => {
    expect(plan('admission_no,"CA 1\nA/1,5\n').headerProblems[0]).toMatch(/not a valid CSV file \(line 1\)/);
    expect(plan("").headerProblems[0]).toMatch(/file is empty/);
    expect(plan(`${HEADER}\n`).headerProblems).toEqual(["The file has a header and no pupils."]);
    expect(plan(`${HEADER}\n,,,,\n`).headerProblems).toEqual(["The file has a header and no pupils."]);
  });
  test("empty columns at the end, which a spreadsheet leaves, are harmless; a nameless column with values in it is not", () => {
    expect(plan(`${HEADER},,\nA/1,Ada,1,2,3,,\n`).headerProblems).toEqual([]);
    expect(plan(`${HEADER},\nA/1,Ada,1,2,3,oops\n`).headerProblems[0]).toMatch(/Column 6 has values but no name/);
  });
  test("a class with no scheme takes Mark or Score, and a maximum that is not the total is refused", () => {
    const one: MarkColumn[] = [{ name: "Mark", maxScore: 100 }];
    for (const header of ["admission_no,Mark", "admission_no,score", "admission_no,Mark (100)", "admission_no,SCORE (100)"])
      expect(plan(`${header}\nA/1,72\n`, one).entries, header).toEqual([{ studentId: "id-A/1", marks: [72] }]);
    expect(plan("admission_no,Mark (50)\nA/1,72\n", one).headerProblems[0]).toMatch(/out of 100 in this class's scheme; the file says 50/);
  });
});

test.describe("the marks in a row", () => {
  test("a mark is a plain number with at most two decimals, from 0 to the part's maximum", () => {
    const p = plan(file("A/1,x,0,20,60", "A/2,x,12.5,7.25,33.00"));
    expect(p.counts.errors).toBe(0);
    expect(p.entries).toEqual([
      { studentId: "id-A/1", marks: [0, 20, 60] },
      { studentId: "id-A/2", marks: [12.5, 7.25, 33] },
    ]);
    expect(p.rows[0].total).toBe(80);
    expect(p.rows[1].total).toBe(52.75);
  });
  test("what is not a mark is refused in words, naming the part: a comma, a percent sign, three decimals, a minus, a formula, text, a number above its maximum", () => {
    const bad: [string, RegExp][] = [
      ["12,5", /CA 1: use a number with at most two decimals \(no commas, no % sign\)/],
      ["50%", /CA 1: use a number with at most two decimals/],
      ["1.234", /CA 1: use a number with at most two decimals/],
      ["-1", /CA 1: use a number with at most two decimals/],
      ["=1+1", /CA 1: use a number with at most two decimals/],
      ["abc", /CA 1: use a number with at most two decimals/],
      ["1e3", /CA 1: use a number with at most two decimals/],
      ["20.01", /CA 1: at most 20\./],
      ["21", /CA 1: at most 20\./],
    ];
    for (const [cell, message] of bad) {
      const [row] = plan(file(`A/1,x,"${cell}",5,5`)).rows;
      expect(row.status, cell).toBe("error");
      expect(row.problems.join(" "), cell).toMatch(message);
    }
  });
  test("every problem of a row is said, and a row with several problems says them all", () => {
    const [row] = plan(file("A/1,x,99,abc,70")).rows;
    expect(row.problems).toEqual([
      "CA 1: at most 20.",
      "CA 2: use a number with at most two decimals (no commas, no % sign).",
      "Exam: at most 60.",
    ]);
  });
  test("a row with every mark blank is left alone; a row with some blank is an error, as in the grid", () => {
    const p = plan(file("A/1,x,,,", "A/2,x,5,,"));
    expect(p.rows.map((r) => r.status)).toEqual(["blank", "error"]);
    expect(p.rows[0].note).toBe("No marks: left as it is.");
    expect(p.rows[1].problems).toEqual(["Fill every part, or leave the whole row blank."]);
    expect(p.entries).toEqual([]);
  });
  test("spaces around a value are ignored, and a row with fewer values than the header has the rest blank", () => {
    expect(plan(file("A/1,x, 5 , 6 ,7")).entries[0].marks).toEqual([5, 6, 7]);
    expect(plan(file("A/1,x,5")).rows[0].problems).toEqual(["Fill every part, or leave the whole row blank."]);
  });
  test("a row with more values than the header has columns is an error; a line of only commas is skipped, and row numbers are the spreadsheet's (the header is row 1)", () => {
    const p = plan(`${HEADER}\nA/1,x,1,2,3\n,,,,\nA/2,x,1,2,3,9\nA/3,x,4,4,4\n`);
    expect(p.rows.map((r) => `${r.row}:${r.status}`)).toEqual(["2:new", "4:error", "5:error"]);
    expect(p.rows[1].problems[0]).toMatch(/has 6 values but the header has 5 columns/);
    expect(p.counts.rows).toBe(3);
  });
});

test.describe("finding the pupil", () => {
  test("by admission number, exactly, or ignoring case and spacing", () => {
    const p = plan(file("A/1,x,1,1,1", "  a/2 ,x,2,2,2"));
    expect(p.rows.map((r) => [r.status, r.name])).toEqual([
      ["new", "Ada Obi"],
      ["changed", "Bayo Obi"],
    ]);
  });
  test("a number that is not on this roll is refused in the same words whatever it is, and an empty one asks for it", () => {
    const p = plan(file("Z/9,x,1,1,1", "A/10,x,1,1,1", ",x,1,1,1"));
    expect(p.rows.map((r) => r.problems[0])).toEqual([
      "No pupil with this admission number is on the roll of this class for this term.",
      "No pupil with this admission number is on the roll of this class for this term.",
      "Give the admission number.",
    ]);
  });
  test("two pupils whose numbers differ only in case: the exact number finds the right one; another spelling that fits both is refused as ambiguous", () => {
    const rolled = [pupil("AB/1", "Upper"), pupil("ab/1", "Lower")];
    const exact = plan(file("ab/1,x,1,1,1", "AB/1,x,2,2,2"), PARTS, rolled);
    expect(exact.rows.map((r) => r.name)).toEqual(["Lower Obi", "Upper Obi"]);
    const loose = plan(file("Ab/1,x,1,1,1"), PARTS, rolled);
    expect(loose.rows[0].problems[0]).toMatch(/More than one pupil on this roll has a number like this/);
  });
  test("a pupil in the file twice: the second row is refused and names the first", () => {
    const p = plan(file("A/1,x,1,1,1", "A/1,x,2,2,2"));
    expect(p.rows.map((r) => r.status)).toEqual(["new", "error"]);
    expect(p.rows[1].problems).toEqual(["This pupil is already in row 2."]);
    expect(p.entries).toHaveLength(1);
  });
  test("pupils on the roll who are not in the file are counted and left as they are", () => {
    expect(plan(file("A/1,x,1,1,1")).notInFile).toBe(3);
  });
  test("the name column is never used to find anyone: a wrong name beside a right number is fine", () => {
    const [row] = plan(file("A/1,Somebody Else,1,1,1")).rows;
    expect(row.status).toBe("new");
    expect(row.name).toBe("Ada Obi");
  });
});

test.describe("what would happen to a row", () => {
  test("new where nothing is saved, changed where a draft differs, unchanged where it is the same", () => {
    expect(only(file("A/1,x,1,1,1", "A/2,x,10,12,41", "A/2,x,10,12,40"))).toEqual(["2:new", "3:changed", "4:error"]); // the last is the same pupil again
    const same = plan(file("A/2,x,10.00,12,40"));
    expect(same.rows[0].status).toBe("unchanged");
    expect(same.rows[0].note).toBe("Already saved with these marks.");
    expect(same.entries).toEqual([]);
  });
  test("only new and changed rows are written, and the preview says what the total was", () => {
    const p = plan(file("A/1,x,1,2,3", "A/2,x,10,12,41", "A/4,x,20,20,60"));
    expect(p.counts).toEqual({ rows: 3, new: 1, changed: 1, unchanged: 1, blank: 0, errors: 0 });
    expect(p.entries.map((e) => e.studentId)).toEqual(["id-A/1", "id-A/2"]);
    expect(p.rows[0]).toMatchObject({ total: 6, savedTotal: null });
    expect(p.rows[1]).toMatchObject({ total: 63, savedTotal: 62 });
  });
  test("a result that has left DRAFT cannot be changed: the row is refused and says why; an identical one is quiet", () => {
    const p = plan(file("A/3,x,15,15,51", "A/3b,x,1,1,1", "A/4,x,19,20,60"));
    expect(p.rows[0].status).toBe("error");
    expect(p.rows[0].problems[0]).toBe(
      "This pupil's marks are sent for review, so they cannot be changed here. They must be back in draft first.",
    );
    expect(p.rows[2].problems[0]).toMatch(/marks are published, so they cannot be changed here/);
    expect(plan(file("A/3,x,15,15,50", "A/4,x,20,20,60")).rows.map((r) => r.status)).toEqual(["unchanged", "unchanged"]);
  });
  test("every status that is not DRAFT is refused in its own words", () => {
    for (const [status, word] of [
      ["SUBMITTED", "sent for review"],
      ["APPROVED", "approved"],
      ["PUBLISHED", "published"],
      ["LOCKED", "locked"],
    ]) {
      const p = plan(file("A/1,x,1,1,2"), PARTS, [pupil("A/1", "Ada", { status, marks: [1, 1, 1] })]);
      expect(p.rows[0].problems[0], status).toContain(`are ${word},`);
    }
  });
  test("a saved result whose parts are not all known (saved before the scheme) is a change, never a match", () => {
    const p = plan(file("A/1,x,1,1,1"), PARTS, [pupil("A/1", "Ada", { status: "DRAFT", marks: [1, null, 1] })]);
    expect(p.rows[0].status).toBe("changed");
    expect(p.rows[0].savedTotal).toBeNull();
  });
  test("one problem anywhere is a problem for the file: the counts say so and the good rows are still listed", () => {
    const p = plan(file("A/1,x,1,1,1", "A/2,x,99,1,1", "A/4,x,20,20,60"));
    expect(p.counts).toEqual({ rows: 3, new: 1, changed: 0, unchanged: 1, blank: 0, errors: 1 });
  });
});
