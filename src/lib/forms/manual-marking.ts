import { BankQuestionType, FormMarkingMethod, FormMarkingStatus, FormResponseStatus } from "@prisma/client";
import { evaluateFormAnswer } from "./practice-sets";

export interface CleanQuestionForSubmission {
  id: string;
  questionType: BankQuestionType;
  points: number;
  markingMethod?: FormMarkingMethod;
  correctAnswer?: string | null;
  explanation?: string | null;
}

export interface EvaluatedSubmissionAnswer {
  formQuestionId: string;
  value: unknown;
  isCorrect: boolean | null;
  score: number;
  markingStatus: FormMarkingStatus;
  correctAnswer: string | null;
  explanation: string | null;
}

export interface SubmissionWithMarkingResult {
  evaluatedAnswers: EvaluatedSubmissionAnswer[];
  totalScore: number;
  maxScore: number;
  accuracyPercentage: number;
  markingStatus: FormMarkingStatus;
  pendingCount: number;
}

export interface AnswerMarkingInput {
  score: number;
  feedback?: string | null;
}

export interface AttemptMarkingSummary {
  totalScore: number;
  maxScore: number;
  accuracyPercentage: number;
  markingStatus: FormMarkingStatus;
  pendingCount: number;
  markedCount: number;
  notRequiredCount: number;
}

/**
 * Resolves the effective marking method for a question.
 * Short answers default to MANUAL per §8.8 (exact text match punishes spelling).
 * Choice questions default to AUTO.
 */
export function resolveMarkingMethod(questionType: BankQuestionType, explicitMethod?: FormMarkingMethod | null): FormMarkingMethod {
  if (explicitMethod) {
    return explicitMethod;
  }
  if (questionType === BankQuestionType.SHORT) {
    return FormMarkingMethod.MANUAL;
  }
  return FormMarkingMethod.AUTO;
}

/**
 * Validates a teacher-awarded score for an individual answer.
 * Score must be a valid number between 0 and the question's max points.
 */
export function validateAnswerScore(awardedScore: number, maxPoints: number): { valid: boolean; reason?: string } {
  if (typeof awardedScore !== "number" || isNaN(awardedScore) || !isFinite(awardedScore)) {
    return { valid: false, reason: "Awarded score must be a valid number." };
  }
  if (awardedScore < 0) {
    return { valid: false, reason: "Awarded score cannot be negative." };
  }
  if (awardedScore > maxPoints) {
    return {
      valid: false,
      reason: `Awarded score (${awardedScore}) cannot exceed maximum points (${maxPoints}).`,
    };
  }
  return { valid: true };
}

/**
 * Validates teacher feedback length (optional, up to 2000 characters).
 */
export function validateTeacherFeedback(feedback?: string | null): {
  valid: boolean;
  reason?: string;
} {
  if (feedback && feedback.length > 2000) {
    return {
      valid: false,
      reason: `Teacher feedback cannot exceed 2000 characters (given ${feedback.length}).`,
    };
  }
  return { valid: true };
}

/**
 * Evaluates submitted answers for a form taking manual marking into account.
 * Questions flagged as MANUAL have their answers marked PENDING and their keys/explanations withheld.
 */
export function evaluateSubmissionWithMarking(
  questions: CleanQuestionForSubmission[],
  submittedAnswers: Array<{ formQuestionId: string; value: unknown }>,
): SubmissionWithMarkingResult {
  const answerMap = new Map<string, unknown>();
  for (const ans of submittedAnswers) {
    answerMap.set(ans.formQuestionId, ans.value);
  }

  let totalScore = 0;
  let maxScore = 0;
  let pendingCount = 0;
  const evaluatedAnswers: EvaluatedSubmissionAnswer[] = [];

  for (const q of questions) {
    const qPoints = Math.max(0, q.points);
    maxScore += qPoints;

    const submittedVal = answerMap.get(q.id);
    const method = resolveMarkingMethod(q.questionType, q.markingMethod);

    if (method === FormMarkingMethod.MANUAL) {
      pendingCount++;
      evaluatedAnswers.push({
        formQuestionId: q.id,
        value: submittedVal ?? null,
        isCorrect: null,
        score: 0,
        markingStatus: FormMarkingStatus.PENDING,
        correctAnswer: null, // Scrubbed until marked
        explanation: null, // Scrubbed until marked
      });
    } else {
      const { isCorrect, score } = evaluateFormAnswer(q, submittedVal);
      totalScore += score;
      evaluatedAnswers.push({
        formQuestionId: q.id,
        value: submittedVal ?? null,
        isCorrect,
        score,
        markingStatus: FormMarkingStatus.NOT_REQUIRED,
        correctAnswer: q.correctAnswer ?? null,
        explanation: q.explanation ?? null,
      });
    }
  }

  const markingStatus = pendingCount > 0 ? FormMarkingStatus.PENDING : FormMarkingStatus.NOT_REQUIRED;

  const accuracyPercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0;

  return {
    evaluatedAnswers,
    totalScore,
    maxScore,
    accuracyPercentage,
    markingStatus,
    pendingCount,
  };
}

/**
 * Computes marking summary and effective overall status for an attempt.
 */
export function computeAttemptMarkingSummary(
  answers: Array<{
    score: number | null;
    points: number;
    markingStatus: FormMarkingStatus;
  }>,
): AttemptMarkingSummary {
  let totalScore = 0;
  let maxScore = 0;
  let pendingCount = 0;
  let markedCount = 0;
  let notRequiredCount = 0;

  for (const ans of answers) {
    const qPoints = Math.max(0, ans.points);
    maxScore += qPoints;
    totalScore += ans.score ?? 0;

    switch (ans.markingStatus) {
      case FormMarkingStatus.PENDING:
        pendingCount++;
        break;
      case FormMarkingStatus.MARKED:
        markedCount++;
        break;
      case FormMarkingStatus.NOT_REQUIRED:
        notRequiredCount++;
        break;
      default:
        break;
    }
  }

  let markingStatus: FormMarkingStatus;
  const manualAnswersCount = pendingCount + markedCount;

  if (manualAnswersCount === 0) {
    markingStatus = FormMarkingStatus.NOT_REQUIRED;
  } else if (pendingCount === 0) {
    markingStatus = FormMarkingStatus.MARKED;
  } else if (markedCount > 0) {
    markingStatus = FormMarkingStatus.PARTIALLY_MARKED;
  } else {
    markingStatus = FormMarkingStatus.PENDING;
  }

  const accuracyPercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0;

  return {
    totalScore,
    maxScore,
    accuracyPercentage,
    markingStatus,
    pendingCount,
    markedCount,
    notRequiredCount,
  };
}

/**
 * Checks whether a response can be marked by a teacher.
 * Response must be completed (submitted) before marking can occur.
 */
export function canMarkResponse(response: { status: FormResponseStatus }): { canMark: boolean; reason?: string } {
  if (response.status !== FormResponseStatus.COMPLETED) {
    return {
      canMark: false,
      reason: `Cannot mark response in status ${response.status}; must be COMPLETED.`,
    };
  }
  return { canMark: true };
}

/**
 * Sanitizes and formats a response for pupil viewing.
 * When marking is PENDING or PARTIALLY_MARKED, un-marked manual questions
 * withhold their scores and explanations, returning isPending: true.
 */
export function sanitizeResponseForPupil<
  T extends {
    markingStatus: FormMarkingStatus;
    score: number | null;
    isCorrect: boolean | null;
    feedback?: string | null;
    formQuestion?: {
      correctAnswer?: string | null;
      explanation?: string | null;
      points: number;
    } | null;
  },
>(
  response: {
    status: FormResponseStatus;
    markingStatus: FormMarkingStatus;
    score: number | null;
    maxScore: number | null;
  },
  answers: T[],
) {
  const isPendingReview =
    response.markingStatus === FormMarkingStatus.PENDING || response.markingStatus === FormMarkingStatus.PARTIALLY_MARKED;

  const sanitizedAnswers = answers.map((ans) => {
    if (ans.markingStatus === FormMarkingStatus.PENDING) {
      return {
        ...ans,
        score: null,
        isCorrect: null,
        feedback: null,
        isPending: true,
        correctAnswer: null,
        explanation: null,
      };
    }
    return {
      ...ans,
      isPending: false,
      correctAnswer: ans.formQuestion?.correctAnswer ?? null,
      explanation: ans.formQuestion?.explanation ?? null,
    };
  });

  return {
    ...response,
    isPendingReview,
    answers: sanitizedAnswers,
  };
}
