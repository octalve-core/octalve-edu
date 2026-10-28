import "../support/env";
import { test, expect } from "@playwright/test";
import { QuestionReportOutcome, QuestionReportStatus } from "@prisma/client";
import { sanitizeReportReason, maskReporterForReviewer, computeRegradeImpact, validateReportOutcome } from "@/lib/question-bank/reports";

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
});
