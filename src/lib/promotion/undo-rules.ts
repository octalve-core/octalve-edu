import { EnrollmentStatus, PromotionDecision } from "@prisma/client";

// The pure rules of undoing a roll (task 0040): where each pupil of a roll was put, and what stops them being put back.

/// The status a roll gave a pupil's place in the source session. An undo puts the pupil back only if their place still has this status: anything else was changed by hand since.
export const SOURCE_STATUS_AFTER: Record<PromotionDecision, EnrollmentStatus> = {
  PROMOTED: EnrollmentStatus.PROMOTED,
  REPEATED: EnrollmentStatus.REPEATED,
  GRADUATED: EnrollmentStatus.ALUMNI,
  WITHDRAWN: EnrollmentStatus.WITHDRAWN,
};

/// Does this decision make a new place in the target session? (The database says the same: a promotion record has a target enrolment exactly for these two.)
export const hasNewPlace = (decision: PromotionDecision): boolean =>
  decision === PromotionDecision.PROMOTED || decision === PromotionDecision.REPEATED;

const STATUS_WORD: Record<EnrollmentStatus, string> = {
  ACTIVE: "active",
  PROMOTED: "promoted",
  REPEATED: "repeating",
  WITHDRAWN: "withdrawn",
  TRANSFERRED: "transferred",
  ALUMNI: "an alumnus (graduated)",
  EXPELLED: "expelled",
  CANCELLED: "cancelled",
};
export const statusWord = (status: EnrollmentStatus): string => STATUS_WORD[status];

/// What a pupil has in the target session that an undo must not orphan: marks, a remark on a card, an invoice, attendance.
export type Activity = { results: boolean; remarks: boolean; invoice: boolean; attendance: boolean };

export type UndoCheck = {
  decision: PromotionDecision;
  /// The status of the pupil's place in the source session now, null when that place cannot be found.
  sourceStatus: EnrollmentStatus | null;
  /// The status of the new place in the target session now, null when it cannot be found (only asked for when the decision made one).
  targetStatus: EnrollmentStatus | null;
  activity: Activity;
  sourceSession: string;
  targetSession: string;
};

/// Why one pupil stops the roll being undone, each a sentence for the administrator; empty when the pupil can be put back.
export function undoProblems(check: UndoCheck): string[] {
  const problems: string[] = [];
  const expected = SOURCE_STATUS_AFTER[check.decision];
  if (check.sourceStatus === null) problems.push(`Their place in ${check.sourceSession} could not be found.`);
  else if (check.sourceStatus !== expected)
    problems.push(`Their place in ${check.sourceSession} has changed since the roll (it is now ${statusWord(check.sourceStatus)}).`);
  if (hasNewPlace(check.decision)) {
    if (check.targetStatus === null) problems.push(`Their new place in ${check.targetSession} could not be found.`);
    else if (check.targetStatus !== EnrollmentStatus.ACTIVE)
      problems.push(
        `Their new place in ${check.targetSession} has been moved on since the roll (it is now ${statusWord(check.targetStatus)}).`,
      );
    const used: string[] = [];
    if (check.activity.results) used.push("marks");
    if (check.activity.remarks) used.push("report remarks");
    if (check.activity.invoice) used.push("an invoice");
    if (check.activity.attendance) used.push("attendance");
    if (used.length > 0) problems.push(`They already have ${used.join(", ").replace(/, ([^,]*)$/, " and $1")} in ${check.targetSession}.`);
  }
  return problems;
}
