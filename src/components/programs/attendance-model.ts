import type { Roll, RollRow } from "@/lib/programs/attendance-service";
import { dayText } from "@/components/programs/model";

// The words and the small decisions of the Attendance tab (task 0027, slice P3). Pure, so each is unit-tested without a browser. Presentation only: the API decides who may mark what.

export type StatusKey = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
export const STATUSES: readonly StatusKey[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];
export const STATUS_TEXT: Record<StatusKey, string> = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", EXCUSED: "Excused" };

/// The colours of a chosen status button (a chosen one is filled; the others are plain). Every pair keeps 4.5:1 in both themes (the tokens are the ones the other badges use).
export const STATUS_STYLE: Record<StatusKey, string> = {
  PRESENT: "border-ok-line bg-ok-bg text-ok-fg",
  LATE: "border-warn-line bg-warn-bg text-warn-fg",
  ABSENT: "border-danger-line bg-danger-bg text-danger-fg",
  EXCUSED: "border-line-strong bg-surface-2 text-fg-2",
};

/// What the person has chosen on the screen but not saved yet.
export type Draft = Record<string, { status: StatusKey; remarks: string }>;
export type Payload = { participantId: string; status: StatusKey; remarks: string | null; version?: number };

const remarksOf = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);

/// The status shown for a row: the draft if there is one, otherwise the stored mark, otherwise none.
export const statusOf = (row: RollRow, drafts: Draft): StatusKey | null => drafts[row.participantId]?.status ?? row.mark?.status ?? null;
export const remarksShown = (row: RollRow, drafts: Draft): string => drafts[row.participantId]?.remarks ?? row.mark?.remarks ?? "";

/// What would be saved: every row the person may edit whose draft differs from what is stored, with the stored version (so a stale save is refused). A row with no draft is not sent.
export function pendingMarks(rows: readonly RollRow[], drafts: Draft): Payload[] {
  const out: Payload[] = [];
  for (const row of rows) {
    const draft = drafts[row.participantId];
    if (!draft || !row.canEdit) continue;
    const remarks = remarksOf(draft.remarks);
    if (row.mark && row.mark.status === draft.status && remarksOf(row.mark.remarks) === remarks) continue;
    out.push({ participantId: row.participantId, status: draft.status, remarks, ...(row.mark ? { version: row.mark.version } : {}) });
  }
  return out;
}

/// Whether the save changes a mark that already exists (the only case that can need a reason).
export const changesExisting = (rows: readonly RollRow[], pending: readonly Payload[]): boolean =>
  pending.some((mark) => rows.find((row) => row.participantId === mark.participantId)?.mark != null);

export const reasonNeeded = (roll: Pick<Roll, "rights">, rows: readonly RollRow[], pending: readonly Payload[]): boolean =>
  roll.rights.reasonOnChange && changesExisting(rows, pending);

/// "Mark everyone present": every row the person may write that has no mark and no choice yet becomes present (one tap for the usual day); nothing already chosen is touched.
export function allPresent(rows: readonly RollRow[], drafts: Draft): Draft {
  const next = { ...drafts };
  for (const row of rows)
    if (row.canEdit && !row.mark && !next[row.participantId]) next[row.participantId] = { status: "PRESENT", remarks: "" };
  return next;
}

/// How many rows still have no status (a roll is complete when this is 0).
export const unmarkedCount = (rows: readonly RollRow[], drafts: Draft): number =>
  rows.filter((row) => row.canEdit && statusOf(row, drafts) === null).length;

export function offText(
  attendance: { on: boolean; offBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null; campusesOff: { id: string; name: string }[] },
  subject = "Attendance is",
): string {
  if (attendance.offBy === "SCHOOL")
    return `${subject} switched off for the school. The school's administrator can turn it on in Settings.`;
  if (attendance.offBy === "PROGRAM")
    return `${subject} switched off for this program. A program admin can turn it on in the program's Settings.`;
  if (attendance.offBy === "CAMPUS") return `${subject} switched off in every campus this program runs in.`;
  return attendance.campusesOff.length > 0
    ? `On, except in ${attendance.campusesOff.map((campus) => campus.name).join(", ")}, where it is switched off.`
    : "On.";
}

/// Why a roll is read only, or what limits the person on it - one sentence, or null when nothing needs saying.
export function rollNote(roll: Pick<Roll, "attendance" | "programStatus" | "date" | "today" | "rights" | "earliest">): string | null {
  if (!roll.attendance.on) return offText(roll.attendance);
  if (roll.programStatus !== "ACTIVE") return "The program isn't active, so attendance can only be read.";
  if (roll.date > roll.today) return "That day hasn't come yet.";
  if (!roll.rights.change) {
    return roll.earliest && roll.date < roll.earliest
      ? `You can take attendance from ${dayText(roll.earliest)} onward. An older day has to be corrected by a program admin.`
      : "You can read this roll but not change it.";
  }
  if (!roll.rights.create) return "You can correct a mark that exists, and must say why. You can't add a new one.";
  if (roll.rights.reasonOnChange) return "This day is older than a teacher can reach: changing a mark needs a reason.";
  return null;
}

export const COUNT_ORDER = ["present", "late", "absent", "excused"] as const;

export const percentText = (percent: number | null): string => (percent === null ? "No marks" : `${percent}%`);

/// "2026-11-04" minus `days`, for the default ranges.
export function shiftDay(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 864e5).toISOString().slice(0, 10);
}
