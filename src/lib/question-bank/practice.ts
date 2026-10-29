import { BankItemStatus, BankKind, BankQuestionType, BankVisibility, Prisma } from "@prisma/client";

// Pure domain logic and rules for Pupil Practice (Task 0024 / AlEemaan Task 0032 slice 4; design note §8.4).
// Contains no database access or network calls, allowing comprehensive isolated unit testing.

export interface BankItemPracticeRow {
  id: string;
  bank: BankKind;
  status: BankItemStatus;
  type: BankQuestionType;
  prompt: string;
  explanation: string | null;
  points: number;
  difficulty: number | null;
  topic: string | null;
  options: Prisma.JsonValue | unknown;
  correctAnswer: Prisma.JsonValue | unknown;
  subjectLabel: string | null;
  subjectKey: string | null;
  visibility: BankVisibility;
  visibleFrom?: Date | string | null;
}

export interface ScrubbedPracticeQuestion {
  id: string;
  type: BankQuestionType;
  prompt: string;
  points: number;
  difficulty: number | null;
  topic: string | null;
  options: Prisma.JsonValue;
  subjectLabel: string | null;
}

/**
 * Checks whether an item is eligible to be included in pupil practice pools.
 * (Design Rule 7.1: visibility = PRACTICE OR (visibility = TEACHERS_ONLY_UNTIL AND visibleFrom <= now)).
 */
export function isItemAvailableForPractice(
  item: {
    bank: BankKind;
    status: BankItemStatus;
    visibility: BankVisibility;
    visibleFrom?: Date | string | null;
  },
  now = new Date(),
): boolean {
  if (item.bank !== BankKind.ASSESSMENT || item.status !== BankItemStatus.APPROVED) {
    return false;
  }
  if (item.visibility === BankVisibility.PRACTICE) {
    return true;
  }
  if (item.visibility === BankVisibility.TEACHERS_ONLY_UNTIL && item.visibleFrom) {
    return new Date(item.visibleFrom) <= now;
  }
  return false;
}

/**
 * Scrubs answer keys and explanations from a bank item before returning it to a pupil.
 * (Design Rule 8.4 & Secrecy: A pupil route never returns correctAnswer or explanation before answering).
 */
export function scrubQuestionForPupil(item: BankItemPracticeRow): ScrubbedPracticeQuestion {
  return {
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    points: item.points,
    difficulty: item.difficulty,
    topic: item.topic,
    options: (Array.isArray(item.options) ? item.options : []) as Prisma.JsonValue,
    subjectLabel: item.subjectLabel,
  };
}

export interface PracticeEvaluationResult {
  correct: boolean;
  correctAnswer: Prisma.JsonValue;
  explanation: string | null;
}

/**
 * Evaluates a pupil's practice answer against the stored answer key.
 */
export function evaluatePracticeAnswer(
  item: {
    type: BankQuestionType;
    correctAnswer: Prisma.JsonValue | unknown;
    explanation: string | null;
  },
  pupilAnswer: unknown,
): PracticeEvaluationResult {
  const explanation = item.explanation;
  const rawCorrect = item.correctAnswer as Prisma.JsonValue;

  switch (item.type) {
    case BankQuestionType.SINGLE: {
      const expected = String(item.correctAnswer ?? "").trim();
      const actual = String(pupilAnswer ?? "").trim();
      return {
        correct: expected.length > 0 && expected === actual,
        correctAnswer: rawCorrect,
        explanation,
      };
    }

    case BankQuestionType.MULTI: {
      const expectedArr = Array.isArray(item.correctAnswer)
        ? (item.correctAnswer as unknown[]).map(String).sort()
        : [String(item.correctAnswer ?? "")];
      const actualArr = Array.isArray(pupilAnswer) ? (pupilAnswer as unknown[]).map(String).sort() : [String(pupilAnswer ?? "")];

      const match = expectedArr.length === actualArr.length && expectedArr.every((val, idx) => val === actualArr[idx]);

      return {
        correct: match,
        correctAnswer: rawCorrect,
        explanation,
      };
    }

    case BankQuestionType.TRUE_FALSE: {
      const normExpected = String(item.correctAnswer ?? "")
        .trim()
        .toLowerCase();
      const normActual = String(pupilAnswer ?? "")
        .trim()
        .toLowerCase();
      const match =
        (normExpected === "true" && (normActual === "true" || pupilAnswer === true)) ||
        (normExpected === "false" && (normActual === "false" || pupilAnswer === false));

      return {
        correct: match,
        correctAnswer: normExpected === "true",
        explanation,
      };
    }

    case BankQuestionType.SHORT: {
      const actualStr = String(pupilAnswer ?? "")
        .trim()
        .toLowerCase();
      let match = false;

      if (Array.isArray(item.correctAnswer)) {
        match = (item.correctAnswer as unknown[]).some((ans) => String(ans).trim().toLowerCase() === actualStr);
      } else if (typeof item.correctAnswer === "string") {
        match = item.correctAnswer.trim().toLowerCase() === actualStr;
      }

      return {
        correct: actualStr.length > 0 && match,
        correctAnswer: rawCorrect,
        explanation,
      };
    }

    default:
      return {
        correct: false,
        correctAnswer: null,
        explanation,
      };
  }
}

/**
 * Calculates remaining daily practice allowance.
 */
export function computeDailyCapRemaining(todayAttemptsCount: number, dailyCap: number): number {
  return Math.max(0, dailyCap - Math.max(0, todayAttemptsCount));
}

/**
 * Validates and clamps session size against school limits and pool size.
 */
export function determineSessionSize(
  requestedSize: number | undefined,
  poolCount: number,
  limits: {
    maxQuestions: number;
    defaultQuestions: number;
    presets: readonly number[];
  },
): number {
  if (poolCount <= 0) return 0;

  let size = requestedSize ?? limits.defaultQuestions;
  if (!Number.isInteger(size) || size <= 0) {
    size = limits.defaultQuestions;
  }

  // Size cannot exceed school maxQuestions or available poolCount
  return Math.min(size, limits.maxQuestions, poolCount);
}

export interface GuardianTopicSummary {
  subjectLabel: string;
  topic: string;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface GuardianPracticeSummary {
  totalSessions: number;
  totalAttempted: number;
  totalCorrect: number;
  overallAccuracy: number;
  topics: GuardianTopicSummary[];
}

/**
 * Aggregates practice performance metrics for a guardian (SUMMARY level).
 * Strict invariant: Never returns question prompts, option texts, or answers.
 */
export function aggregateGuardianSummary(
  sessionsCount: number,
  attempts: Array<{
    correct: boolean;
    subjectLabel?: string | null;
    topic?: string | null;
  }>,
): GuardianPracticeSummary {
  const totalAttempted = attempts.length;
  let totalCorrect = 0;

  const topicMap = new Map<string, { subjectLabel: string; topic: string; attempted: number; correct: number }>();

  for (const att of attempts) {
    if (att.correct) totalCorrect++;

    const subject = att.subjectLabel?.trim() || "General";
    const topic = att.topic?.trim() || "All Topics";
    const key = `${subject}:::${topic}`;

    const current = topicMap.get(key) ?? {
      subjectLabel: subject,
      topic,
      attempted: 0,
      correct: 0,
    };
    current.attempted++;
    if (att.correct) current.correct++;
    topicMap.set(key, current);
  }

  const topics: GuardianTopicSummary[] = Array.from(topicMap.values()).map((t) => ({
    subjectLabel: t.subjectLabel,
    topic: t.topic,
    attempted: t.attempted,
    correct: t.correct,
    accuracy: t.attempted > 0 ? Math.round((t.correct / t.attempted) * 100) : 0,
  }));

  return {
    totalSessions: sessionsCount,
    totalAttempted,
    totalCorrect,
    overallAccuracy: totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0,
    topics,
  };
}
