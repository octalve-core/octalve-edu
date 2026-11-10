// What the promotion screens read from the promotion API (task 0031), and the words they use. Types only plus pure helpers: no server import, so it is safe in the browser.

export type Decision = "PROMOTED" | "REPEATED" | "GRADUATED" | "WITHDRAWN";

export const DECISION_LABEL: Record<Decision, string> = {
  PROMOTED: "Promote",
  REPEATED: "Repeat",
  GRADUATED: "Graduate",
  WITHDRAWN: "Withdraw",
};
export const DECISION_PAST: Record<Decision, string> = {
  PROMOTED: "Promoted",
  REPEATED: "Repeated",
  GRADUATED: "Graduated",
  WITHDRAWN: "Withdrawn",
};

export type SessionOption = { id: string; label: string; startDate: string; status: string; campusId: string | null; scope: string };
export type ClassOption = { id: string; name: string; sortOrder: number; campusId: string | null; scope: string };

export type PreviewRow = {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  currentArmId: string;
  currentArmName: string;
  termAverages: Record<string, number | null>;
  overallAverage: number | null;
  recommendedDecision: Decision;
  recommendationReason: string;
  targetClassArmId: string | null;
  targetClassArmName: string | null;
  /// The class the pupil would go to (task 0035) and whether the roll will not guess it.
  targetClassGroupId: string | null;
  targetClassGroupName: string | null;
  needsPlacement: boolean;
  alreadyEnrolledInTarget: boolean;
};

export type RungClass = { id: string; name: string; streamName: string | null; arms: { id: string; name: string }[] };

export type Preview = {
  sourceClassGroup: { id: string; name: string };
  targetClassGroup: { id: string; name: string } | null;
  isTerminalClass: boolean;
  passMark: number;
  academicPeriods: { id: string; ordinal: number; label: string; isCurrent: boolean }[];
  eligibility: { eligible: boolean; finalPeriodOrdinal: number; reason?: string };
  targetArms: { id: string; name: string }[];
  /// The live classes of the next rung: one, or several when the school has streams.
  rungClasses: RungClass[];
  placementNeeded: boolean;
  students: PreviewRow[];
  summary: { totalEvaluated: number; totalPromoted: number; totalRepeated: number; totalGraduated: number; totalSkipped: number };
};

/// What the administrator chose for one pupil; `decision` "" = as advised, `classId` "" = the class the roll suggests (a placement, task 0035).
export type Choice = { decision: Decision | ""; armId: string; reason: string; classId: string };
export const NO_CHOICE: Choice = { decision: "", armId: "", reason: "", classId: "" };

export type BatchView = {
  id: string;
  createdAt: string;
  passMark: number;
  notes: string | null;
  sourceSession: { id: string; label: string };
  targetSession: { id: string; label: string };
  sourceClassGroup: { id: string; name: string };
  targetClassGroup: { id: string; name: string } | null;
  executedBy: { id: string; name: string | null; email: string | null };
  totals: { evaluated: number; promoted: number; repeated: number; graduated: number; withdrawn: number; skipped: number };
};

export type BatchRecord = {
  id: string;
  student: { id: string; admissionNo: string; firstName: string; lastName: string };
  overallAverage: number | null;
  termAverages: Record<string, number | null>;
  decision: Decision;
  decisionMode: "AUTOMATIC" | "OVERRIDDEN";
  overrideReason: string | null;
  recommendedDecision: Decision;
};

export const percent = (n: number | null) => (n === null ? "-" : `${n.toFixed(1)}%`);

/// The decision that will be taken for a pupil: the administrator's choice, else what the rule advised.
export const finalDecision = (row: PreviewRow, choice: Choice): Decision =>
  choice.decision === "" ? row.recommendedDecision : choice.decision;

/// An override is any choice that differs from the advice, or an arm picked by hand; it needs a reason.
export const isOverride = (row: PreviewRow, choice: Choice) =>
  (choice.decision !== "" && choice.decision !== row.recommendedDecision) || choice.armId !== "";

/// The scope a table sits in: a labelled region a keyboard can scroll (axe: scrollable-region-focusable).
// `relative` matters: visually hidden labels and captions (`sr-only`) are absolutely positioned, and an overflow container only clips them if it is their containing block. Without it a label in the last
// column of a wide table widens the whole PAGE, and a phone zooms out to fit it.
export const REGION =
  "relative overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/// The label of a class in a choice: its name, and its stream when it has one and the name does not already say so.
export const classLabel = (c: RungClass) =>
  c.streamName && !c.name.toLowerCase().includes(c.streamName.toLowerCase()) ? `${c.name} (${c.streamName})` : c.name;

/// The class a pupil who is to be promoted will go to: the one chosen, else the one the roll suggests. null when the roll will not guess (a placement is needed) or there is none.
export const placedClassId = (row: PreviewRow, choice: Choice, preview: Preview): string | null =>
  choice.classId !== "" ? choice.classId : preview.placementNeeded ? null : (preview.targetClassGroup?.id ?? null);

/// Pupils who are to be promoted, have no place yet, and have no class to go to: the roll is held until each has one.
export const missingPlacements = (preview: Preview, choices: Record<string, Choice>): number =>
  preview.students.filter(
    (row) =>
      !row.alreadyEnrolledInTarget &&
      finalDecision(row, choices[row.studentId] ?? NO_CHOICE) === "PROMOTED" &&
      placedClassId(row, choices[row.studentId] ?? NO_CHOICE, preview) === null,
  ).length;
