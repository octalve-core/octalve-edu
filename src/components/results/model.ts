// What the Results screens read from the results API (task 0031). Types and pure helpers only: no server import, so every file here is safe in the browser.

export type ResultStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PUBLISHED" | "LOCKED";
export const STATUS_LABEL: Record<ResultStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  LOCKED: "Locked",
};
export const statusTone = (s: ResultStatus): "ok" | "warn" | "neutral" | "info" =>
  s === "PUBLISHED" || s === "LOCKED" ? "ok" : s === "APPROVED" ? "info" : s === "SUBMITTED" ? "warn" : "neutral";

export type PeriodOption = { id: string; label: string; ordinal: number; isCurrent: boolean; sessionId: string; sessionLabel: string };
export type ArmOption = { id: string; name: string; classGroupName: string };
export type PairOption = {
  classArmId: string;
  armName: string;
  classGroupId: string;
  classGroupName: string;
  subjectId: string;
  subjectName: string;
};
export type Options = { periods: PeriodOption[]; pairs: PairOption[]; arms: ArmOption[] };

export type Sheet = {
  period: { id: string; label: string; sessionId: string; sessionLabel: string };
  arm: { id: string; name: string; classGroupName: string };
  subject: { id: string; name: string };
  scheme: { id: string | null; name: string | null; totalMax: number; components: { name: string; maxScore: number }[] };
  rows: SheetRow[];
};
export type SheetRow = {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  standing: string;
  result: {
    id: string;
    status: ResultStatus;
    score: number;
    maxScore: number;
    components: { name: string; score: number; maxScore: number }[] | null;
    gradeLetter: string | null;
    gradeRemark: string | null;
  } | null;
};

export type ReviewItem = {
  id: string;
  score: string | number;
  maxScore: string | number;
  status: ResultStatus;
  gradeLetter: string | null;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
  subject: { id: string; name: string; code: string | null };
};

export type RosterRow = { studentId: string; admissionNo: string; firstName: string; lastName: string; published: number; total: number };

export type ReportCardData = {
  student: { id: string; admissionNo: string; firstName: string; lastName: string; classGroup?: string; classArm?: string };
  period: { id: string; label: string; sessionLabel: string };
  summary: {
    totalScore: number;
    totalMax: number;
    percentage: number;
    classRank: number | null;
    classSize: number;
    promotionOutcome: "PROMOTED" | "REPEATED";
  };
  subjects: {
    subjectId: string;
    subjectName: string;
    subjectCode: string | null;
    score: number;
    maxScore: number;
    gradeLetter: string | null;
    gradeRemark: string | null;
    status: ResultStatus;
    verificationToken: string | null;
  }[];
};

/// A labelled region a keyboard can scroll (axe: scrollable-region-focusable).
// `relative` matters: visually hidden labels and captions (`sr-only`) are absolutely positioned, and an overflow container only clips them if it is their containing block. Without it a label in the last
// column of a wide table widens the whole PAGE, and a phone zooms out to fit it.
export const REGION =
  "relative overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const FIELD =
  "min-h-11 w-full rounded-xl border border-line bg-field px-3 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

/// Two decimals at most, as the server reads a mark: "" is "not entered".
export const markProblem = (text: string, max: number): string | null => {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "Use a number with at most two decimals.";
  return Number(t) > max ? `At most ${max}.` : null;
};
