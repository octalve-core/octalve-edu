import "../support/env";
import { test, expect } from "@playwright/test";
import { BankItemStatus, BankKind, BankQuestionType, BankVisibility } from "@prisma/client";
import {
  isItemAvailableForPractice,
  scrubQuestionForPupil,
  evaluatePracticeAnswer,
  computeDailyCapRemaining,
  determineSessionSize,
  aggregateGuardianSummary,
} from "@/lib/question-bank/practice";

const NOW = new Date("2026-10-28T12:00:00Z");
const PAST = new Date("2026-10-01T00:00:00Z");
const FUTURE = new Date("2026-12-01T00:00:00Z");

test.describe("Pupil Practice - Pure Domain Rules", () => {
  test.describe("isItemAvailableForPractice", () => {
    test("approved PRACTICE item is available", () => {
      expect(
        isItemAvailableForPractice(
          {
            bank: BankKind.ASSESSMENT,
            status: BankItemStatus.APPROVED,
            visibility: BankVisibility.PRACTICE,
          },
          NOW,
        ),
      ).toBe(true);
    });

    test("draft or pending items are never available", () => {
      expect(
        isItemAvailableForPractice(
          {
            bank: BankKind.ASSESSMENT,
            status: BankItemStatus.DRAFT,
            visibility: BankVisibility.PRACTICE,
          },
          NOW,
        ),
      ).toBe(false);

      expect(
        isItemAvailableForPractice(
          {
            bank: BankKind.ASSESSMENT,
            status: BankItemStatus.PENDING,
            visibility: BankVisibility.PRACTICE,
          },
          NOW,
        ),
      ).toBe(false);
    });

    test("questionnaire items are never available for assessment practice", () => {
      expect(
        isItemAvailableForPractice(
          {
            bank: BankKind.QUESTIONNAIRE,
            status: BankItemStatus.APPROVED,
            visibility: BankVisibility.PRACTICE,
          },
          NOW,
        ),
      ).toBe(false);
    });

    test("TEACHERS_ONLY item is never available for pupils", () => {
      expect(
        isItemAvailableForPractice(
          {
            bank: BankKind.ASSESSMENT,
            status: BankItemStatus.APPROVED,
            visibility: BankVisibility.TEACHERS_ONLY,
          },
          NOW,
        ),
      ).toBe(false);
    });

    test("TEACHERS_ONLY_UNTIL is available only after visibleFrom", () => {
      expect(
        isItemAvailableForPractice(
          {
            bank: BankKind.ASSESSMENT,
            status: BankItemStatus.APPROVED,
            visibility: BankVisibility.TEACHERS_ONLY_UNTIL,
            visibleFrom: FUTURE,
          },
          NOW,
        ),
      ).toBe(false);

      expect(
        isItemAvailableForPractice(
          {
            bank: BankKind.ASSESSMENT,
            status: BankItemStatus.APPROVED,
            visibility: BankVisibility.TEACHERS_ONLY_UNTIL,
            visibleFrom: PAST,
          },
          NOW,
        ),
      ).toBe(true);
    });
  });

  test.describe("scrubQuestionForPupil", () => {
    test("removes correctAnswer and explanation while keeping options and prompt", () => {
      const scrubbed = scrubQuestionForPupil({
        id: "item-123",
        bank: BankKind.ASSESSMENT,
        status: BankItemStatus.APPROVED,
        type: BankQuestionType.SINGLE,
        prompt: "What is 2 + 2?",
        explanation: "Simple arithmetic.",
        points: 2,
        difficulty: 1,
        topic: "Addition",
        options: [
          { id: "o1", text: "3" },
          { id: "o2", text: "4" },
        ],
        correctAnswer: "o2",
        subjectLabel: "Mathematics",
        subjectKey: "mathematics",
        visibility: BankVisibility.PRACTICE,
      });

      expect(scrubbed.id).toBe("item-123");
      expect(scrubbed.prompt).toBe("What is 2 + 2?");
      expect(scrubbed.points).toBe(2);
      expect(scrubbed.topic).toBe("Addition");
      expect(scrubbed.subjectLabel).toBe("Mathematics");
      expect((scrubbed as unknown as Record<string, unknown>).correctAnswer).toBeUndefined();
      expect((scrubbed as unknown as Record<string, unknown>).explanation).toBeUndefined();
      expect(scrubbed.options).toEqual([
        { id: "o1", text: "3" },
        { id: "o2", text: "4" },
      ]);
    });
  });

  test.describe("evaluatePracticeAnswer", () => {
    test("evaluates SINGLE choice questions correctly", () => {
      const item = {
        type: BankQuestionType.SINGLE,
        correctAnswer: "o2",
        explanation: "Correct option is o2",
      };

      const correct = evaluatePracticeAnswer(item, "o2");
      expect(correct.correct).toBe(true);
      expect(correct.correctAnswer).toBe("o2");
      expect(correct.explanation).toBe("Correct option is o2");

      const wrong = evaluatePracticeAnswer(item, "o1");
      expect(wrong.correct).toBe(false);
    });

    test("evaluates MULTI choice questions correctly regardless of selection order", () => {
      const item = {
        type: BankQuestionType.MULTI,
        correctAnswer: ["o1", "o3"],
        explanation: "Options 1 and 3 are correct",
      };

      expect(evaluatePracticeAnswer(item, ["o3", "o1"]).correct).toBe(true);
      expect(evaluatePracticeAnswer(item, ["o1"]).correct).toBe(false);
      expect(evaluatePracticeAnswer(item, ["o1", "o2", "o3"]).correct).toBe(false);
    });

    test("evaluates TRUE_FALSE questions correctly (case insensitive / boolean)", () => {
      const item = {
        type: BankQuestionType.TRUE_FALSE,
        correctAnswer: "true",
        explanation: "The sky is blue",
      };

      expect(evaluatePracticeAnswer(item, true).correct).toBe(true);
      expect(evaluatePracticeAnswer(item, "True").correct).toBe(true);
      expect(evaluatePracticeAnswer(item, false).correct).toBe(false);
      expect(evaluatePracticeAnswer(item, "false").correct).toBe(false);
    });

    test("evaluates SHORT answer questions with whitespace & case normalization", () => {
      const item = {
        type: BankQuestionType.SHORT,
        correctAnswer: ["Paris", "City of Light"],
        explanation: "Capital of France",
      };

      expect(evaluatePracticeAnswer(item, "paris").correct).toBe(true);
      expect(evaluatePracticeAnswer(item, "  PARIS  ").correct).toBe(true);
      expect(evaluatePracticeAnswer(item, "city of light").correct).toBe(true);
      expect(evaluatePracticeAnswer(item, "London").correct).toBe(false);
    });
  });

  test.describe("computeDailyCapRemaining and determineSessionSize", () => {
    test("computes remaining daily cap allowance", () => {
      expect(computeDailyCapRemaining(0, 100)).toBe(100);
      expect(computeDailyCapRemaining(45, 100)).toBe(55);
      expect(computeDailyCapRemaining(100, 100)).toBe(0);
      expect(computeDailyCapRemaining(120, 100)).toBe(0);
    });

    test("determines session size clamped to pool and school limits", () => {
      const limits = {
        maxQuestions: 50,
        defaultQuestions: 20,
        presets: [10, 20, 30, 50],
      };

      // Normal within limits
      expect(determineSessionSize(30, 100, limits)).toBe(30);

      // Exceeds maxQuestions
      expect(determineSessionSize(100, 100, limits)).toBe(50);

      // Exceeds pool size
      expect(determineSessionSize(30, 15, limits)).toBe(15);

      // Default fallback when undefined or invalid
      expect(determineSessionSize(undefined, 100, limits)).toBe(20);
      expect(determineSessionSize(-5, 100, limits)).toBe(20);

      // Empty pool
      expect(determineSessionSize(20, 0, limits)).toBe(0);
    });
  });

  test.describe("aggregateGuardianSummary", () => {
    test("produces accurate high-level statistics without exposing prompts or answers", () => {
      const attempts = [
        { correct: true, subjectLabel: "Mathematics", topic: "Algebra" },
        { correct: false, subjectLabel: "Mathematics", topic: "Algebra" },
        { correct: true, subjectLabel: "Mathematics", topic: "Geometry" },
        { correct: true, subjectLabel: "Physics", topic: "Mechanics" },
        { correct: true, subjectLabel: "Physics", topic: "Mechanics" },
      ];

      const summary = aggregateGuardianSummary(2, attempts);

      expect(summary.totalSessions).toBe(2);
      expect(summary.totalAttempted).toBe(5);
      expect(summary.totalCorrect).toBe(4);
      expect(summary.overallAccuracy).toBe(80);

      expect(summary.topics).toHaveLength(3);
      const algebra = summary.topics.find((t) => t.topic === "Algebra");
      expect(algebra?.attempted).toBe(2);
      expect(algebra?.correct).toBe(1);
      expect(algebra?.accuracy).toBe(50);

      const mechanics = summary.topics.find((t) => t.topic === "Mechanics");
      expect(mechanics?.attempted).toBe(2);
      expect(mechanics?.correct).toBe(2);
      expect(mechanics?.accuracy).toBe(100);

      // Crucial privacy invariant: no prompt or answer fields exist anywhere in summary
      expect((summary as unknown as Record<string, unknown>).prompt).toBeUndefined();
      expect((summary as unknown as Record<string, unknown>).answer).toBeUndefined();
    });
  });
});
