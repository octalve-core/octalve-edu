import "../support/env";
import { test, expect } from "@playwright/test";
import type { SheetRow } from "@/lib/programs/assessment-service";
import {
  ASSESSMENT_STATUSES,
  bandsProblem,
  cleanText,
  gradeFor,
  meetsRule,
  parseBands,
  passedAt,
  percentCounted,
  percentOf,
  roundTo2,
  scoreProblem,
  statusAfter,
  weightedAverage,
  type AssessmentAction,
} from "@/lib/programs/assessment-rules";
import {
  draftProblem,
  missingCount,
  parseScore,
  pendingScores,
  reasonNeeded,
  resultText,
  startingDraft,
} from "@/components/programs/assessment-model";

// Programs, slice P3b (task 0027, section 8.11): the pure rules of assessments and the small decisions of the score sheet. No database, no server.

test.describe("the lifecycle", () => {
  const ALL: AssessmentAction[] = ["open", "mark", "reopen", "publish", "archive"];
  test("every action from every status: only the forward steps, one step back, and archive from anywhere but ARCHIVED", () => {
    const table: Record<string, Record<string, string | null>> = {
      DRAFT: { open: "OPEN", mark: null, reopen: null, publish: null, archive: "ARCHIVED" },
      OPEN: { open: null, mark: "MARKED", reopen: null, publish: null, archive: "ARCHIVED" },
      MARKED: { open: null, mark: null, reopen: "OPEN", publish: "PUBLISHED", archive: "ARCHIVED" },
      PUBLISHED: { open: null, mark: null, reopen: null, publish: null, archive: "ARCHIVED" },
      ARCHIVED: { open: null, mark: null, reopen: null, publish: null, archive: null },
    };
    for (const status of ASSESSMENT_STATUSES)
      for (const action of ALL) expect(statusAfter(status, action), `${status} ${action}`).toBe(table[status]![action]);
  });
});

test.describe("scores", () => {
  test("a score is 0 to the maximum with at most two decimals", () => {
    expect(scoreProblem(0, 40)).toBeNull();
    expect(scoreProblem(40, 40)).toBeNull();
    expect(scoreProblem(12.25, 40)).toBeNull();
    expect(scoreProblem(-0.01, 40)).toMatch(/below 0/);
    expect(scoreProblem(40.01, 40)).toMatch(/above the maximum of 40/);
    expect(scoreProblem(10.123, 40)).toMatch(/two decimal/);
    expect(scoreProblem(Number.NaN, 40)).toMatch(/not a number/);
    expect(scoreProblem(Number.POSITIVE_INFINITY, 40)).toMatch(/not a number/);
  });

  test("rounding and percentages are to one decimal, half up", () => {
    expect(roundTo2(1.005)).toBe(1.01);
    expect(percentOf(27, 40)).toBe(67.5);
    expect(percentOf(30.5, 40)).toBe(76.3);
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(40, 40)).toBe(100);
    expect(percentOf(0, 40)).toBe(0);
  });

  test("text is trimmed and its spaces made single", () => {
    expect(cleanText("  Oral   check ")).toBe("Oral check");
    expect(cleanText(null)).toBe("");
  });

  test("passed, failed, or no verdict", () => {
    expect(passedAt(20, 20)).toBe(true);
    expect(passedAt(19.99, 20)).toBe(false);
    expect(passedAt(null, 20)).toBeNull();
    expect(passedAt(30, null)).toBeNull();
  });
});

test.describe("grade bands", () => {
  const bands = [
    { name: "Fail", from: 0 },
    { name: "Good", from: 60 },
    { name: "Excellent", from: 85 },
  ];
  test("the grade is the band with the highest start not above the percentage; none without bands", () => {
    expect(gradeFor(bands, 0)).toBe("Fail");
    expect(gradeFor(bands, 59.9)).toBe("Fail");
    expect(gradeFor(bands, 60)).toBe("Good");
    expect(gradeFor(bands, 84.9)).toBe("Good");
    expect(gradeFor(bands, 85)).toBe("Excellent");
    expect(gradeFor(bands, 100)).toBe("Excellent");
    expect(gradeFor([...bands].reverse(), 70)).toBe("Good"); // the order given does not matter
    expect(gradeFor([], 70)).toBeNull();
    expect(gradeFor(null, 70)).toBeNull();
  });

  test("bands are usable only with unique names and starts, inside 0 to 100, and one starting at 0", () => {
    expect(bandsProblem([])).toBeNull();
    expect(bandsProblem(bands)).toBeNull();
    expect(bandsProblem([{ name: "A", from: 50 }])).toMatch(/start at 0/);
    expect(
      bandsProblem([
        { name: "A", from: 0 },
        { name: "a", from: 50 },
      ]),
    ).toMatch(/different name/);
    expect(
      bandsProblem([
        { name: "A", from: 0 },
        { name: "B", from: 0 },
      ]),
    ).toMatch(/same percentage/);
    expect(
      bandsProblem([
        { name: "A", from: 0 },
        { name: "B", from: 101 },
      ]),
    ).toMatch(/0 to 100/);
    expect(bandsProblem(Array.from({ length: 11 }, (_, i) => ({ name: `G${i}`, from: i * 9 })))).toMatch(/At most 10/);
  });

  test("what is stored is read back keeping only well-formed bands", () => {
    expect(parseBands(null)).toEqual([]);
    expect(parseBands("nope")).toEqual([]);
    expect(parseBands([{ name: "A", from: 0 }, { name: 5, from: 1 }, null, { name: "B" }, "x"])).toEqual([{ name: "A", from: 0 }]);
  });
});

test.describe("averages", () => {
  test("a number counts as its percentage, ABSENT as 0, the other codes not at all", () => {
    expect(percentCounted({ score: 30, code: null }, 40)).toBe(75);
    expect(percentCounted({ score: null, code: "ABSENT" }, 40)).toBe(0);
    for (const code of ["EXCUSED", "EXEMPT", "NOT_SITTING"] as const) expect(percentCounted({ score: null, code }, 40), code).toBeNull();
  });

  test("the weighted average, one decimal; nothing that counts is no average, not 0", () => {
    expect(
      weightedAverage([
        { percent: 90, weight: 1 },
        { percent: 80, weight: 3 },
      ]),
    ).toBe(82.5);
    expect(
      weightedAverage([
        { percent: 50, weight: 1 },
        { percent: 0, weight: 3 },
      ]),
    ).toBe(12.5);
    expect(
      weightedAverage([
        { percent: 100, weight: 2 },
        { percent: null, weight: 5 },
      ]),
    ).toBe(100);
    expect(weightedAverage([{ percent: null, weight: 1 }])).toBeNull();
    expect(weightedAverage([])).toBeNull();
  });

  test("the completion rule: an average at least X, and/or every required assessment passed", () => {
    const r = (
      over: Partial<{ required: boolean; passed: boolean | null; percent: number | null; weight: number; counted: boolean }> = {},
    ) => ({ required: false, passed: null, percent: 80, weight: 1, counted: true, ...over });
    expect(meetsRule({ minAverage: null, requirePassed: false }, []).ok).toBe(true);
    expect(meetsRule({ minAverage: 70, requirePassed: false }, [r({ percent: 80 })])).toEqual({ ok: true, why: [] });
    expect(meetsRule({ minAverage: 70, requirePassed: false }, [r({ percent: 60 })]).why[0]).toMatch(/average is 60%, under 70%/);
    expect(meetsRule({ minAverage: 70, requirePassed: false }, []).why[0]).toMatch(/No result counts/);
    expect(meetsRule({ minAverage: 70, requirePassed: false }, [r({ counted: false, percent: null })]).ok).toBe(false);
    expect(
      meetsRule({ minAverage: null, requirePassed: true }, [r({ required: true, passed: true }), r({ required: false, passed: false })]).ok,
    ).toBe(true);
    expect(meetsRule({ minAverage: null, requirePassed: true }, [r({ required: true, passed: false })]).why[0]).toMatch(
      /1 required assessment is not passed/,
    );
    expect(
      meetsRule({ minAverage: null, requirePassed: true }, [r({ required: true, passed: null }), r({ required: true, passed: false })])
        .why[0],
    ).toMatch(/2 required assessments are not passed/);
    const both = meetsRule({ minAverage: 70, requirePassed: true }, [r({ percent: 50, required: true, passed: false })]);
    expect(both.ok).toBe(false);
    expect(both.why).toHaveLength(2);
  });
});

test.describe("the score sheet on the screen", () => {
  const row = (id: string, over: Partial<SheetRow> = {}): SheetRow => ({
    participantId: id,
    name: id,
    kind: "STUDENT",
    campusId: "A",
    groupPath: "Juz A",
    flag: null,
    listed: true,
    campusOff: false,
    canEdit: true,
    entry: null,
    percent: null,
    grade: null,
    passed: null,
    ...over,
  });
  const entry = (
    score: number | null,
    code: SheetRow["entry"] extends infer E ? (E extends { code: infer C } ? C : never) : never = null,
    over = {},
  ) => ({
    id: "s",
    score,
    code,
    comment: null,
    version: 1,
    markedBy: "Teacher",
    updatedAt: "2026-11-10T08:00:00.000Z",
    corrected: false,
    ...over,
  });

  test("a typed score is a number with at most two decimals inside the maximum; a comma is a point", () => {
    expect(parseScore("12.5", 40)).toEqual({ value: 12.5 });
    expect(parseScore(" 12,25 ", 40)).toEqual({ value: 12.25 });
    expect(parseScore("0", 40)).toEqual({ value: 0 });
    for (const bad of ["", "abc", "1.234", "-1", "41", "1e3", "12 5", ".5"]) expect(parseScore(bad, 40), bad).toHaveProperty("problem");
  });

  test("only rows the person may edit, with something valid typed that differs from what is stored, are sent, each with the stored version", () => {
    const rows = [
      row("new"),
      row("same", { entry: entry(20, null, { version: 3 }) }),
      row("changed", { entry: entry(20, null, { version: 2 }) }),
      row("coded"),
      row("locked", { canEdit: false }),
      row("untouched"),
      row("bad"),
    ];
    const d = (score: string, code: "" | "ABSENT" = "", comment = "") => ({ score, code, comment });
    const drafts = { new: d("25", "", "  good  "), same: d("20"), changed: d("22"), coded: d("", "ABSENT"), locked: d("5"), bad: d("99") };
    expect(pendingScores(rows, drafts, 40)).toEqual([
      { participantId: "new", score: 25, comment: "good" },
      { participantId: "changed", score: 22, comment: null, version: 2 },
      { participantId: "coded", code: "ABSENT", comment: null },
    ]);
    expect(draftProblem(rows[6]!, drafts.bad, 40)).toMatch(/above the maximum/);
    expect(draftProblem(rows[0]!, drafts.new, 40)).toBeNull();
    expect(draftProblem(rows[3]!, drafts.coded, 40)).toBeNull();
    expect(draftProblem(rows[4]!, drafts.locked, 40)).toBeNull();
  });

  test("a changed comment alone is a change; a score is never cleared", () => {
    const rows = [row("a", { entry: entry(20, null, { comment: "ok", version: 4 }) }), row("b", { entry: entry(null, "EXCUSED") })];
    const out = pendingScores(rows, { a: { score: "20", code: "", comment: "better" }, b: { score: "", code: "", comment: "" } }, 40);
    expect(out).toEqual([{ participantId: "a", score: 20, comment: "better", version: 4 }]);
  });

  test("a code replaces a score and the other way round, and the draft starts from what is stored", () => {
    expect(startingDraft(row("a", { entry: entry(12.5, null, { comment: "x" }) }))).toEqual({ score: "12.5", code: "", comment: "x" });
    expect(startingDraft(row("a", { entry: entry(null, "ABSENT") }))).toEqual({ score: "", code: "ABSENT", comment: "" });
    expect(startingDraft(row("a"))).toEqual({ score: "", code: "", comment: "" });
  });

  test("a reason is asked only on a published sheet and when something is being saved; people left to score are counted", () => {
    const pending = [{ participantId: "a", score: 1, comment: null }];
    expect(reasonNeeded(true, pending)).toBe(true);
    expect(reasonNeeded(true, [])).toBe(false);
    expect(reasonNeeded(false, pending)).toBe(false);
    const rows = [row("a"), row("b"), row("c", { entry: entry(5) }), row("d", { canEdit: false })];
    expect(missingCount(rows, {}, 40)).toBe(2);
    expect(missingCount(rows, { a: { score: "3", code: "", comment: "" } }, 40)).toBe(1);
  });

  test("how a result reads", () => {
    expect(resultText(row("a"))).toBe("No score");
    expect(resultText(row("a", { entry: entry(null, "ABSENT") }))).toBe("Absent");
    expect(resultText(row("a", { entry: entry(30), percent: 75, grade: "Good", passed: true }))).toBe("30 · 75% · Good · Passed");
    expect(resultText(row("a", { entry: entry(10), percent: 25, grade: null, passed: false }))).toBe("10 · 25% · Not passed");
    expect(resultText(row("a", { entry: entry(10), percent: 25, grade: null, passed: null }))).toBe("10 · 25%");
  });
});
