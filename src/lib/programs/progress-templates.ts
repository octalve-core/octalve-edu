// Progress records, slice R1 (task 0027 (progress records), section 8.1): the templates a program can use. They ship in code as presets; a program that starts using progress records gets an immutable copy
// of one in the database, so a later change to a preset never reaches a record already kept. There is no template designer. Pure: no database, no clock.

export type Bilingual = { en: string; ar: string };

/// date: not a column (the entry's own date is the day). text: a short line. note: a longer one. choice: one of `options`. surah: a surah number. range: from and to inside the surah list.
/// rating: a whole number on the template's scale. grade: the same scale, labelled as an overall grade.
export const COLUMN_TYPES = ["text", "note", "choice", "surah", "range", "rating"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export type Option = { value: string; en: string; ar: string };
export type Column = { key: string; type: ColumnType; label: Bilingual; required?: boolean; options?: readonly Option[]; max?: number };
/// summary: how this track counts in the family summary. progress: days, amount and ratings. latest: only the newest entry's grade and note. none: never in a summary (a teacher's private notes).
export type Track = {
  key: string;
  kind: "table" | "notes";
  label: Bilingual;
  oneRowPerDay: boolean;
  summary: "progress" | "latest" | "none";
  columns: readonly Column[];
};
export type ProfileField = { key: string; type: "text" | "choice"; label: Bilingual; options?: readonly Option[]; max?: number };
export type RatingLevel = { value: number; en: string; ar: string };
export type TemplateSchema = {
  schemaVersion: 1;
  name: Bilingual;
  /// 0 = Sunday ... 6 = Saturday. The week grid starts on `weekStart` and shows `weekDays`.
  weekStart: number;
  weekDays: readonly number[];
  ratings: readonly RatingLevel[];
  profile: readonly ProfileField[];
  tracks: readonly Track[];
};

export const PRESET_KEYS = ["QURAN_BOOKLET", "SIMPLE_LOG"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];
export const isPresetKey = (value: unknown): value is PresetKey =>
  typeof value === "string" && (PRESET_KEYS as readonly string[]).includes(value);

const RATINGS: readonly RatingLevel[] = [
  { value: 5, en: "Excellent", ar: "ممتاز" },
  { value: 4, en: "Very good", ar: "جيد جداً" },
  { value: 3, en: "Good", ar: "جيد" },
  { value: 2, en: "Acceptable", ar: "مقبول" },
  { value: 1, en: "Weak", ar: "ضعيف" },
];

const rangeTrack = (key: string, en: string, ar: string): Track => ({
  key,
  kind: "table",
  label: { en, ar },
  oneRowPerDay: true,
  summary: "progress",
  columns: [
    { key: "range", type: "range", label: { en: "Surah and ayah", ar: "السورة والآيات" }, required: true },
    { key: "notes", type: "note", label: { en: "Notes", ar: "ملاحظات" }, max: 500 },
    { key: "rating", type: "rating", label: { en: "Rating", ar: "التقدير" } },
  ],
});

export const QURAN_BOOKLET: TemplateSchema = {
  schemaVersion: 1,
  name: { en: "Quran memorisation booklet", ar: "دفتر متابعة الحفظ" },
  weekStart: 6,
  weekDays: [6, 0, 1, 2, 3],
  ratings: RATINGS,
  profile: [
    { key: "age", type: "text", label: { en: "Age", ar: "العمر" }, max: 20 },
    { key: "neighbourhood", type: "text", label: { en: "Neighbourhood", ar: "الحي" }, max: 60 },
    {
      key: "riwayah",
      type: "choice",
      label: { en: "Riwayah", ar: "الرواية" },
      options: [
        { value: "HAFS", en: "Hafs 'an 'Asim", ar: "حفص عن عاصم" },
        { value: "WARSH", en: "Warsh 'an Nafi'", ar: "ورش عن نافع" },
        { value: "QALUN", en: "Qalun 'an Nafi'", ar: "قالون عن نافع" },
      ],
    },
    { key: "circle", type: "text", label: { en: "Circle", ar: "الحلقة" }, max: 60 },
    { key: "school", type: "text", label: { en: "School", ar: "المدرسة" }, max: 60 },
  ],
  tracks: [
    rangeTrack("new", "New text", "الحفظ الجديد"),
    rangeTrack("revision", "Daily revision", "المراجعة اليومية"),
    {
      key: "followup",
      kind: "table",
      label: { en: "Follow-up", ar: "المتابعة" },
      oneRowPerDay: false,
      summary: "latest",
      columns: [
        { key: "surah", type: "surah", label: { en: "Surah", ar: "السورة" } },
        { key: "notes", type: "note", label: { en: "Notes", ar: "ملاحظات" }, max: 500 },
        { key: "grade", type: "rating", label: { en: "Overall grade", ar: "التقدير العام" } },
      ],
    },
    {
      key: "mistakes",
      kind: "notes",
      label: { en: "Recurring mistakes", ar: "الأخطاء المتكررة" },
      oneRowPerDay: false,
      summary: "none",
      columns: [{ key: "note", type: "note", label: { en: "Mistake", ar: "الخطأ" }, required: true, max: 500 }],
    },
  ],
};

export const SIMPLE_LOG: TemplateSchema = {
  schemaVersion: 1,
  name: { en: "Simple daily log", ar: "سجل يومي بسيط" },
  weekStart: 1,
  weekDays: [1, 2, 3, 4, 5],
  ratings: RATINGS,
  profile: [],
  tracks: [
    {
      key: "log",
      kind: "table",
      label: { en: "Daily log", ar: "السجل اليومي" },
      oneRowPerDay: false,
      summary: "progress",
      columns: [
        { key: "topic", type: "text", label: { en: "Topic", ar: "الموضوع" }, required: true, max: 80 },
        { key: "notes", type: "note", label: { en: "Notes", ar: "ملاحظات" }, max: 500 },
        { key: "rating", type: "rating", label: { en: "Rating", ar: "التقدير" } },
      ],
    },
  ],
};

export const PRESETS: Record<PresetKey, TemplateSchema> = { QURAN_BOOKLET, SIMPLE_LOG };
export const presetSchema = (key: PresetKey): TemplateSchema => PRESETS[key];

/// A stored schema read back: tolerant (a hand-edited row never throws), returning null when it is not a template.
export function readSchema(raw: unknown): TemplateSchema | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Partial<TemplateSchema>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.tracks) || !Array.isArray(value.ratings)) return null;
  return value as TemplateSchema;
}

export const trackOf = (schema: TemplateSchema, key: string): Track | undefined => schema.tracks.find((track) => track.key === key);
