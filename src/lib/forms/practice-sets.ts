import { BankQuestionType, FormStatus, FormAudienceKind } from "@prisma/client";

export interface CleanFormQuestionForPupil {
  id: string;
  prompt: string;
  questionType: BankQuestionType;
  options: unknown;
  points: number;
  sortOrder: number;
}

export interface EvaluatedFormAnswer {
  formQuestionId: string;
  value: unknown;
  isCorrect: boolean;
  score: number;
  correctAnswer: string | null;
  explanation: string | null;
}

export interface EvaluationResult {
  evaluatedAnswers: EvaluatedFormAnswer[];
  totalScore: number;
  maxScore: number;
  accuracyPercentage: number;
}

/**
 * Determines whether a practice set or form is currently open for submission.
 */
export function isFormOpen(
  form: {
    status: FormStatus;
    opensAt?: Date | null;
    closesAt?: Date | null;
  },
  now: Date = new Date(),
): { isOpen: boolean; reason?: "NOT_PUBLISHED" | "NOT_YET_OPEN" | "CLOSED" } {
  if (form.status !== FormStatus.PUBLISHED) {
    return { isOpen: false, reason: "NOT_PUBLISHED" };
  }

  if (form.opensAt && now < form.opensAt) {
    return { isOpen: false, reason: "NOT_YET_OPEN" };
  }

  if (form.closesAt && now > form.closesAt) {
    return { isOpen: false, reason: "CLOSED" };
  }

  return { isOpen: true };
}

/// How long past the time limit an attempt is still taken: the pupil's clock, the network and the request each take a moment, and a pupil who presses Submit as the time ends should not lose the work.
export const TIME_LIMIT_GRACE_MS = 60_000;

/**
 * Whether an attempt started at `startedAt` is still inside the set's time limit (`maxDurationMinutes`, null when there is none).
 */
export function isWithinTimeLimit(startedAt: Date, maxDurationMinutes: number | null | undefined, now: Date = new Date()): boolean {
  if (!maxDurationMinutes) return true;
  return now.getTime() <= startedAt.getTime() + maxDurationMinutes * 60_000 + TIME_LIMIT_GRACE_MS;
}

/// Whether a set of `formCampusId` is for a pupil of `pupilCampusId`: a set of one campus is for the pupils of that campus; a whole-school set (no campus) is for all. A pupil with no campus
/// of their own is reached by the whole-school sets only.
export function isFormForPupilCampus(formCampusId: string | null, pupilCampusId: string | null): boolean {
  return formCampusId === null || formCampusId === pupilCampusId;
}

/**
 * Scrubs correctAnswer and explanation from question before delivering to pupils.
 * Enforces exam secrecy invariant: pupils never receive keys before completing.
 */
export function scrubFormQuestionForPupil(question: {
  id: string;
  prompt: string;
  questionType: BankQuestionType;
  options: unknown;
  points: number;
  sortOrder: number;
  correctAnswer?: string | null;
  explanation?: string | null;
}): CleanFormQuestionForPupil {
  return {
    id: question.id,
    prompt: question.prompt,
    questionType: question.questionType,
    options: question.options,
    points: question.points,
    sortOrder: question.sortOrder,
  };
}

/// A question as a person who may VIEW a form but not manage it sees it (task 0024): the question, its options and its points, never the correct answer or the explanation.
export function withoutAnswerKey<T extends { correctAnswer?: string | null; explanation?: string | null }>(
  question: T,
): Omit<T, "correctAnswer" | "explanation"> {
  const copy: Partial<T> = { ...question };
  delete copy.correctAnswer;
  delete copy.explanation;
  return copy as Omit<T, "correctAnswer" | "explanation">;
}

/**
 * Scrubs all questions for pupil delivery, maintaining sortOrder.
 */
export function scrubFormQuestionsForPupil(
  questions: Array<{
    id: string;
    prompt: string;
    questionType: BankQuestionType;
    options: unknown;
    points: number;
    sortOrder: number;
    correctAnswer?: string | null;
    explanation?: string | null;
  }>,
): CleanFormQuestionForPupil[] {
  return [...questions].sort((a, b) => a.sortOrder - b.sortOrder).map(scrubFormQuestionForPupil);
}

/**
 * Evaluates an individual answer against the question's correct answer.
 */
export function evaluateFormAnswer(
  question: {
    questionType: BankQuestionType;
    correctAnswer?: string | null;
    points: number;
  },
  submittedValue: unknown,
): { isCorrect: boolean; score: number } {
  const points = Math.max(0, question.points);

  if (!question.correctAnswer || submittedValue === null || submittedValue === undefined) {
    return { isCorrect: false, score: 0 };
  }

  const expected = question.correctAnswer.trim();

  switch (question.questionType) {
    case BankQuestionType.SINGLE: {
      const actual = String(submittedValue).trim();
      const match = actual.toUpperCase() === expected.toUpperCase();
      return { isCorrect: match, score: match ? points : 0 };
    }

    case BankQuestionType.TRUE_FALSE: {
      const normalizeBool = (val: string) => {
        const lower = val.toLowerCase().trim();
        return lower === "true" || lower === "t" || lower === "1" ? "TRUE" : "FALSE";
      };
      const actual = normalizeBool(String(submittedValue));
      const exp = normalizeBool(expected);
      const match = actual === exp;
      return { isCorrect: match, score: match ? points : 0 };
    }

    case BankQuestionType.MULTI: {
      let actualArr: string[] = [];
      if (Array.isArray(submittedValue)) {
        actualArr = submittedValue.map((v) => String(v).trim().toUpperCase());
      } else {
        actualArr = String(submittedValue)
          .split(",")
          .map((v) => v.trim().toUpperCase());
      }

      let expArr: string[] = [];
      try {
        const parsed = JSON.parse(expected);
        if (Array.isArray(parsed)) {
          expArr = parsed.map((v) => String(v).trim().toUpperCase());
        } else {
          expArr = expected.split(",").map((v) => v.trim().toUpperCase());
        }
      } catch {
        expArr = expected.split(",").map((v) => v.trim().toUpperCase());
      }

      const actualSet = new Set(actualArr.filter(Boolean));
      const expSet = new Set(expArr.filter(Boolean));

      const match = actualSet.size === expSet.size && [...actualSet].every((val) => expSet.has(val));
      return { isCorrect: match, score: match ? points : 0 };
    }

    case BankQuestionType.SHORT: {
      const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
      const match = normalizeText(String(submittedValue)) === normalizeText(expected);
      return { isCorrect: match, score: match ? points : 0 };
    }

    default:
      return { isCorrect: false, score: 0 };
  }
}

/**
 * Evaluates all submitted answers for a practice set form.
 */
export function evaluateFormSubmission(
  questions: Array<{
    id: string;
    questionType: BankQuestionType;
    correctAnswer?: string | null;
    explanation?: string | null;
    points: number;
  }>,
  answers: Array<{ formQuestionId: string; value: unknown }>,
): EvaluationResult {
  const answerMap = new Map<string, unknown>();
  for (const ans of answers) {
    answerMap.set(ans.formQuestionId, ans.value);
  }

  let totalScore = 0;
  let maxScore = 0;
  const evaluatedAnswers: EvaluatedFormAnswer[] = [];

  for (const q of questions) {
    const qPoints = Math.max(0, q.points);
    maxScore += qPoints;

    const submittedVal = answerMap.get(q.id);
    const { isCorrect, score } = evaluateFormAnswer(q, submittedVal);
    totalScore += score;

    evaluatedAnswers.push({
      formQuestionId: q.id,
      value: submittedVal ?? null,
      isCorrect,
      score,
      correctAnswer: q.correctAnswer ?? null,
      explanation: q.explanation ?? null,
    });
  }

  const accuracyPercentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0;

  return {
    evaluatedAnswers,
    totalScore,
    maxScore,
    accuracyPercentage,
  };
}

/**
 * Checks whether a pupil is in the audience for a form.
 */
export function isPupilAudienceEligible(
  audience: {
    kind: FormAudienceKind;
    roles: unknown;
    classGroupIds: unknown;
  },
  pupilClassGroupId: string | null,
): boolean {
  if (audience.kind === FormAudienceKind.PUBLIC) {
    return true;
  }

  // Check roles: must allow STUDENT (or empty/all)
  if (Array.isArray(audience.roles) && audience.roles.length > 0) {
    if (!audience.roles.includes("STUDENT")) {
      return false;
    }
  }

  // Check class groups: if specified, pupil's class must match
  if (Array.isArray(audience.classGroupIds) && audience.classGroupIds.length > 0) {
    if (!pupilClassGroupId || !audience.classGroupIds.includes(pupilClassGroupId)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates practice set creation inputs.
 */
export function validatePracticeSetInput(data: {
  title: unknown;
  instructions?: unknown;
  opensAt?: unknown;
  closesAt?: unknown;
  maxDurationMinutes?: unknown;
}): { ok: true } | { ok: false; message: string } {
  if (typeof data.title !== "string" || data.title.trim().length === 0) {
    return { ok: false, message: "Title is required." };
  }

  if (data.title.trim().length > 200) {
    return { ok: false, message: "Title cannot exceed 200 characters." };
  }

  let opens: Date | null = null;
  let closes: Date | null = null;

  if (data.opensAt) {
    opens = new Date(String(data.opensAt));
    if (isNaN(opens.getTime())) {
      return { ok: false, message: "Invalid opensAt date." };
    }
  }

  if (data.closesAt) {
    closes = new Date(String(data.closesAt));
    if (isNaN(closes.getTime())) {
      return { ok: false, message: "Invalid closesAt date." };
    }
  }

  if (opens && closes && opens >= closes) {
    return { ok: false, message: "opensAt must be earlier than closesAt." };
  }

  if (data.maxDurationMinutes !== undefined && data.maxDurationMinutes !== null) {
    const mins = Number(data.maxDurationMinutes);
    if (!Number.isInteger(mins) || mins < 1 || mins > 1440) {
      return { ok: false, message: "maxDurationMinutes must be between 1 and 1440." };
    }
  }

  return { ok: true };
}
