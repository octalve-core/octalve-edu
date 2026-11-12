import { SURAHS, surahOf } from "@/lib/programs/progress-reference";
import type { Column, TemplateSchema, Track } from "@/lib/programs/progress-templates";
import { bi, type Bi } from "@/lib/programs/progress-display";
import { sameJson, type EntryStatus, type RangeValue, type Value, type Values } from "@/lib/programs/progress-rules";

// Progress records: what the screens need that is not React - wording, how a value is shown, how a form's text becomes the values the API wants, and the other way round. Pure.

export const STATUS_TEXT: Record<EntryStatus, string> = { DRAFT: "Draft", SUBMITTED: "Handed in", VERIFIED: "Verified" };
export const STATUS_STYLE: Record<EntryStatus, string> = {
  DRAFT: "border-line-strong bg-surface-2 text-fg-2",
  SUBMITTED: "border-warn-line bg-warn-bg text-warn-fg",
  VERIFIED: "border-ok-line bg-ok-bg text-ok-fg",
};

export const PLACE_TEXT: Record<string, string> = {
  ACTIVE: "Taking part",
  SUSPENDED: "Suspended",
  EXPELLED: "Expelled",
  TERMINATED: "Terminated",
  ENDED_BY_SCHOOL: "Ended by the school",
  WITHDRAWN: "Withdrawn",
  COMPLETED: "Completed",
};

export const surahName = (n: number): string => {
  const surah = surahOf(n);
  return surah ? `${surah.n}. ${surah.en}` : String(n);
};

/// "Al-Baqarah 1 to 20", or "Al-Baqarah 286 to Ali 'Imran 20" across surahs.
export function rangeText(range: RangeValue): string {
  const from = surahOf(range.fromSurah)?.en ?? String(range.fromSurah);
  const to = surahOf(range.toSurah)?.en ?? String(range.toSurah);
  return range.fromSurah === range.toSurah
    ? `${from} ${range.fromAyah} to ${range.toAyah}`
    : `${from} ${range.fromAyah} to ${to} ${range.toAyah}`;
}

export const SURAH_OPTIONS = [
  { value: "", label: "Choose a surah" },
  ...SURAHS.map((s) => ({ value: String(s.n), label: `${s.n}. ${s.en} (${s.ar})` })),
];

export const ratingText = (schema: Pick<TemplateSchema, "ratings">, value: unknown): string =>
  schema.ratings.find((level) => level.value === value)?.en ?? String(value);

/// How one stored value reads on the screen.
export function valueText(column: Column, value: Value | undefined, schema: Pick<TemplateSchema, "ratings">): string {
  if (value === undefined) return "";
  switch (column.type) {
    case "range":
      return typeof value === "object" ? rangeText(value) : "";
    case "surah":
      return typeof value === "number" ? surahName(value) : "";
    case "rating":
      return ratingText(schema, value);
    case "choice":
      return column.options?.find((option) => option.value === value)?.en ?? String(value);
    default:
      return String(value);
  }
}

/// The row as a list of "Label: value" parts, in the order of the columns, leaving out what is empty.
export const rowParts = (track: Track, values: Values, schema: Pick<TemplateSchema, "ratings">): { label: string; text: string }[] =>
  track.columns.flatMap((column) => {
    const text = valueText(column, values[column.key], schema);
    return text === "" ? [] : [{ label: column.label.en, text }];
  });

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A form's text and the values the API wants

export type Draft = Record<string, string>;
const RANGE_KEYS = ["fromSurah", "fromAyah", "toSurah", "toAyah"] as const;

export function blankDraft(track: Track, next?: { surah: number; ayah: number } | null): Draft {
  const draft: Draft = {};
  for (const column of track.columns) {
    if (column.type === "range") {
      for (const key of RANGE_KEYS) draft[`${column.key}.${key}`] = "";
      if (next) {
        draft[`${column.key}.fromSurah`] = String(next.surah);
        draft[`${column.key}.fromAyah`] = String(next.ayah);
        draft[`${column.key}.toSurah`] = String(next.surah);
      }
    } else draft[column.key] = "";
  }
  return draft;
}

export function draftOf(track: Track, values: Values): Draft {
  const draft = blankDraft(track);
  for (const column of track.columns) {
    const value = values[column.key];
    if (value === undefined) continue;
    if (column.type === "range" && typeof value === "object")
      for (const key of RANGE_KEYS) draft[`${column.key}.${key}`] = String(value[key]);
    else draft[column.key] = String(value);
  }
  return draft;
}

const whole = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null);

/// The values to send: empty fields are left out; numbers become numbers. The server checks every one again, so this only has to be faithful, not strict.
export function valuesOf(track: Track, draft: Draft): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const column of track.columns) {
    if (column.type === "range") {
      const parts = RANGE_KEYS.map((key) => whole(draft[`${column.key}.${key}`] ?? ""));
      if (parts.every((p) => p === null)) continue;
      values[column.key] = Object.fromEntries(RANGE_KEYS.map((key, i) => [key, parts[i] ?? 0]));
    } else {
      const text = (draft[column.key] ?? "").trim();
      if (text === "") continue;
      values[column.key] = column.type === "rating" || column.type === "surah" ? (whole(text) ?? text) : text;
    }
  }
  return values;
}

export const sameValues = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => sameJson(a, b);

export const ratingOptions = (schema: Pick<TemplateSchema, "ratings">) => [
  { value: "", label: "Not rated" },
  ...schema.ratings.map((level) => ({ value: String(level.value), label: level.en })),
];

/// A friendly label for the pause on a lock, for the dialog.
export const lockText = (holder: string, releasing: boolean): string =>
  releasing
    ? `${holder} is finishing up. You can edit in a moment.`
    : `${holder} is editing this entry. You can read it, and change it once they have finished.`;

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The same values in both languages (slice R4). The English is exactly what the functions above give; the Arabic is null for words somebody typed.

export const surahBi = (n: number): Bi => {
  const surah = surahOf(n);
  return surah ? bi(`${surah.n}. ${surah.en}`, `${surah.n}. ${surah.ar}`) : bi(String(n), String(n));
};

export function rangeBiOf(range: RangeValue): Bi {
  const from = surahOf(range.fromSurah);
  const to = surahOf(range.toSurah);
  const fromEn = from?.en ?? String(range.fromSurah);
  const toEn = to?.en ?? String(range.toSurah);
  const fromAr = from?.ar ?? String(range.fromSurah);
  const toAr = to?.ar ?? String(range.toSurah);
  return range.fromSurah === range.toSurah
    ? bi(`${fromEn} ${range.fromAyah} to ${range.toAyah}`, `${fromAr} ${range.fromAyah} إلى ${range.toAyah}`)
    : bi(`${fromEn} ${range.fromAyah} to ${toEn} ${range.toAyah}`, `${fromAr} ${range.fromAyah} إلى ${toAr} ${range.toAyah}`);
}

export const ratingBi = (schema: Pick<TemplateSchema, "ratings">, value: unknown): Bi => {
  const level = schema.ratings.find((l) => l.value === value);
  return level ? bi(level.en, level.ar) : bi(String(value));
};

export function valueBi(column: Column, value: Value | undefined, schema: Pick<TemplateSchema, "ratings">): Bi | null {
  if (value === undefined) return null;
  switch (column.type) {
    case "range":
      return typeof value === "object" ? rangeBiOf(value) : null;
    case "surah":
      return typeof value === "number" ? surahBi(value) : null;
    case "rating":
      return ratingBi(schema, value);
    case "choice": {
      const option = column.options?.find((o) => o.value === value);
      return option ? bi(option.en, option.ar) : bi(String(value));
    }
    default:
      return bi(String(value));
  }
}

/// The row as "Label: value" pairs in both languages, leaving out what is empty.
export const rowPartsBi = (track: Track, values: Values, schema: Pick<TemplateSchema, "ratings">): { key: string; label: Bi; text: Bi }[] =>
  track.columns.flatMap((column) => {
    const text = valueBi(column, values[column.key], schema);
    return text === null || text.en === "" ? [] : [{ key: column.key, label: bi(column.label.en, column.label.ar), text }];
  });

export const trackLabelBi = (track: Pick<Track, "label">): Bi => bi(track.label.en, track.label.ar);
