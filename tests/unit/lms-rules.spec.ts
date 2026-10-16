import "../support/env";
import { test, expect } from "@playwright/test";
import {
  determineSubmissionStatus,
  calculateGradePercentage,
  evaluateQuizAttempt,
  QuizQuestionItem,
  QuizAnswerItem,
} from "@/lib/lms/rules";
import {
  createAssignmentSchema,
  gradeSubmissionSchema,
  createLearningMaterialSchema,
  createQuizSchema,
} from "@/lib/lms/validation";

test.describe("LMS — Submission Status Engine", () => {
  test("returns PENDING when there is no submission date", () => {
    const status = determineSubmissionStatus({
      submittedAt: null,
      dueDate: new Date(Date.now() + 86400000),
    });
    expect(status).toBe("PENDING");
  });

  test("returns SUBMITTED when work is submitted before due date", () => {
    const now = new Date();
    const futureDue = new Date(now.getTime() + 86400000);
    const status = determineSubmissionStatus({
      submittedAt: now,
      dueDate: futureDue,
    });
    expect(status).toBe("SUBMITTED");
  });

  test("returns LATE when work is submitted after due date", () => {
    const pastDue = new Date("2026-10-10T12:00:00Z");
    const laterSubmission = new Date("2026-10-10T14:30:00Z");
    const status = determineSubmissionStatus({
      submittedAt: laterSubmission,
      dueDate: pastDue,
    });
    expect(status).toBe("LATE");
  });

  test("returns SUBMITTED if no due date is set", () => {
    const status = determineSubmissionStatus({
      submittedAt: new Date(),
      dueDate: null,
    });
    expect(status).toBe("SUBMITTED");
  });
});

test.describe("LMS — Grading & Percentage Computations", () => {
  test("calculates exact percentage rounded to 2 decimal places", () => {
    expect(calculateGradePercentage(85, 100)).toBe(85);
    expect(calculateGradePercentage(17, 20)).toBe(85);
    expect(calculateGradePercentage(33, 40)).toBe(82.5);
  });

  test("throws error when score exceeds total points", () => {
    expect(() => calculateGradePercentage(105, 100)).toThrow("Score cannot exceed total points");
  });

  test("throws error when score is negative or total points is zero", () => {
    expect(() => calculateGradePercentage(-5, 100)).toThrow("Score cannot be negative");
    expect(() => calculateGradePercentage(10, 0)).toThrow("Total points must be greater than zero");
  });
});

test.describe("LMS — Quiz Auto-Evaluation Engine", () => {
  const sampleQuestions: QuizQuestionItem[] = [
    {
      id: "q1",
      questionType: "MULTIPLE_CHOICE",
      correctAnswer: "B",
      points: 2,
    },
    {
      id: "q2",
      questionType: "TRUE_FALSE",
      correctAnswer: "true",
      points: 1,
    },
    {
      id: "q3",
      questionType: "SHORT_ANSWER",
      correctAnswer: "Photosynthesis",
      points: 3,
    },
  ];

  test("evaluates fully correct quiz attempt", () => {
    const answers: QuizAnswerItem[] = [
      { questionId: "q1", answer: "B" },
      { questionId: "q2", answer: "true" },
      { questionId: "q3", answer: "photosynthesis" }, // Case-insensitive
    ];

    const result = evaluateQuizAttempt(sampleQuestions, answers, 60);
    expect(result.totalPossiblePoints).toBe(6);
    expect(result.earnedPoints).toBe(6);
    expect(result.percentage).toBe(100);
    expect(result.isPassed).toBe(true);
  });

  test("handles partial credit and failing score", () => {
    const answers: QuizAnswerItem[] = [
      { questionId: "q1", answer: "A" }, // Wrong
      { questionId: "q2", answer: "true" }, // Correct (1 pt)
      { questionId: "q3", answer: "Respiration" }, // Wrong
    ];

    const result = evaluateQuizAttempt(sampleQuestions, answers, 50);
    expect(result.earnedPoints).toBe(1);
    expect(result.totalPossiblePoints).toBe(6);
    expect(result.percentage).toBe(16.67);
    expect(result.isPassed).toBe(false);
  });
});

test.describe("LMS — Validation Schemas", () => {
  test("validates assignment creation schema", () => {
    const valid = createAssignmentSchema.safeParse({
      title: "Algebraic Factorization Worksheet",
      subjectId: "sub_123",
      totalPoints: 50,
      dueDate: "2026-10-25T18:00:00.000Z",
      status: "PUBLISHED",
      attachments: [{ title: "Worksheet PDF", url: "https://example.com/sheet.pdf" }],
    });
    expect(valid.success).toBe(true);

    const invalid = createAssignmentSchema.safeParse({
      title: "",
      subjectId: "",
    });
    expect(invalid.success).toBe(false);
  });

  test("validates grading schema constraints", () => {
    const valid = gradeSubmissionSchema.safeParse({
      score: 45.5,
      feedback: "Great analytical breakdown of polynomial roots.",
      status: "GRADED",
    });
    expect(valid.success).toBe(true);

    const negative = gradeSubmissionSchema.safeParse({
      score: -10,
    });
    expect(negative.success).toBe(false);
  });

  test("validates course material creation schema", () => {
    const valid = createLearningMaterialSchema.safeParse({
      title: "Biology Term 1 Syllabus & Reading Guide",
      subjectId: "sub_bio",
      description: "Comprehensive notes for Weeks 1 through 6.",
      content: "# Cell Structure\nDetailed breakdown of organelles...",
      attachments: [{ title: "Cytology Atlas", url: "https://example.com/atlas.pdf" }],
    });
    expect(valid.success).toBe(true);
  });

  test("validates quiz creation schema", () => {
    const valid = createQuizSchema.safeParse({
      title: "Chemistry Periodic Table Speed Quiz",
      subjectId: "sub_chem",
      timeLimitMinutes: 15,
      passingScore: 60,
      status: "PUBLISHED",
      questions: [
        {
          prompt: "What is the atomic symbol for Gold?",
          questionType: "MULTIPLE_CHOICE",
          options: [
            { id: "A", text: "Ag" },
            { id: "B", text: "Au" },
            { id: "C", text: "Fe" },
          ],
          correctAnswer: "B",
          points: 1,
        },
      ],
    });
    expect(valid.success).toBe(true);
  });
});
