import type { Prisma } from "@prisma/client";
import { dayOf } from "@/lib/standing/rules";
import type { PlaceState } from "./people-rules";

// Programs, slice P3: the pure rules of attendance (task 0027, section 7; AlEemaan's task 0043, section 10). No database, no clock (the caller passes `today`), so every rule is unit-tested without a server.

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
export type AttendanceState = (typeof ATTENDANCE_STATUSES)[number];

export const MAX_ROLL_MARKS = 500;
/// Teachers and recorders may mark today and the 6 days before it (7 days in all); a program admin and a super admin any past day.
export const BACKDATE_DAYS = 7;
export const MAX_SESSION_LABEL = 40;
export const MAX_REMARKS = 200;
export const DEFAULT_LOW_PERCENT = 75;
export const MAX_SESSIONS_RANGE_DAYS = 366;

const DAY = 864e5;
const asTime = (day: string): number => new Date(`${day}T00:00:00Z`).getTime();

/// "2026-11-10" minus `days`.
export const daysBefore = (day: string, days: number): string => dayOf(new Date(asTime(day) - days * DAY));

/// Why a day cannot be marked by this person, or null. A day that has not come is never markable; a teacher or a recorder can reach back `BACKDATE_DAYS` days, an administrator any day.
export function dayProblem(day: string, today: string, canBackdate: boolean): string | null {
  const parsed = new Date(`${day}T00:00:00Z`);
  // An impossible date is an Invalid Date (month 13) or rolls over into the next month (the 30th of February): neither reads back as what was typed.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(parsed.getTime()) || dayOf(parsed) !== day) return "That is not a real date.";
  if (day > today) return "Attendance can't be taken for a day that hasn't come.";
  if (!canBackdate && day < daysBefore(today, BACKDATE_DAYS - 1))
    return `You can take attendance for today and the ${BACKDATE_DAYS - 1} days before it.`;
  return null;
}

/// A session label is trimmed and kept as typed, at most 40 characters; an empty one is a label like any other.
export const cleanLabel = (label: string | null | undefined): string => (label ?? "").trim().replace(/\s+/g, " ");

export type RollPlace = { status: "ACTIVE" | "WITHDRAWN" | "COMPLETED"; joinedOn: Date; endedOn: Date | null };
export type RollEntry = { listed: boolean; markable: boolean; flag: "SUSPENDED" | null };

/// Whether a person is on the roll of `day`, and whether they can be marked (design 10.3).
///   - They must have joined on or before the day and not have ended before it.
///   - A PAST day is the record of what happened then: the person is listed and markable whatever their standing is today, so today's standing never rewrites an earlier roll
///     (the same rule as the school's roll, task 0045).
///   - TODAY needs an open place: a person taking part is listed and markable, a SUSPENDED one is listed with a flag and cannot be marked, and anyone else (expelled, terminated,
///     ended by the school, left) is not on the roll.
export function rollEntry(place: RollPlace, state: PlaceState, day: string, today: string): RollEntry {
  if (dayOf(place.joinedOn) > day) return { listed: false, markable: false, flag: null };
  if (place.endedOn && dayOf(place.endedOn) < day) return { listed: false, markable: false, flag: null };
  if (day < today) return { listed: true, markable: true, flag: null };
  if (place.status !== "ACTIVE") return { listed: false, markable: false, flag: null };
  if (state === "ACTIVE") return { listed: true, markable: true, flag: null };
  if (state === "SUSPENDED") return { listed: true, markable: false, flag: "SUSPENDED" };
  return { listed: false, markable: false, flag: null };
}

export type Counts = { present: number; late: number; absent: number; excused: number };
export const emptyCounts = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0 });

/// `times` marks of one kind added to the counts (a grouped query hands over a count, not rows).
export function addMarks(counts: Counts, status: AttendanceState, times: number): Counts {
  const next = { ...counts };
  if (status === "PRESENT") next.present += times;
  else if (status === "LATE") next.late += times;
  else if (status === "ABSENT") next.absent += times;
  else next.excused += times;
  return next;
}

export const addMark = (counts: Counts, status: AttendanceState): Counts => addMarks(counts, status, 1);

/// Present and late over the sessions held, with excused sessions left out of both sides; null when nothing was held (no percentage is better than 0%). Whole percent, rounded half up.
export function attendancePercent(counts: Counts): number | null {
  const held = counts.present + counts.late + counts.absent;
  return held === 0 ? null : Math.floor(((counts.present + counts.late) * 100) / held + 0.5);
}

/// A person is flagged when their percentage is under the program's threshold; no percentage, no flag.
export const isLow = (percent: number | null, threshold: number): boolean => percent !== null && percent < threshold;

/// What one person can reach in one program, decided from live data at every request.
///   markAll: a super admin or a program admin (any group; any past day).
///   supervisor: reads every group and corrects existing marks, with a reason.
///   groups: the groups a teacher or a recorder is assigned to AND everything inside them (these are the groups they may mark, within the window).
///   campusIds: a campus administrator reads the people of their own campus and marks none (unless they are also named a teacher or a recorder).
export type Access = { markAll: boolean; supervisor: boolean; groups: ReadonlySet<string>; campusIds: readonly string[] | null };

export const readsEverything = (access: Access): boolean => access.markAll || access.supervisor;

/// May this person look at this group's roll and numbers at all?
export const mayReadGroup = (access: Access, groupId: string): boolean =>
  readsEverything(access) || access.groups.has(groupId) || access.campusIds !== null;

/// The people this person may see, as a condition to AND with the others (never spread next to a filter on the same key: it would replace it). Nothing reachable matches nothing.
export function reachOfAccess(access: Access): Prisma.ProgramParticipantWhereInput {
  if (readsEverything(access)) return {};
  const any: Prisma.ProgramParticipantWhereInput[] = [];
  if (access.groups.size > 0) any.push({ groupId: { in: [...access.groups] } });
  if (access.campusIds) any.push({ campusId: { in: [...access.campusIds] } });
  return { OR: any.length > 0 ? any : [{ id: { in: [] } }] };
}

export type Rights = { create: boolean; change: boolean; reasonOnChange: boolean };
export const NO_RIGHTS: Rights = { create: false, change: false, reasonOnChange: false };

/// What the person may do on one group's roll for one day (the program being open for attendance is checked by the caller).
///   create: write a mark where there is none. An administrator any past day; a teacher or a recorder for their groups, today and the 6 days before.
///   change: alter an existing mark. Whoever can create; and a supervisor, any day.
///   reasonOnChange: altering an existing mark needs a reason when the person is not marking within their own window (a supervisor's correction, or an older day).
export function rightsFor(access: Access, groupId: string, day: string, todayDay: string): Rights {
  if (day > todayDay) return NO_RIGHTS;
  const inWindow = day >= daysBefore(todayDay, BACKDATE_DAYS - 1);
  const create = access.markAll || (access.groups.has(groupId) && inWindow);
  const change = create || access.supervisor;
  return { create, change, reasonOnChange: change && (!create || !inWindow) };
}
