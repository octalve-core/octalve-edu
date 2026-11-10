import type { SheetRow } from "@/lib/programs/assessment-service";
import {
  CODE_TEXT,
  SCORE_CODES,
  roundTo2,
  scoreProblem,
  type AssessmentAction,
  type AssessmentStatus,
  type ScoreCode,
} from "@/lib/programs/assessment-rules";

// The words and the small decisions of the Assessments tab (task 0027, slice P3b). Pure, so each is unit-tested without a browser. Presentation only: the API decides who may enter what.

export const STATUS_TEXT: Record<AssessmentStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  MARKED: "Marked",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

/// The pill of each status: published is the good one, open and marked need action, a draft and an archived one are quiet.
export const STATUS_STYLE: Record<AssessmentStatus, string> = {
  DRAFT: "border-line-strong bg-surface-2 text-fg-2",
  OPEN: "border-warn-line bg-warn-bg text-warn-fg",
  MARKED: "border-warn-line bg-warn-bg text-warn-fg",
  PUBLISHED: "border-ok-line bg-ok-bg text-ok-fg",
  ARCHIVED: "border-line-strong bg-surface-2 text-fg-2",
};

export const ACTION_TEXT: Record<AssessmentAction, { button: string; done: string; ask: string | null }> = {
  open: { button: "Open for scores", done: "The assessment is open for scores.", ask: null },
  mark: { button: "Mark as complete", done: "The assessment is marked complete.", ask: null },
  reopen: { button: "Send back for changes", done: "The assessment is open again.", ask: null },
  publish: {
    button: "Publish results",
    done: "The results are published.",
    ask: "People can see their own result once it is published. Only a program admin can change a score after that, with a reason.",
  },
  archive: { button: "Archive", done: "The assessment is archived.", ask: "An archived assessment can only be read." },
};

export const CODE_OPTIONS: { value: "" | ScoreCode; label: string }[] = [
  { value: "", label: "A score" },
  ...SCORE_CODES.map((value) => ({ value, label: CODE_TEXT[value] })),
];

/// What the person has typed on the screen but not saved yet.
export type ScoreDraft = Record<string, { score: string; code: "" | ScoreCode; comment: string }>;
export type ScorePayload = { participantId: string; score?: number; code?: ScoreCode; comment: string | null; version?: number };

export const startingDraft = (row: SheetRow): { score: string; code: "" | ScoreCode; comment: string } => ({
  score: row.entry?.score != null ? String(row.entry.score) : "",
  code: row.entry?.code ?? "",
  comment: row.entry?.comment ?? "",
});

/// A typed score as a number, or why it is not one.
export function parseScore(text: string, max: number): { value: number } | { problem: string } {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { problem: "Enter a number with at most two decimals." };
  const value = Number(trimmed);
  const problem = scoreProblem(value, max);
  return problem ? { problem } : { value: roundTo2(value) };
}

/// Why this row's draft cannot be saved, or null (nothing typed yet is not a problem; it is simply not sent).
export function draftProblem(row: SheetRow, draft: ScoreDraft[string] | undefined, max: number): string | null {
  if (!draft || !row.canEdit || draft.code !== "" || draft.score.trim() === "") return null;
  const parsed = parseScore(draft.score, max);
  return "problem" in parsed ? parsed.problem : null;
}

/// What would be saved: every row the person may edit whose draft differs from what is stored and is valid, with the stored `version`. A row with nothing typed is not sent, and a score
/// is never cleared (scores are corrected, not deleted).
export function pendingScores(rows: readonly SheetRow[], drafts: ScoreDraft, max: number): ScorePayload[] {
  const out: ScorePayload[] = [];
  for (const row of rows) {
    const draft = drafts[row.participantId];
    if (!draft || !row.canEdit) continue;
    const comment = draft.comment.trim() || null;
    let value: { score?: number; code?: ScoreCode };
    if (draft.code !== "") value = { code: draft.code };
    else if (draft.score.trim() !== "") {
      const parsed = parseScore(draft.score, max);
      if ("problem" in parsed) continue;
      value = { score: parsed.value };
    } else continue;
    const was = row.entry;
    if (
      was &&
      (was.score ?? null) === (value.score ?? null) &&
      (was.code ?? null) === (value.code ?? null) &&
      (was.comment ?? null) === comment
    )
      continue;
    out.push({ participantId: row.participantId, ...value, comment, ...(was ? { version: was.version } : {}) });
  }
  return out;
}

/// A reason is asked only when the server says changes need one (a published sheet) and something is being saved.
export const reasonNeeded = (reasonOnChange: boolean, pending: readonly ScorePayload[]): boolean => reasonOnChange && pending.length > 0;

/// How many people who can be scored have no stored score and nothing valid typed yet.
export const missingCount = (rows: readonly SheetRow[], drafts: ScoreDraft, max: number): number =>
  rows.filter((row) => row.canEdit && !row.entry && pendingScores([row], drafts, max).length === 0).length;

export const resultText = (row: Pick<SheetRow, "entry" | "percent" | "grade" | "passed">): string => {
  if (!row.entry) return "No score";
  if (row.entry.code) return CODE_TEXT[row.entry.code];
  const bits = [
    `${row.entry.score}`,
    row.percent !== null ? `${row.percent}%` : null,
    row.grade,
    row.passed === null ? null : row.passed ? "Passed" : "Not passed",
  ];
  return bits.filter(Boolean).join(" · ");
};
