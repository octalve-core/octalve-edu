import { test, expect } from "@playwright/test";
import { BankQuestionType, FormMarkingMethod, FormMarkingStatus, FormResponseStatus } from "@prisma/client";
import {
  resolveMarkingMethod,
  validateAnswerScore,
  validateTeacherFeedback,
  evaluateSubmissionWithMarking,
  computeAttemptMarkingSummary,
  canMarkResponse,
  sanitizeResponseForPupil,
} from "../../src/lib/forms/manual-marking";

test.describe("Forms Manual Marking - Pure Domain Logic (Task 0032 Slice 9)", () => {
  test.describe("resolveMarkingMethod", () => {
    test("defaults SHORT question type to MANUAL per §8.8", () => {
      expect(resolveMarkingMethod(BankQuestionType.SHORT)).toBe(FormMarkingMethod.MANUAL);
    });

    test("defaults choice question types (SINGLE, MULTI, TRUE_FALSE) to AUTO", () => {
      expect(resolveMarkingMethod(BankQuestionType.SINGLE)).toBe(FormMarkingMethod.AUTO);
      expect(resolveMarkingMethod(BankQuestionType.MULTI)).toBe(FormMarkingMethod.AUTO);
      expect(resolveMarkingMethod(BankQuestionType.TRUE_FALSE)).toBe(FormMarkingMethod.AUTO);
    });

    test("respects explicit method override", () => {
      expect(resolveMarkingMethod(BankQuestionType.SINGLE, FormMarkingMethod.MANUAL)).toBe(FormMarkingMethod.MANUAL);
      expect(resolveMarkingMethod(BankQuestionType.SHORT, FormMarkingMethod.AUTO)).toBe(FormMarkingMethod.AUTO);
    });
  });

  test.describe("score and feedback validation", () => {
    test("validates teacher awarded scores within [0, maxPoints]", () => {
      expect(validateAnswerScore(5, 10).valid).toBe(true);
      expect(validateAnswerScore(0, 10).valid).toBe(true);
      expect(validateAnswerScore(10, 10).valid).toBe(true);

      const negative = validateAnswerScore(-1, 10);
      expect(negative.valid).toBe(false);
      expect(negative.reason).toContain("cannot be negative");

      const excess = validateAnswerScore(12, 10);
      expect(excess.valid).toBe(false);
      expect(excess.reason).toContain("cannot exceed maximum points");

      const nanVal = validateAnswerScore(NaN, 10);
      expect(nanVal.valid).toBe(false);
    });

    test("validates feedback character bounds", () => {
      expect(validateTeacherFeedback("Good answer!").valid).toBe(true);
      expect(validateTeacherFeedback(null).valid).toBe(true);
      expect(validateTeacherFeedback(undefined).valid).toBe(true);

      const longFeedback = "a".repeat(2001);
      const invalid = validateTeacherFeedback(longFeedback);
      expect(invalid.valid).toBe(false);
      expect(invalid.reason).toContain("cannot exceed 2000 characters");
    });
  });

  test.describe("evaluateSubmissionWithMarking", () => {
    const questions = [
      {
        id: "q1",
        questionType: BankQuestionType.SINGLE,
        points: 5,
        markingMethod: FormMarkingMethod.AUTO,
        correctAnswer: "B",
        explanation: "Option B is correct",
      },
      {
        id: "q2",
        questionType: BankQuestionType.SHORT,
        points: 10,
        markingMethod: FormMarkingMethod.MANUAL,
        correctAnswer: "Photosynthesis",
        explanation: "The process by which plants make food.",
      },
    ];

    test("evaluates auto questions immediately and holds manual questions in PENDING status", () => {
      const answers = [
        { formQuestionId: "q1", value: "B" },
        { formQuestionId: "q2", value: "photosynthesis process" },
      ];

      const res = evaluateSubmissionWithMarking(questions, answers);

      expect(res.markingStatus).toBe(FormMarkingStatus.PENDING);
      expect(res.pendingCount).toBe(1);
      expect(res.maxScore).toBe(15);
      expect(res.totalScore).toBe(5); // Only Q1 auto-awarded

      // Q1 was auto-marked
      const q1Ans = res.evaluatedAnswers.find((a) => a.formQuestionId === "q1");
      expect(q1Ans?.markingStatus).toBe(FormMarkingStatus.NOT_REQUIRED);
      expect(q1Ans?.isCorrect).toBe(true);
      expect(q1Ans?.score).toBe(5);
      expect(q1Ans?.correctAnswer).toBe("B");

      // Q2 is pending teacher manual marking; key and explanation withheld
      const q2Ans = res.evaluatedAnswers.find((a) => a.formQuestionId === "q2");
      expect(q2Ans?.markingStatus).toBe(FormMarkingStatus.PENDING);
      expect(q2Ans?.isCorrect).toBeNull();
      expect(q2Ans?.score).toBe(0);
      expect(q2Ans?.correctAnswer).toBeNull();
      expect(q2Ans?.explanation).toBeNull();
    });

    test("evaluates entirely auto forms with NOT_REQUIRED marking status", () => {
      const autoQuestions = [
        {
          id: "q1",
          questionType: BankQuestionType.SINGLE,
          points: 5,
          markingMethod: FormMarkingMethod.AUTO,
          correctAnswer: "A",
        },
      ];
      const res = evaluateSubmissionWithMarking(autoQuestions, [{ formQuestionId: "q1", value: "A" }]);
      expect(res.markingStatus).toBe(FormMarkingStatus.NOT_REQUIRED);
      expect(res.pendingCount).toBe(0);
      expect(res.totalScore).toBe(5);
    });
  });

  test.describe("computeAttemptMarkingSummary", () => {
    test("accurately tracks transitions from PENDING to PARTIALLY_MARKED and MARKED", () => {
      const initialAnswers = [
        { score: 5, points: 5, markingStatus: FormMarkingStatus.NOT_REQUIRED },
        { score: 0, points: 10, markingStatus: FormMarkingStatus.PENDING },
        { score: 0, points: 5, markingStatus: FormMarkingStatus.PENDING },
      ];

      const initialSummary = computeAttemptMarkingSummary(initialAnswers);
      expect(initialSummary.markingStatus).toBe(FormMarkingStatus.PENDING);
      expect(initialSummary.pendingCount).toBe(2);
      expect(initialSummary.markedCount).toBe(0);
      expect(initialSummary.totalScore).toBe(5);
      expect(initialSummary.maxScore).toBe(20);

      // Teacher marks 1 of the 2 manual questions
      const partialAnswers = [
        { score: 5, points: 5, markingStatus: FormMarkingStatus.NOT_REQUIRED },
        { score: 8, points: 10, markingStatus: FormMarkingStatus.MARKED },
        { score: 0, points: 5, markingStatus: FormMarkingStatus.PENDING },
      ];
      const partialSummary = computeAttemptMarkingSummary(partialAnswers);
      expect(partialSummary.markingStatus).toBe(FormMarkingStatus.PARTIALLY_MARKED);
      expect(partialSummary.pendingCount).toBe(1);
      expect(partialSummary.markedCount).toBe(1);
      expect(partialSummary.totalScore).toBe(13);
      expect(partialSummary.accuracyPercentage).toBe(65);

      // Teacher finishes marking all manual questions
      const fullyMarkedAnswers = [
        { score: 5, points: 5, markingStatus: FormMarkingStatus.NOT_REQUIRED },
        { score: 8, points: 10, markingStatus: FormMarkingStatus.MARKED },
        { score: 4, points: 5, markingStatus: FormMarkingStatus.MARKED },
      ];
      const fullyMarkedSummary = computeAttemptMarkingSummary(fullyMarkedAnswers);
      expect(fullyMarkedSummary.markingStatus).toBe(FormMarkingStatus.MARKED);
      expect(fullyMarkedSummary.pendingCount).toBe(0);
      expect(fullyMarkedSummary.markedCount).toBe(2);
      expect(fullyMarkedSummary.totalScore).toBe(17);
      expect(fullyMarkedSummary.accuracyPercentage).toBe(85);
    });
  });

  test.describe("canMarkResponse & sanitizeResponseForPupil", () => {
    test("refuses marking on IN_PROGRESS or ABANDONED attempts", () => {
      expect(canMarkResponse({ status: FormResponseStatus.IN_PROGRESS }).canMark).toBe(false);
      expect(canMarkResponse({ status: FormResponseStatus.ABANDONED }).canMark).toBe(false);
      expect(canMarkResponse({ status: FormResponseStatus.COMPLETED }).canMark).toBe(true);
    });

    test("sanitizes pending manual questions for pupil viewing while revealing marked questions", () => {
      const response = {
        status: FormResponseStatus.COMPLETED,
        markingStatus: FormMarkingStatus.PARTIALLY_MARKED,
        score: 13,
        maxScore: 20,
      };

      const answers = [
        {
          markingStatus: FormMarkingStatus.NOT_REQUIRED,
          score: 5,
          isCorrect: true,
          feedback: null,
          formQuestion: { correctAnswer: "A", explanation: "Rule A", points: 5 },
        },
        {
          markingStatus: FormMarkingStatus.MARKED,
          score: 8,
          isCorrect: true,
          feedback: "Great explanation",
          formQuestion: { correctAnswer: "Full text", explanation: "Detailed answer", points: 10 },
        },
        {
          markingStatus: FormMarkingStatus.PENDING,
          score: 0,
          isCorrect: null,
          feedback: null,
          formQuestion: { correctAnswer: "Secret key", explanation: "Secret explanation", points: 5 },
        },
      ];

      const sanitized = sanitizeResponseForPupil(response, answers);
      expect(sanitized.isPendingReview).toBe(true);

      // Pending question is masked
      const pendingAns = sanitized.answers[2];
      expect(pendingAns.isPending).toBe(true);
      expect(pendingAns.score).toBeNull();
      expect(pendingAns.correctAnswer).toBeNull();
      expect(pendingAns.explanation).toBeNull();

      // Marked question reveals teacher feedback and awarded score
      const markedAns = sanitized.answers[1];
      expect(markedAns.isPending).toBe(false);
      expect(markedAns.score).toBe(8);
      expect(markedAns.feedback).toBe("Great explanation");
      expect(markedAns.explanation).toBe("Detailed answer");
    });
  });
});
