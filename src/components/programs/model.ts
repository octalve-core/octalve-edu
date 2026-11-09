import type { ProgramDetail, ProgramSummary } from "@/lib/programs/service";

// What the Programs screens share: the shapes the API answers with (types only: nothing of the server is imported at run time), the words for a status and a kind, and the dates.

export type { ProgramDetail, ProgramSummary };
export type CampusOption = { id: string; name: string };

export const STATUS_LABEL: Record<ProgramSummary["status"], string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};
export const STATUS_TONE: Record<ProgramSummary["status"], "ok" | "warn" | "neutral" | "info"> = {
  DRAFT: "info",
  ACTIVE: "ok",
  COMPLETED: "neutral",
  ARCHIVED: "warn",
};
export const KIND_LABEL: Record<ProgramSummary["kind"], string> = { ONGOING: "Never ends", FIXED_TERM: "For a period" };

export const dayText = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const whenText = (start: string | null, end: string | null) =>
  start && end ? `${dayText(start)} to ${dayText(end)}` : start ? `From ${dayText(start)}, with no end` : "No dates";

export const ACTION_TEXT: Record<string, string> = {
  PROGRAM_CREATED: "Program made",
  PROGRAM_CHANGED: "Details changed",
  PROGRAM_ACTIVATED: "Activated",
  PROGRAM_ARCHIVED: "Archived",
  PROGRAM_RESTORED: "Restored",
  LEVELS_CHANGED: "Level names changed",
  GROUP_ADDED: "Group added",
  GROUP_RENAMED: "Group renamed",
  GROUP_MOVED: "Group moved",
  GROUP_ARCHIVED: "Group archived",
  GROUP_RESTORED: "Group restored",
  CAMPUS_LINKED: "Campus added",
  CAMPUS_UNLINKED: "Campus removed",
  ADMIN_NAMED: "Program admin named",
  ADMIN_ENDED: "Program admin ended",
};

export const when = (iso: string): string => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
