import type { ProgressGuardianDetail, ProgressWriters } from "@prisma/client";
import { parseIsoDate, toIsoDate } from "./rules";
import { SURAH_COUNT, surahAyat } from "./progress-reference";
import type { Column, TemplateSchema, Track } from "./progress-templates";

// Progress records (task 0027 (progress records), slices R1 to R3): the pure rules - no database, no clock. What a value may be, ranges in the surah list, days and weeks, the moves between statuses,
// who may write and verify, the lock, and the summary a guardian sees by default.

export const MAX_TEXT = 80;
export const MAX_NOTE = 500;
export const MAX_COMMENT = 300;
export const MAX_WEEK_ROWS = 30;
export const MAX_LOADED_ENTRIES = 1000;
export const MAX_RANGE_DAYS = 400;
export const DEFAULT_RANGE_DAYS = 28;
export const PAGE_SIZE = 50;
export const MAX_PROFILE_VALUE = 80;

export const ENTRY_STATUSES = ["DRAFT", "SUBMITTED", "VERIFIED"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Values

export type RangeValue = { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number };
export type Value = string | number | RangeValue;
export type Values = Record<string, Value>;
export type Problem = { path: string; message: string };

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
/// Text with no control characters, except that a note may hold line breaks and tabs.
const BAD_TEXT = /[\u0000-\u001f\u007f-\u009f]/;
const BAD_NOTE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const tidy = (raw: string, multiline: boolean): string => {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  return multiline ? text : text.replace(/\s+/g, " ");
};

const compare = (aSurah: number, aAyah: number, bSurah: number, bAyah: number): number => (aSurah - bSurah) * 1000 + (aAyah - bAyah);

/// Why a range cannot be right, or null: whole numbers, a real surah, ayah 1 to the surah's count, the end not before the start.
export function rangeProblem(range: unknown): string | null {
  if (!range || typeof range !== "object" || Array.isArray(range)) return "Give the surah and ayah where it starts and where it ends.";
  const value = range as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "fromAyah,fromSurah,toAyah,toSurah") return "Give the surah and ayah where it starts and where it ends.";
  const { fromSurah, fromAyah, toSurah, toAyah } = value as Record<keyof RangeValue, unknown>;
  if (![fromSurah, fromAyah, toSurah, toAyah].every(isInt)) return "A surah and an ayah are whole numbers.";
  const [fs, fa, ts, ta] = [fromSurah, fromAyah, toSurah, toAyah] as number[];
  if (fs! < 1 || fs! > SURAH_COUNT || ts! < 1 || ts! > SURAH_COUNT) return `A surah is a number from 1 to ${SURAH_COUNT}.`;
  if (fa! < 1 || fa! > surahAyat(fs!)) return `Surah ${fs} has ayat 1 to ${surahAyat(fs!)}.`;
  if (ta! < 1 || ta! > surahAyat(ts!)) return `Surah ${ts} has ayat 1 to ${surahAyat(ts!)}.`;
  if (compare(ts!, ta!, fs!, fa!) < 0) return "The end can't be before the start.";
  return null;
}

/// How many ayat a range covers (the start and the end both counted).
export function rangeAyat(range: RangeValue): number {
  if (range.fromSurah === range.toSurah) return range.toAyah - range.fromAyah + 1;
  let total = surahAyat(range.fromSurah) - range.fromAyah + 1 + range.toAyah;
  for (let surah = range.fromSurah + 1; surah < range.toSurah; surah += 1) total += surahAyat(surah);
  return total;
}

/// Where the next range starts: the ayah after the last one done (the next surah's first when a surah was finished); null after the last ayah of the last surah.
export function nextFrom(last: RangeValue): { surah: number; ayah: number } | null {
  if (last.toAyah < surahAyat(last.toSurah)) return { surah: last.toSurah, ayah: last.toAyah + 1 };
  return last.toSurah < SURAH_COUNT ? { surah: last.toSurah + 1, ayah: 1 } : null;
}

function columnValue(column: Column, raw: unknown, ratings: TemplateSchema["ratings"]): { value: Value } | { message: string } | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const label = column.label.en;
  switch (column.type) {
    case "text":
    case "note": {
      if (typeof raw !== "string") return { message: `${label} must be text.` };
      const multiline = column.type === "note";
      const max = column.max ?? (multiline ? MAX_NOTE : MAX_TEXT);
      const text = tidy(raw, multiline);
      if (text.length === 0) return null;
      if (text.length > max) return { message: `${label} can be at most ${max} characters.` };
      if ((multiline ? BAD_NOTE : BAD_TEXT).test(text)) return { message: `${label} has a character that is not allowed.` };
      return { value: text };
    }
    case "choice":
      return typeof raw === "string" && column.options?.some((option) => option.value === raw)
        ? { value: raw }
        : { message: `${label} is not one of the choices.` };
    case "surah":
      return isInt(raw) && raw >= 1 && raw <= SURAH_COUNT
        ? { value: raw }
        : { message: `${label} is a surah number from 1 to ${SURAH_COUNT}.` };
    case "rating":
      return isInt(raw) && ratings.some((level) => level.value === raw)
        ? { value: raw }
        : { message: `${label} must be one of the levels.` };
    case "range": {
      const problem = rangeProblem(raw);
      if (problem) return { message: problem };
      const r = raw as RangeValue;
      return { value: { fromSurah: r.fromSurah, fromAyah: r.fromAyah, toSurah: r.toSurah, toAyah: r.toAyah } };
    }
  }
}

/// A row's values checked against its track's columns. Nothing the client sends is trusted: unknown keys are refused, text is tidied, a range is checked against the surah list,
/// and a row with nothing in it is refused. The values come back in the order of the columns.
export function parseValues(
  track: Track,
  schema: TemplateSchema,
  raw: unknown,
): { ok: true; values: Values } | { ok: false; problems: Problem[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, problems: [{ path: "values", message: "Give the values of the row." }] };
  const input = raw as Record<string, unknown>;
  const problems: Problem[] = [];
  const known = new Set(track.columns.map((column) => column.key));
  for (const key of Object.keys(input))
    if (!known.has(key)) problems.push({ path: `values.${key}`, message: `${key} is not part of ${track.label.en}.` });
  const values: Values = {};
  for (const column of track.columns) {
    const result = columnValue(column, input[column.key], schema.ratings);
    if (result === null) {
      if (column.required) problems.push({ path: `values.${column.key}`, message: `${column.label.en} is required.` });
    } else if ("message" in result) problems.push({ path: `values.${column.key}`, message: result.message });
    else values[column.key] = result.value;
  }
  if (problems.length === 0 && Object.keys(values).length === 0) problems.push({ path: "values", message: "Fill in at least one thing." });
  return problems.length > 0 ? { ok: false, problems } : { ok: true, values };
}

/// The profile fields checked the same way; an empty field is removed.
export function parseProfile(
  schema: TemplateSchema,
  raw: unknown,
): { ok: true; profile: Record<string, string> } | { ok: false; problems: Problem[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, problems: [{ path: "values", message: "Give the profile." }] };
  const input = raw as Record<string, unknown>;
  const problems: Problem[] = [];
  const known = new Map(schema.profile.map((field) => [field.key, field]));
  for (const key of Object.keys(input))
    if (!known.has(key)) problems.push({ path: `values.${key}`, message: `${key} is not part of the profile.` });
  const profile: Record<string, string> = {};
  for (const field of schema.profile) {
    const value = input[field.key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") {
      problems.push({ path: `values.${field.key}`, message: `${field.label.en} must be text.` });
      continue;
    }
    const text = tidy(value, false);
    if (text.length === 0) continue;
    if (field.type === "choice") {
      if (!field.options?.some((option) => option.value === text))
        problems.push({ path: `values.${field.key}`, message: `${field.label.en} is not one of the choices.` });
      else profile[field.key] = text;
    } else if (text.length > (field.max ?? MAX_PROFILE_VALUE) || BAD_TEXT.test(text)) {
      problems.push({
        path: `values.${field.key}`,
        message: `${field.label.en} can be at most ${field.max ?? MAX_PROFILE_VALUE} characters, with no special characters.`,
      });
    } else profile[field.key] = text;
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, profile };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Days and weeks (UTC calendar days, like the rest of programs)

export const addDays = (day: string, count: number): string => {
  const date = parseIsoDate(day);
  if (!date) return day;
  date.setUTCDate(date.getUTCDate() + count);
  return toIsoDate(date);
};
export const dayDiff = (a: string, b: string): number =>
  Math.round(((parseIsoDate(a)?.getTime() ?? 0) - (parseIsoDate(b)?.getTime() ?? 0)) / 864e5);
export const weekdayOf = (day: string): number => parseIsoDate(day)?.getUTCDay() ?? 0;
/// The first day of the week that holds `day`, for a week that starts on `startDay` (0 = Sunday ... 6 = Saturday).
export const weekStartOf = (day: string, startDay: number): string => addDays(day, -((weekdayOf(day) - startDay + 7) % 7));
/// The days of the week grid: the week's days in the order of `weekDays`, starting from the week's first day.
export function weekDates(weekStart: string, schema: Pick<TemplateSchema, "weekStart" | "weekDays">): string[] {
  const start = weekStartOf(weekStart, schema.weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((day) => schema.weekDays.includes(weekdayOf(day)));
}

/// Why an entry cannot be dated `day`, or null: a real day, not in the future, not before the person's place began.
export function entryDayProblem(day: string, today: string, joinedOn: string | null): string | null {
  if (parseIsoDate(day) === null) return "That isn't a real date.";
  if (day > today) return "An entry can't be dated in the future.";
  if (joinedOn && day < joinedOn) return "That is before this person's place began.";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Statuses

/// What a save makes of an entry. With verification off, a saved entry is published at once. With it on, a new entry is a draft, a draft or a submitted one stays as it is
/// (unless the writer says it is done), and a verified one goes back to submitted - families keep seeing its last verified copy.
export function statusAfterSave(previous: EntryStatus | null, rule: { requireVerification: boolean; submit: boolean }): EntryStatus {
  if (!rule.requireVerification) return "VERIFIED";
  if (previous === "VERIFIED") return "SUBMITTED";
  if (rule.submit) return "SUBMITTED";
  return previous ?? "DRAFT";
}

/// May this person verify this entry? An administrator or a supervisor; not the person who last edited it while four-eyes is on.
export function mayVerify(
  who: { admin: boolean; supervisor: boolean; userId: string },
  entry: { lastEditedByUserId: string },
  fourEyes: boolean,
): boolean {
  if (!who.admin && !who.supervisor) return false;
  return !(fourEyes && entry.lastEditedByUserId === who.userId);
}

/// Which staff roles write entries, by the program's setting.
export const writerRoles = (writers: ProgressWriters): ("TEACHER" | "RECORDER")[] =>
  writers === "TEACHERS" ? ["TEACHER"] : writers === "ASSIGNED" ? ["RECORDER"] : ["TEACHER", "RECORDER"];

/// May this person write to this person's record? The place must be taking part (a suspended, expelled, withdrawn, ended or completed place cannot be written to).
export const canWrite = (access: { writeAll: boolean; writeGroups: ReadonlySet<string> }, groupId: string, state: string): boolean =>
  state === "ACTIVE" && (access.writeAll || access.writeGroups.has(groupId));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Locks

export type LockRow = { holderUserId: string; heartbeatAt: Date; expiresAt: Date; releaseAt: Date | null };
/// A lock holds while it has not expired and has not been released ("Viewing" sets a release time a few seconds ahead).
export const lockActive = (lock: LockRow | null, now: Date): lock is LockRow =>
  lock !== null && lock.expiresAt.getTime() > now.getTime() && (lock.releaseAt === null || lock.releaseAt.getTime() > now.getTime());
export const lockExpiry = (now: Date, inactivitySeconds: number): Date => new Date(now.getTime() + inactivitySeconds * 1000);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The summary a guardian sees by default (task 0027 (progress records), 4.3): from published (verified) values only; no day-by-day notes and no list of recurring mistakes.

export type SummaryRowIn = { trackKey: string; entryDate: string; values: Record<string, unknown> };
export type TrackSummary = {
  trackKey: string;
  label: { en: string; ar: string };
  days: number;
  ayat: number | null;
  from: { surah: number; ayah: number } | null;
  to: { surah: number; ayah: number } | null;
  ratings: Record<string, number>;
  average: number | null;
};
export type LatestSummary = {
  trackKey: string;
  label: { en: string; ar: string };
  date: string;
  grade: number | null;
  note: string | null;
};
export type Summary = { from: string; to: string; daysRecorded: number; tracks: TrackSummary[]; latest: LatestSummary[] };

const isRange = (value: unknown): value is RangeValue => rangeProblem(value) === null;

export function summarise(rows: readonly SummaryRowIn[], schema: TemplateSchema, from: string, to: string): Summary {
  const inRange = rows.filter((row) => row.entryDate >= from && row.entryDate <= to).sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const tracks: TrackSummary[] = [];
  const latest: LatestSummary[] = [];
  const days = new Set<string>();
  for (const track of schema.tracks) {
    if (track.summary === "none") continue;
    const mine = inRange.filter((row) => row.trackKey === track.key);
    const ratingKey = track.columns.find((column) => column.type === "rating")?.key;
    const noteKey = track.columns.find((column) => column.type === "note")?.key;
    if (track.summary === "latest") {
      const newest = [...rows]
        .filter((row) => row.trackKey === track.key && row.entryDate <= to)
        .sort((a, b) => b.entryDate.localeCompare(a.entryDate))[0];
      if (newest) {
        const grade = ratingKey ? newest.values[ratingKey] : null;
        const note = noteKey ? newest.values[noteKey] : null;
        latest.push({
          trackKey: track.key,
          label: track.label,
          date: newest.entryDate,
          grade: isInt(grade) ? grade : null,
          note: typeof note === "string" ? note : null,
        });
      }
      continue;
    }
    for (const row of mine) days.add(row.entryDate);
    const rangeKey = track.columns.find((column) => column.type === "range")?.key;
    const ranges = rangeKey ? mine.map((row) => row.values[rangeKey]).filter(isRange) : [];
    const ratings: Record<string, number> = {};
    let sum = 0;
    let counted = 0;
    if (ratingKey)
      for (const row of mine) {
        const rating = row.values[ratingKey];
        if (isInt(rating)) {
          ratings[String(rating)] = (ratings[String(rating)] ?? 0) + 1;
          sum += rating;
          counted += 1;
        }
      }
    const first = ranges[0];
    const last = ranges[ranges.length - 1];
    tracks.push({
      trackKey: track.key,
      label: track.label,
      days: new Set(mine.map((row) => row.entryDate)).size,
      ayat: rangeKey ? ranges.reduce((total, range) => total + rangeAyat(range), 0) : null,
      from: first ? { surah: first.fromSurah, ayah: first.fromAyah } : null,
      to: last ? { surah: last.toSurah, ayah: last.toAyah } : null,
      ratings,
      average: counted > 0 ? Math.round((sum / counted) * 10) / 10 : null,
    });
  }
  return { from, to, daysRecorded: days.size, tracks, latest };
}

/// The weeks (newest first) and the month so far, as the family screen shows them.
export function periodSummaries(
  rows: readonly SummaryRowIn[],
  schema: TemplateSchema,
  today: string,
  weeks = 8,
): { weeks: Summary[]; month: Summary } {
  const start = weekStartOf(today, schema.weekStart);
  const list = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(start, -7 * i);
    return summarise(rows, schema, weekStart, addDays(weekStart, 6));
  });
  const monthStart = `${today.slice(0, 8)}01`;
  return { weeks: list, month: summarise(rows, schema, monthStart, today) };
}

export const GUARDIAN_DETAILS: readonly ProgressGuardianDetail[] = ["SUMMARY", "FULL"];
/// A guardian never sees more than the program allows; a pupil always sees their own verified entries in full when their view is on.
export const familyDetail = (actor: "PUPIL" | "GUARDIAN", guardianDetail: ProgressGuardianDetail): ProgressGuardianDetail =>
  actor === "PUPIL" ? "FULL" : guardianDetail;

/// Two stored values are the same when they hold the same things, whatever order the database returned the keys in.
export function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
