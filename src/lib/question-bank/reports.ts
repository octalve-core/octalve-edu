import { QuestionReportOutcome, QuestionReportStatus } from "@prisma/client";
import { hasForbiddenCharacters } from "@/lib/question-bank/validation";

export const MIN_REPORT_REASON_LENGTH = 5;
export const MAX_REPORT_REASON_LENGTH = 1000;

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+|\[([^\]]+)\]\((?:https?:\/\/|\/)[^\)]+\)/gi;

export interface SanitizedReportReason {
  ok: true;
  cleanText: string;
}

export interface ReportReasonError {
  ok: false;
  message: string;
}

/**
 * Strips hyperlinks and normalizes report text.
 * Rejects control characters and length violations.
 */
export function sanitizeReportReason(rawReason: unknown): SanitizedReportReason | ReportReasonError {
  if (typeof rawReason !== "string") {
    return { ok: false, message: "Report reason must be a text description." };
  }

  // Strip links and markdown hyperlinks to prevent phishing / spam
  const stripped = rawReason.replace(URL_PATTERN, (match, linkText) => (linkText ? String(linkText) : "")).trim();
  const normalized = stripped.replace(/\s+/g, " ");

  if (hasForbiddenCharacters(normalized)) {
    return { ok: false, message: "Report reason contains invalid characters." };
  }

  if (normalized.length < MIN_REPORT_REASON_LENGTH) {
    return { ok: false, message: `Report reason must be at least ${MIN_REPORT_REASON_LENGTH} characters.` };
  }

  if (normalized.length > MAX_REPORT_REASON_LENGTH) {
    return { ok: false, message: `Report reason cannot exceed ${MAX_REPORT_REASON_LENGTH} characters.` };
  }

  return { ok: true, cleanText: normalized };
}

/**
 * Masks reporter personal identifiers for reviewers, exposing only role and section.
 * Complies with NDPA student privacy invariants.
 */
export function maskReporterForReviewer(params: {
  reporterRole: "TEACHER" | "PUPIL";
  reporterSection?: string | null;
  branchName?: string | null;
  /// False names the role only (see `pupilCellsAtMinimum`). Default true.
  showSection?: boolean;
}): string {
  const roleLabel = params.reporterRole === "PUPIL" ? "Pupil" : "Teacher";
  if (params.showSection === false) return roleLabel;
  const sectionLabel = params.reporterSection?.trim() || params.branchName?.trim() || "General";
  return `${roleLabel} in ${sectionLabel}`;
}

/// How many reports one person may have, so that one account cannot bury the reviewers' queue: waiting for a reviewer at once, and made in one UTC day.
export const REPORT_LIMITS = {
  PUPIL: { open: 10, perDay: 20 },
  TEACHER: { open: 20, perDay: 50 },
} as const;

/// Which limit a person has reached, if any (the waiting limit is named first). `openCount` is their reports still waiting for a reviewer; `todayCount` all they made since midnight UTC.
export function reportLimitReached(role: "PUPIL" | "TEACHER", openCount: number, todayCount: number): "OPEN" | "DAY" | null {
  const limit = REPORT_LIMITS[role];
  if (openCount >= limit.open) return "OPEN";
  if (todayCount >= limit.perDay) return "DAY";
  return null;
}

/// Midnight UTC of the day `now` falls in (the day also resets at 00:00 UTC for the daily practice cap).
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/// One question and one place (here a campus): the group of pupils a reviewer could narrow a pupil's report down to.
export function reportCell(itemId: string, section: string): string {
  return `${itemId}|${section}`; // an item id is letters and digits, so the first bar always ends it
}

/**
 * The questions and places (as `reportCell`s) that at least `minimum` DIFFERENT pupils have reported, so that naming the place no longer points at one child. The same threshold as an
 * anonymous questionnaire (`bank.smallSummary.min`, never below 3). One pupil reporting twice counts once; reports whose pupil has since been removed (no id) count as one person
 * together, so the number is never overstated.
 */
export function pupilCellsAtMinimum(
  reports: Array<{ itemId: string; reporterSection: string; reporterStudentId: string | null }>,
  minimum: number,
): Set<string> {
  const pupils = new Map<string, Set<string>>();
  for (const r of reports) {
    const cell = reportCell(r.itemId, r.reporterSection);
    const who = pupils.get(cell) ?? new Set<string>();
    who.add(r.reporterStudentId ?? "?");
    pupils.set(cell, who);
  }
  return new Set([...pupils].filter(([, who]) => who.size >= minimum).map(([cell]) => cell));
}

export interface RegradeTarget {
  quizId: string;
  quizTitle: string;
  questionId: string;
  attemptsCount: number;
}

export interface RegradeImpactSummary {
  affectedQuizzesCount: number;
  totalAttemptsCount: number;
  offerMessage: string;
  targets: RegradeTarget[];
}

/**
 * Computes the impact of question fixes on assessments where the question was copied.
 */
export function computeRegradeImpact(
  copiedQuestions: Array<{
    quizId: string;
    quizTitle: string;
    questionId: string;
    attemptsCount: number;
  }>,
): RegradeImpactSummary {
  const uniqueQuizzes = new Set(copiedQuestions.map((q) => q.quizId));
  const totalAttempts = copiedQuestions.reduce((sum, q) => sum + q.attemptsCount, 0);

  const offerMessage =
    totalAttempts > 0
      ? `Question was used in ${uniqueQuizzes.size} assessment(s) with ${totalAttempts} student attempt(s). You can apply this correction and re-grade attempts.`
      : uniqueQuizzes.size > 0
        ? `Question was used in ${uniqueQuizzes.size} assessment(s) with 0 attempts.`
        : "Question has not been copied into any assessments.";

  return {
    affectedQuizzesCount: uniqueQuizzes.size,
    totalAttemptsCount: totalAttempts,
    offerMessage,
    targets: copiedQuestions.map((q) => ({
      quizId: q.quizId,
      quizTitle: q.quizTitle,
      questionId: q.questionId,
      attemptsCount: q.attemptsCount,
    })),
  };
}

/**
 * Validates report outcome resolution arguments.
 */
export function validateReportOutcome(
  outcome: unknown,
  outcomeReason: unknown,
):
  | {
      ok: true;
      outcome: QuestionReportOutcome;
      outcomeReason: string;
      targetStatus: QuestionReportStatus;
    }
  | {
      ok: false;
      message: string;
    } {
  const validOutcomes = [QuestionReportOutcome.FIXED, QuestionReportOutcome.NOT_AN_ERROR, QuestionReportOutcome.NEEDS_DISCUSSION];

  if (!outcome || !validOutcomes.includes(outcome as QuestionReportOutcome)) {
    return { ok: false, message: "Invalid report outcome. Must be FIXED, NOT_AN_ERROR, or NEEDS_DISCUSSION." };
  }

  if (typeof outcomeReason !== "string" || outcomeReason.trim().length < 3) {
    return { ok: false, message: "Outcome explanation must be at least 3 characters." };
  }

  const typedOutcome = outcome as QuestionReportOutcome;
  const targetStatus = typedOutcome === QuestionReportOutcome.NOT_AN_ERROR ? QuestionReportStatus.DISMISSED : QuestionReportStatus.RESOLVED;

  return {
    ok: true,
    outcome: typedOutcome,
    outcomeReason: outcomeReason.trim(),
    targetStatus,
  };
}
