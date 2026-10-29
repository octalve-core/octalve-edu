import "../support/env";
import { test, expect } from "@playwright/test";
import { QuestionReportOutcome, QuestionReportStatus } from "@prisma/client";
import {
  sanitizeReportReason,
  maskReporterForReviewer,
  pupilCellsAtMinimum,
  reportCell,
  REPORT_LIMITS,
  reportLimitReached,
  startOfUtcDay,
  computeRegradeImpact,
  validateReportOutcome,
} from "@/lib/question-bank/reports";
import { MAX_REGRADE_ATTEMPTS, planAttemptRegrade, groupChanges } from "@/lib/question-bank/regrade";

test.describe("Question reports pure domain logic", () => {
  test.describe("sanitizeReportReason", () => {
    test("strips standard http/https and www links from report reason", () => {
      const input = "The correct answer is wrong. See https://example.com/cell and www.bio.org/test for proof.";
      const res = sanitizeReportReason(input);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.cleanText).toBe("The correct answer is wrong. See and for proof.");
        expect(res.cleanText).not.toContain("https://");
        expect(res.cleanText).not.toContain("www.");
      }
    });

    test("strips markdown link syntax while preserving anchor text", () => {
      const input = "Check this [official syllabus](https://edu.gov/curriculum) for question 2.";
      const res = sanitizeReportReason(input);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.cleanText).toBe("Check this official syllabus for question 2.");
        expect(res.cleanText).not.toContain("https://");
      }
    });

    test("collapses excess whitespace and trims input", () => {
      const input = "   Typo   in option   B    ";
      const res = sanitizeReportReason(input);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.cleanText).toBe("Typo in option B");
      }
    });

    test("rejects input shorter than minimum length", () => {
      const res = sanitizeReportReason("Bad");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.message).toContain("at least 5 characters");
      }
    });

    test("rejects input exceeding maximum length", () => {
      const longText = "a".repeat(1001);
      const res = sanitizeReportReason(longText);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.message).toContain("cannot exceed 1000 characters");
      }
    });

    test("rejects input containing control characters", () => {
      const res = sanitizeReportReason("Option A has a typo\u0000here");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.message).toContain("invalid characters");
      }
    });
  });

  test.describe("maskReporterForReviewer", () => {
    test("masks pupil identity displaying role and section only", () => {
      const masked = maskReporterForReviewer({
        reporterRole: "PUPIL",
        reporterSection: "JSS",
      });
      expect(masked).toBe("Pupil in JSS");
    });

    test("masks teacher identity falling back to branch name when section is absent", () => {
      const masked = maskReporterForReviewer({
        reporterRole: "TEACHER",
        branchName: "Secondary School",
      });
      expect(masked).toBe("Teacher in Secondary School");
    });

    test("falls back to General when neither section nor branch is provided", () => {
      const masked = maskReporterForReviewer({
        reporterRole: "PUPIL",
      });
      expect(masked).toBe("Pupil in General");
    });
  });

  test.describe("computeRegradeImpact", () => {
    test("summarizes affected quizzes and attempts correctly", () => {
      const copiedQuestions = [
        { quizId: "q1", quizTitle: "Biology Mid-Term", questionId: "qq1", attemptsCount: 15 },
        { quizId: "q1", quizTitle: "Biology Mid-Term", questionId: "qq2", attemptsCount: 15 },
        { quizId: "q2", quizTitle: "Quiz 3", questionId: "qq3", attemptsCount: 5 },
      ];
      const impact = computeRegradeImpact(copiedQuestions);
      expect(impact.affectedQuizzesCount).toBe(2);
      expect(impact.totalAttemptsCount).toBe(35);
      expect(impact.offerMessage).toContain("Question was used in 2 assessment(s) with 35 student attempt(s)");
    });

    test("handles items not copied into any assessments", () => {
      const impact = computeRegradeImpact([]);
      expect(impact.affectedQuizzesCount).toBe(0);
      expect(impact.totalAttemptsCount).toBe(0);
      expect(impact.offerMessage).toBe("Question has not been copied into any assessments.");
    });
  });

  test.describe("validateReportOutcome", () => {
    test("maps FIXED outcome to RESOLVED status", () => {
      const res = validateReportOutcome(QuestionReportOutcome.FIXED, "Corrected typographical error in option A");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.outcome).toBe(QuestionReportOutcome.FIXED);
        expect(res.targetStatus).toBe(QuestionReportStatus.RESOLVED);
      }
    });

    test("maps NOT_AN_ERROR outcome to DISMISSED status", () => {
      const res = validateReportOutcome(QuestionReportOutcome.NOT_AN_ERROR, "Question formula is verified by curriculum standards.");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.outcome).toBe(QuestionReportOutcome.NOT_AN_ERROR);
        expect(res.targetStatus).toBe(QuestionReportStatus.DISMISSED);
      }
    });

    test("maps NEEDS_DISCUSSION outcome to RESOLVED status", () => {
      const res = validateReportOutcome(QuestionReportOutcome.NEEDS_DISCUSSION, "Will be discussed at next science departmental review.");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.outcome).toBe(QuestionReportOutcome.NEEDS_DISCUSSION);
        expect(res.targetStatus).toBe(QuestionReportStatus.RESOLVED);
      }
    });

    test("rejects invalid outcome and short reasons", () => {
      expect(validateReportOutcome("INVALID", "Valid explanation").ok).toBe(false);
      expect(validateReportOutcome(QuestionReportOutcome.FIXED, "ab").ok).toBe(false);
    });
  });

  test.describe("pupil report groups (the small-summary threshold)", () => {
    const report = (itemId: string, reporterSection: string, reporterStudentId: string | null) => ({
      itemId,
      reporterSection,
      reporterStudentId,
    });

    test("a question and campus reach the minimum with that many DIFFERENT pupils", () => {
      const reports = ["a", "b", "c"].map((pupil) => report("q1", "north", pupil));
      expect(pupilCellsAtMinimum(reports, 3).has(reportCell("q1", "north"))).toBe(true);
      expect(pupilCellsAtMinimum(reports, 4).has(reportCell("q1", "north"))).toBe(false);
    });

    test("one pupil reporting twice counts once", () => {
      const reports = [report("q1", "north", "a"), report("q1", "north", "a"), report("q1", "north", "b")];
      expect(pupilCellsAtMinimum(reports, 3).size).toBe(0);
      expect(pupilCellsAtMinimum(reports, 2).has(reportCell("q1", "north"))).toBe(true);
    });

    test("another campus, or another question, is another group", () => {
      const reports = [report("q1", "north", "a"), report("q1", "north", "b"), report("q1", "south", "c"), report("q2", "north", "d")];
      const cells = pupilCellsAtMinimum(reports, 2);
      expect(cells.has(reportCell("q1", "north"))).toBe(true);
      expect(cells.has(reportCell("q1", "south"))).toBe(false);
      expect(cells.has(reportCell("q2", "north"))).toBe(false);
    });

    test("reports whose pupil is gone count as one person, not several", () => {
      const reports = [report("q1", "north", null), report("q1", "north", null), report("q1", "north", "a")];
      expect(pupilCellsAtMinimum(reports, 3).size).toBe(0);
      expect(pupilCellsAtMinimum(reports, 2).has(reportCell("q1", "north"))).toBe(true);
    });

    test("a pupil's report names no campus when asked not to", () => {
      expect(maskReporterForReviewer({ reporterRole: "PUPIL", reporterSection: "North", showSection: false })).toBe("Pupil");
      expect(maskReporterForReviewer({ reporterRole: "PUPIL", reporterSection: "North", showSection: true })).toBe("Pupil in North");
      expect(maskReporterForReviewer({ reporterRole: "TEACHER", branchName: "North", showSection: false })).toBe("Teacher");
    });
  });

  test.describe("report limits", () => {
    test("a pupil is held to 10 waiting and 20 a day, a teacher to 20 and 50", () => {
      expect(REPORT_LIMITS.PUPIL).toEqual({ open: 10, perDay: 20 });
      expect(REPORT_LIMITS.TEACHER).toEqual({ open: 20, perDay: 50 });
    });

    test("the limit that is reached is named, the waiting limit first", () => {
      expect(reportLimitReached("PUPIL", 9, 19)).toBeNull();
      expect(reportLimitReached("PUPIL", 10, 10)).toBe("OPEN");
      expect(reportLimitReached("PUPIL", 3, 20)).toBe("DAY");
      expect(reportLimitReached("PUPIL", 10, 20)).toBe("OPEN");
      expect(reportLimitReached("TEACHER", 19, 49)).toBeNull();
      expect(reportLimitReached("TEACHER", 20, 0)).toBe("OPEN");
      expect(reportLimitReached("TEACHER", 0, 50)).toBe("DAY");
    });

    test("a day starts at midnight UTC", () => {
      expect(startOfUtcDay(new Date("2026-10-29T23:59:59.999Z")).toISOString()).toBe("2026-10-29T00:00:00.000Z");
      expect(startOfUtcDay(new Date("2026-10-30T00:00:00.000Z")).toISOString()).toBe("2026-10-30T00:00:00.000Z");
    });
  });

  test.describe("re-grading attempts after a corrected key", () => {
    const questions = [
      { id: "q1", questionType: "MULTIPLE_CHOICE" as const, correctAnswer: "A", points: 2 },
      { id: "q2", questionType: "SHORT_ANSWER" as const, correctAnswer: "x", points: 2 },
    ];
    const attempt = (id: string, first: string, score: number, isPassed: boolean) => ({
      id,
      answers: [
        { questionId: "q1", answer: first },
        { questionId: "q2", answer: "x" },
      ],
      score,
      isPassed,
    });

    test("only the attempts whose score or pass mark changes are returned, with from and to", () => {
      const plan = planAttemptRegrade(questions, 60, [
        attempt("same", "A", 100, true),
        attempt("up", "A", 50, false),
        attempt("down", "B", 100, true),
      ]);
      expect(plan.unreadable).toBe(0);
      expect(plan.changes).toEqual([
        { attemptId: "up", fromScore: 50, toScore: 100, fromPassed: false, toPassed: true },
        { attemptId: "down", fromScore: 100, toScore: 50, fromPassed: true, toPassed: false },
      ]);
    });

    test("an attempt whose answers cannot be read is counted and left alone", () => {
      const plan = planAttemptRegrade(questions, 60, [
        { id: "a", answers: "not a list", score: 10, isPassed: false },
        { id: "b", answers: [{ questionId: "q1" }], score: 10, isPassed: false },
        { id: "c", answers: null, score: 10, isPassed: false },
      ]);
      expect(plan.changes).toEqual([]);
      expect(plan.unreadable).toBe(3);
    });

    test("without a pass mark the quiz's default of 50 applies, as when it was taken", () => {
      const plan = planAttemptRegrade(questions, null, [attempt("x", "B", 100, true)]);
      expect(plan.changes).toEqual([{ attemptId: "x", fromScore: 100, toScore: 50, fromPassed: true, toPassed: true }]);
    });

    test("changes with the same new result are grouped so they can be written together", () => {
      const grouped = groupChanges([
        { attemptId: "a", fromScore: 100, toScore: 50, fromPassed: true, toPassed: false },
        { attemptId: "b", fromScore: 90, toScore: 50, fromPassed: true, toPassed: false },
        { attemptId: "c", fromScore: 50, toScore: 100, fromPassed: false, toPassed: true },
      ]);
      expect(grouped).toEqual([
        { score: 50, isPassed: false, attemptIds: ["a", "b"] },
        { score: 100, isPassed: true, attemptIds: ["c"] },
      ]);
    });

    test("the most a correction will re-grade is 5000 attempts", () => {
      expect(MAX_REGRADE_ATTEMPTS).toBe(5000);
    });
  });
});
