// Programs (task 0027, slice P1; the port of AlEemaan's task 0043): the pure rules. No database, no clock, no request - every rule here is unit-tested without a server.

export const MAX_LEVELS = 4;
export const MAX_PROGRAM_NAME = 80;
export const MAX_DESCRIPTION = 500;
export const MAX_LEVEL_NAME = 40;
export const MAX_GROUP_NAME = 60;
/// A guard against a runaway client, not a design limit.
export const MAX_LIVE_GROUPS = 1000;
export const PATH_SEPARATOR = "–"; // an en dash: JSS-2-C, Juz A-Group 3

/// A name as it is stored: trimmed, inner runs of white space collapsed to one space. Control characters are refused by the schema, not silently removed.
export const cleanName = (value: string): string => value.trim().replace(/\s+/g, " ");

/// Two names are the same program/group/level name when they differ only in case or spacing.
export const sameName = (a: string, b: string): boolean => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

export const HAS_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/// "2026-11-03" -> a UTC Date, or null when it is not a real calendar date ("2026-02-30" is not).
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/// The same day `months` later, with the month end kept: 31 Aug + 6 months is 28 Feb (29 in a leap year), never 3 March.
export function addMonths(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export type Duration = { value: number; unit: "MONTHS" | "YEARS" };

export const durationInMonths = (duration: Duration): number => (duration.unit === "YEARS" ? duration.value * 12 : duration.value);

/// The LAST day of a fixed-term program: its start plus the duration, minus one day. Six months from 3 Nov 2026 ends on 2 May 2027.
export function endDateFor(startsOn: Date, duration: Duration): Date {
  const end = addMonths(startsOn, durationInMonths(duration));
  return new Date(end.getTime() - 24 * 60 * 60 * 1000);
}

export type GroupNode = { id: string; parentId: string | null; name: string };

/// The path of a group from the top, for example "JSS-2-C". A group whose chain is broken (or loops) is shown by what could be followed, never in a loop.
export function groupPath(groups: readonly GroupNode[], id: string): string {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(PATH_SEPARATOR);
}

export type TreeGroup<G extends GroupNode & { sortOrder: number }> = G & { children: TreeGroup<G>[] };

/// Groups as a forest: siblings by `sortOrder` then name. A group whose parent is not in the list is treated as a top-level one (it cannot happen through the service, and
/// the screen must not hide a row if it ever does).
export function buildTree<G extends GroupNode & { sortOrder: number }>(groups: readonly G[]): TreeGroup<G>[] {
  const nodes = new Map<string, TreeGroup<G>>(groups.map((group) => [group.id, { ...group, children: [] }]));
  const roots: TreeGroup<G>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const order = (a: TreeGroup<G>, b: TreeGroup<G>) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  const sortAll = (list: TreeGroup<G>[]) => {
    list.sort(order);
    for (const node of list) sortAll(node.children);
  };
  sortAll(roots);
  return roots;
}

export type ProgramStatusName = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type StatusAction = "activate" | "archive" | "restore";

/// The status a button leads to, or null when the button does not apply. `COMPLETED` is reached only by the complete action of slice P5.
export function statusAfter(action: StatusAction, status: ProgramStatusName): ProgramStatusName | null {
  if (action === "activate") return status === "DRAFT" ? "ACTIVE" : null;
  if (action === "archive") return status === "DRAFT" || status === "ACTIVE" ? "ARCHIVED" : null;
  return status === "ARCHIVED" ? "DRAFT" : null;
}

/// A program can be changed (structure, details) only while it is a draft or active.
export const isEditableStatus = (status: ProgramStatusName): boolean => status === "DRAFT" || status === "ACTIVE";

/// The one switch of slice P1: `programs.enabled`. The school's value is the ceiling and a campus can only narrow it, so a campus takes part only if both are on. A value that was never
/// stored is "on". (The mechanism is the shared one in lib/settings/ceiling-switch.ts, its pure parts in ceiling-rules.ts.)
export const PROGRAMS_ENABLED_KEY = "programs.enabled";

export { parseSwitch as parseEnabled, effectiveSwitch as effectiveEnabled } from "@/lib/settings/ceiling-rules";
