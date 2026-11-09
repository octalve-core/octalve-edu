// Programs, slice P3b: the pure rules of assessments (task 0027; AlEemaan's task 0043, section 8.11). No database, no clock.

export const MAX_ASSESSMENTS = 200;
export const MAX_TITLE = 120;
export const MAX_KIND = 40;
export const MAX_COMMENT = 500;
export const MAX_SCORE_ENTRIES = 500;
export const MAX_SCORE = 1000;
export const MAX_BANDS = 10;
export const MAX_BAND_NAME = 30;

export const ASSESSMENT_STATUSES = ["DRAFT", "OPEN", "MARKED", "PUBLISHED", "ARCHIVED"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
export const SCORE_CODES = ["ABSENT", "EXCUSED", "EXEMPT", "NOT_SITTING"] as const;
export type ScoreCode = (typeof SCORE_CODES)[number];

export const CODE_TEXT: Record<ScoreCode, string> = { ABSENT: "Absent", EXCUSED: "Excused", EXEMPT: "Exempt", NOT_SITTING: "Not sitting" };

export type AssessmentAction = "open" | "mark" | "reopen" | "publish" | "archive";

/// The status an action leads to, or null when the action does not apply to the status. DRAFT -> OPEN (scores can be entered) -> MARKED (every expected score is in) -> PUBLISHED (the
/// people can see their own result); a MARKED sheet can be sent back to OPEN; anything can be archived, and nothing comes back from ARCHIVED.
export function statusAfter(status: AssessmentStatus, action: AssessmentAction): AssessmentStatus | null {
  if (action === "open") return status === "DRAFT" ? "OPEN" : null;
  if (action === "mark") return status === "OPEN" ? "MARKED" : null;
  if (action === "reopen") return status === "MARKED" ? "OPEN" : null;
  if (action === "publish") return status === "MARKED" ? "PUBLISHED" : null;
  return status === "ARCHIVED" ? null : "ARCHIVED";
}

/// "Test", "Recitation": trimmed, single spaces.
export const cleanText = (value: string | null | undefined): string => (value ?? "").trim().replace(/\s+/g, " ");

export const roundTo2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/// Why this number is not a score for an assessment out of `max`, or null: it must be 0 to the maximum with at most two decimals.
export function scoreProblem(value: number, max: number): string | null {
  if (!Number.isFinite(value)) return "That is not a number.";
  if (value < 0) return "A score can't be below 0.";
  if (value > max) return `A score can't be above the maximum of ${max}.`;
  if (roundTo2(value) !== value) return "A score has at most two decimal places.";
  return null;
}

/// One decimal, half up: 27 of 40 is 67.5.
export const percentOf = (score: number, max: number): number => Math.round((score / max) * 1000 + 1e-9) / 10;

export type Band = { name: string; from: number };

/// Why these grade bands are not usable, or null: 1 to 10, unique names, `from` a percentage 0 to 100 and unique, and one band starting at 0 so everyone has a grade.
export function bandsProblem(bands: readonly Band[]): string | null {
  if (bands.length === 0) return null;
  if (bands.length > MAX_BANDS) return `At most ${MAX_BANDS} grades.`;
  const names = new Set(bands.map((b) => b.name.toLowerCase()));
  if (names.size !== bands.length) return "Each grade needs a different name.";
  const froms = new Set(bands.map((b) => b.from));
  if (froms.size !== bands.length) return "Two grades can't start at the same percentage.";
  if (bands.some((b) => !(b.from >= 0 && b.from <= 100))) return "A grade starts at a percentage from 0 to 100.";
  if (!froms.has(0)) return "One grade must start at 0, so everyone has a grade.";
  return null;
}

/// The bands stored on a program (JSON), keeping only well-formed ones.
export function parseBands(json: unknown): Band[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((b) =>
    b && typeof b === "object" && typeof (b as Band).name === "string" && typeof (b as Band).from === "number"
      ? [{ name: (b as Band).name, from: (b as Band).from }]
      : [],
  );
}

/// The grade for a percentage: the band with the highest `from` that is not above it; null without bands.
export function gradeFor(bands: readonly Band[] | null | undefined, percent: number): string | null {
  if (!bands || bands.length === 0) return null;
  const hit = [...bands].filter((b) => b.from <= percent).sort((a, b) => b.from - a.from)[0];
  return hit?.name ?? null;
}

/// Passed (true), failed (false), or null when the assessment has no pass mark or the entry is not a number.
export const passedAt = (score: number | null, passMark: number | null): boolean | null =>
  score === null || passMark === null ? null : score >= passMark;

export type Entry = { score: number | null; code: ScoreCode | null };

/// How an entry counts toward an average: a number counts as its percentage; ABSENT counts as 0 (a sitting that was missed); EXCUSED, EXEMPT and NOT_SITTING are left out.
export function percentCounted(entry: Entry, max: number): number | null {
  if (entry.score !== null) return percentOf(entry.score, max);
  return entry.code === "ABSENT" ? 0 : null;
}

/// The weighted average of the percentages that count; null when none do (no average is better than 0).
export function weightedAverage(items: readonly { percent: number | null; weight: number }[]): number | null {
  const used = items.filter((i): i is { percent: number; weight: number } => i.percent !== null && i.weight > 0);
  const total = used.reduce((sum, i) => sum + i.weight, 0);
  if (total === 0) return null;
  return Math.round((used.reduce((sum, i) => sum + i.percent * i.weight, 0) / total) * 10 + 1e-9) / 10;
}

/// The completion rule of slice P5, applied to a person's results: an average at least X and/or every required assessment passed. `results` are the person's PUBLISHED assessments.
export type CompletionRule = { minAverage: number | null; requirePassed: boolean };
export type PersonResult = { required: boolean; passed: boolean | null; percent: number | null; weight: number; counted: boolean };

export function meetsRule(rule: CompletionRule, results: readonly PersonResult[]): { ok: boolean; why: string[] } {
  const why: string[] = [];
  if (rule.minAverage !== null) {
    const average = weightedAverage(results.filter((r) => r.counted).map((r) => ({ percent: r.percent, weight: r.weight })));
    if (average === null) why.push("No result counts toward the average yet.");
    else if (average < rule.minAverage) why.push(`The average is ${average}%, under ${rule.minAverage}%.`);
  }
  if (rule.requirePassed) {
    const missed = results.filter((r) => r.required && r.passed !== true).length;
    if (missed > 0) why.push(`${missed} required ${missed === 1 ? "assessment is" : "assessments are"} not passed.`);
  }
  return { ok: why.length === 0, why };
}
