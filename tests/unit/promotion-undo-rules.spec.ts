import "../support/env";
import { test, expect } from "@playwright/test";
import { EnrollmentStatus, PromotionDecision } from "@prisma/client";
import { SOURCE_STATUS_AFTER, hasNewPlace, statusWord, undoProblems, type Activity, type UndoCheck } from "@/lib/promotion/undo-rules";
import { undoPromotionSchema } from "@/lib/promotion/validation";

// Undoing a roll (task 0040), the pure rules: where a roll put each pupil, and what stops them being put back.

const NONE: Activity = { results: false, remarks: false, invoice: false, attendance: false };
const check = (over: Partial<UndoCheck> = {}): UndoCheck => ({
  decision: PromotionDecision.PROMOTED,
  sourceStatus: EnrollmentStatus.PROMOTED,
  targetStatus: EnrollmentStatus.ACTIVE,
  activity: NONE,
  sourceSession: "2034/2035",
  targetSession: "2035/2036",
  ...over,
});

test.describe("where a roll put each pupil", () => {
  test("the status a roll gives the source place, for each decision", () => {
    expect(SOURCE_STATUS_AFTER).toEqual({
      PROMOTED: "PROMOTED",
      REPEATED: "REPEATED",
      GRADUATED: "ALUMNI",
      WITHDRAWN: "WITHDRAWN",
    });
  });
  test("only a promotion and a repeat make a new place in the target session", () => {
    expect(Object.values(PromotionDecision).map((d) => [d, hasNewPlace(d)])).toEqual([
      ["PROMOTED", true],
      ["REPEATED", true],
      ["GRADUATED", false],
      ["WITHDRAWN", false],
    ]);
  });
  test("every status has a word, so a sentence can say what a place is now", () => {
    for (const status of Object.values(EnrollmentStatus)) expect(statusWord(status), status).toMatch(/\S/);
  });
});

test.describe("what stops a pupil being put back", () => {
  test("a pupil whose places are as the roll left them, with nothing used, is not in the way", () => {
    for (const decision of Object.values(PromotionDecision))
      expect(
        undoProblems(
          check({
            decision,
            sourceStatus: SOURCE_STATUS_AFTER[decision],
            targetStatus: hasNewPlace(decision) ? EnrollmentStatus.ACTIVE : null,
          }),
        ),
        decision,
      ).toEqual([]);
  });
  test("a source place that is not as the roll left it was changed since, and the sentence says what it is now", () => {
    expect(undoProblems(check({ sourceStatus: EnrollmentStatus.EXPELLED }))).toEqual([
      "Their place in 2034/2035 has changed since the roll (it is now expelled).",
    ]);
    expect(
      undoProblems(check({ decision: PromotionDecision.GRADUATED, sourceStatus: EnrollmentStatus.ACTIVE, targetStatus: null })),
    ).toEqual(["Their place in 2034/2035 has changed since the roll (it is now active)."]);
    expect(undoProblems(check({ sourceStatus: null }))).toEqual(["Their place in 2034/2035 could not be found."]);
  });
  test("a new place that is not ACTIVE any more was moved on, and the sentence says what it is now", () => {
    expect(undoProblems(check({ targetStatus: EnrollmentStatus.PROMOTED }))).toEqual([
      "Their new place in 2035/2036 has been moved on since the roll (it is now promoted).",
    ]);
    expect(undoProblems(check({ targetStatus: EnrollmentStatus.WITHDRAWN }))[0]).toContain("it is now withdrawn");
    expect(undoProblems(check({ targetStatus: null }))).toEqual(["Their new place in 2035/2036 could not be found."]);
  });
  test("a new place that was used is named: marks, report remarks, an invoice, attendance, one or several", () => {
    expect(undoProblems(check({ activity: { ...NONE, results: true } }))).toEqual(["They already have marks in 2035/2036."]);
    expect(undoProblems(check({ activity: { ...NONE, remarks: true, invoice: true } }))).toEqual([
      "They already have report remarks and an invoice in 2035/2036.",
    ]);
    expect(undoProblems(check({ activity: { results: true, remarks: true, invoice: true, attendance: true } }))).toEqual([
      "They already have marks, report remarks, an invoice and attendance in 2035/2036.",
    ]);
  });
  test("a pupil with no new place cannot have used one: their activity and target are not asked about", () => {
    for (const decision of [PromotionDecision.GRADUATED, PromotionDecision.WITHDRAWN])
      expect(
        undoProblems(
          check({
            decision,
            sourceStatus: SOURCE_STATUS_AFTER[decision],
            targetStatus: null,
            activity: { results: true, remarks: true, invoice: true, attendance: true },
          }),
        ),
        decision,
      ).toEqual([]);
  });
  test("every problem of one pupil is said, in order: the source place, the new place, what was used", () => {
    const problems = undoProblems(
      check({ sourceStatus: EnrollmentStatus.EXPELLED, targetStatus: EnrollmentStatus.WITHDRAWN, activity: { ...NONE, results: true } }),
    );
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("Their place in 2034/2035");
    expect(problems[1]).toContain("Their new place in 2035/2036");
    expect(problems[2]).toContain("They already have marks");
  });
});

test.describe("the request", () => {
  const stepUp = { type: "password", value: "correct-horse-battery-9" };
  test("a reason of 1 to 500 characters, trimmed, and a proof", () => {
    expect(undoPromotionSchema.parse({ reason: "  Wrong class.  ", stepUp }).reason).toBe("Wrong class.");
    expect(undoPromotionSchema.safeParse({ reason: "x".repeat(500), stepUp }).success).toBe(true);
  });
  test("no reason, only spaces, 501 characters, no proof, and a field the route does not read are each refused", () => {
    for (const bad of [
      { stepUp },
      { reason: "", stepUp },
      { reason: "    ", stepUp },
      { reason: "x".repeat(501), stepUp },
      { reason: "Wrong class." },
      { reason: "Wrong class.", stepUp, force: true },
      { reason: 12, stepUp },
    ])
      expect(undoPromotionSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
  });
});
