import { evaluateQuizAttempt, type QuizQuestionItem } from "@/lib/lms/rules";

// Re-scoring the attempts of an assessment after a question in it has been corrected (design note 8.5: "apply the correction to that copy and re-grade attempts"). The rules here are
// pure; `reports-service.ts` reads the rows, calls them, and writes the result under the report's transaction.

/// The most attempts one correction will re-score. A correction is all or nothing: above this it is refused outright rather than done in part.
export const MAX_REGRADE_ATTEMPTS = 5000;

/// A question as the quiz's evaluator takes it (the key, the points and the type).
export type RegradeQuestion = QuizQuestionItem;

export interface RegradeAttempt {
  id: string;
  /// As stored: a list of `{ questionId, answer }`. Anything else is left alone.
  answers: unknown;
  score: number;
  isPassed: boolean;
}

export interface AttemptChange {
  attemptId: string;
  fromScore: number;
  toScore: number;
  fromPassed: boolean;
  toPassed: boolean;
}

function readAnswers(raw: unknown): Array<{ questionId: string; answer: string }> | null {
  if (!Array.isArray(raw)) return null;
  const answers: Array<{ questionId: string; answer: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { questionId, answer } = entry as Record<string, unknown>;
    if (typeof questionId !== "string" || typeof answer !== "string") return null;
    answers.push({ questionId, answer });
  }
  return answers;
}

/**
 * Scores each attempt again against the quiz's questions as they are now, with the rule a quiz is graded by, and returns the attempts whose score or pass mark changes. An attempt whose
 * stored answers cannot be read is counted and left alone: it is never guessed at.
 */
export function planAttemptRegrade(
  questions: RegradeQuestion[],
  passingScore: number | null,
  attempts: RegradeAttempt[],
): { changes: AttemptChange[]; unreadable: number } {
  const changes: AttemptChange[] = [];
  let unreadable = 0;
  for (const attempt of attempts) {
    const answers = readAnswers(attempt.answers);
    if (!answers) {
      unreadable += 1;
      continue;
    }
    const result = evaluateQuizAttempt(questions, answers, passingScore);
    if (result.percentage !== attempt.score || result.isPassed !== attempt.isPassed) {
      changes.push({
        attemptId: attempt.id,
        fromScore: attempt.score,
        toScore: result.percentage,
        fromPassed: attempt.isPassed,
        toPassed: result.isPassed,
      });
    }
  }
  return { changes, unreadable };
}

/// Changes with the same new result, so that they can be written with one statement each.
export function groupChanges(changes: AttemptChange[]): Array<{ score: number; isPassed: boolean; attemptIds: string[] }> {
  const groups = new Map<string, { score: number; isPassed: boolean; attemptIds: string[] }>();
  for (const change of changes) {
    const key = `${change.toScore}|${change.toPassed}`;
    const group = groups.get(key) ?? { score: change.toScore, isPassed: change.toPassed, attemptIds: [] };
    group.attemptIds.push(change.attemptId);
    groups.set(key, group);
  }
  return [...groups.values()];
}
