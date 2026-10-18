// Pure business logic and calculation rules for LMS & Assignments (Phase 4)

import { SubmissionStatus } from "@prisma/client";

export interface EvaluationInput {
  submittedAt: Date | null;
  dueDate: Date | null;
  allowLate?: boolean;
}

/**
 * Determines whether a submission is on-time or late.
 */
export function determineSubmissionStatus(input: EvaluationInput): SubmissionStatus {
  if (!input.submittedAt) {
    return "PENDING";
  }

  if (input.dueDate && input.submittedAt.getTime() > input.dueDate.getTime()) {
    return "LATE";
  }

  return "SUBMITTED";
}

/**
 * Calculates grade percentage from raw score and total points.
 */
export function calculateGradePercentage(score: number, totalPoints: number): number {
  if (totalPoints <= 0) {
    throw new Error("Total points must be greater than zero");
  }
  if (score < 0) {
    throw new Error("Score cannot be negative");
  }
  if (score > totalPoints) {
    throw new Error("Score cannot exceed total points");
  }

  const rawPercent = (score / totalPoints) * 100;
  return Math.round(rawPercent * 100) / 100;
}

export interface QuizQuestionItem {
  id: string;
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  correctAnswer: string;
  points: number;
}

export interface QuizAnswerItem {
  questionId: string;
  answer: string;
}

export interface QuizEvaluationResult {
  totalPossiblePoints: number;
  earnedPoints: number;
  percentage: number;
  isPassed: boolean;
  breakdown: Array<{
    questionId: string;
    isCorrect: boolean;
    earned: number;
    possible: number;
  }>;
}

/**
 * Automatically evaluates an objective quiz attempt against question answer keys.
 */
export function evaluateQuizAttempt(
  questions: QuizQuestionItem[],
  answers: QuizAnswerItem[],
  passingScore?: number | null,
): QuizEvaluationResult {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer.trim().toLowerCase()]));
  let earnedPoints = 0;
  let totalPossiblePoints = 0;

  const breakdown = questions.map((q) => {
    totalPossiblePoints += q.points;
    const submitted = answerMap.get(q.id) ?? "";
    const expected = q.correctAnswer.trim().toLowerCase();
    const isCorrect = submitted !== "" && submitted === expected;
    const earned = isCorrect ? q.points : 0;
    earnedPoints += earned;

    return {
      questionId: q.id,
      isCorrect,
      earned,
      possible: q.points,
    };
  });

  const percentage = totalPossiblePoints > 0 ? (earnedPoints / totalPossiblePoints) * 100 : 0;
  const roundedPercent = Math.round(percentage * 100) / 100;
  const isPassed = passingScore ? roundedPercent >= passingScore : roundedPercent >= 50;

  return {
    totalPossiblePoints,
    earnedPoints,
    percentage: roundedPercent,
    isPassed,
    breakdown,
  };
}
