// The question bank's switches (design note section 6), stored as QuestionBankSetting rows: the school's value (no campus) and a campus's own. This file
// is the pure part: what a value may be, what a campus is allowed to change, and what the effective value is. It reads no database, so every rule is unit-tested.
//
// Rules:
//   - A campus may only NARROW. A school-wide "off" cannot be widened by a campus; a limit can only get stricter, and which way is "stricter" depends on the key (a
//     lower maximum set size is stricter, a higher minimum pool or a higher summary threshold is stricter). A campus's values that would widen are ignored.
//   - A stored value that is not valid (a hand-edited row, an old format) is ignored: the default, or the school's value, applies. Never trusted, never a crash.
//   - The effective numbers agree with each other: the default set size and every preset fit inside the maximum AND inside the daily cap.
//
// Defaults are the start values the maintainer gave in the design note. Four have none there and are placeholders to confirm (see the design note, section 16):
// bank.practice.dailyCap, bank.practice.minPoolSize, bank.print.nearExamDays and the lower bound of bank.smallSummary.min.

export const BANK_SETTING_KEYS = [
  "bank.access.pupils",
  "bank.access.staff",
  "bank.access.admins",
  "bank.practice.maxQuestions",
  "bank.practice.defaultQuestions",
  "bank.practice.presets",
  "bank.practice.dailyCap",
  "bank.practice.minPoolSize",
  "bank.reports.teachers",
  "bank.reports.pupils",
  "bank.images.max",
  "bank.images.maxBytes",
  "bank.images.maxLongSide",
  "bank.print.nearExamDays",
  "bank.smallSummary.min",
  "bank.parents.view",
] as const;

export type BankSettingKey = (typeof BANK_SETTING_KEYS)[number];

/// What a parent account sees of the bank (decision D4): nothing, a summary of its own child's practice, or the child's answers in full. Octalve gives a parent and a pupil
/// separate accounts, so the school chooses. Used from slice 4 (practice); the switch itself is stored and audited from the start.
export const PARENTS_VIEW_LEVELS = ["NONE", "SUMMARY", "FULL"] as const;
export type ParentsView = (typeof PARENTS_VIEW_LEVELS)[number];

export type BankSettingValues = {
  "bank.access.pupils": boolean;
  "bank.access.staff": boolean;
  "bank.access.admins": boolean;
  "bank.practice.maxQuestions": number;
  "bank.practice.defaultQuestions": number;
  "bank.practice.presets": number[];
  "bank.practice.dailyCap": number;
  "bank.practice.minPoolSize": number;
  "bank.reports.teachers": boolean;
  "bank.reports.pupils": boolean;
  "bank.images.max": number;
  "bank.images.maxBytes": number;
  "bank.images.maxLongSide": number;
  "bank.print.nearExamDays": number;
  "bank.smallSummary.min": number;
  "bank.parents.view": ParentsView;
};

export const BANK_DEFAULTS: Readonly<BankSettingValues> = Object.freeze({
  "bank.access.pupils": true,
  "bank.access.staff": true,
  "bank.access.admins": true,
  "bank.practice.maxQuestions": 100,
  "bank.practice.defaultQuestions": 20,
  "bank.practice.presets": Object.freeze([10, 20, 30, 50, 100]) as unknown as number[],
  "bank.practice.dailyCap": 100, // placeholder: one full set a day
  "bank.practice.minPoolSize": 20, // placeholder: at least one default-sized set
  "bank.reports.teachers": true,
  "bank.reports.pupils": true,
  "bank.images.max": 3,
  "bank.images.maxBytes": 500 * 1024,
  "bank.images.maxLongSide": 1600,
  "bank.print.nearExamDays": 7, // placeholder
  "bank.smallSummary.min": 5,
  "bank.parents.view": "NONE", // the safest start: a parent account reaches nothing of the bank until the school turns it on
});

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/// Which way "stricter" goes for a key. "and": off beats on. "lower": a smaller number is stricter. "higher": a larger number is stricter. "subset": fewer of the
/// school's choices. "level": a lower one of an ordered list of choices.
type Narrow = "and" | "lower" | "higher" | "subset" | "level";

const failure = (message: string): { ok: false; message: string } => ({ ok: false, message });

const flag =
  (label: string) =>
  (value: unknown): ParseResult<boolean> =>
    typeof value === "boolean" ? { ok: true, value } : failure(`${label} must be on or off.`);

const whole =
  (label: string, low: number, high: number) =>
  (value: unknown): ParseResult<number> =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= low && value <= high
      ? { ok: true, value }
      : failure(`${label} must be a whole number from ${low} to ${high}.`);

const PRESET_LIMIT = 500;
const parsePresets = (value: unknown): ParseResult<number[]> => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return failure("Presets must be a list of 1 to 10 set sizes.");
  for (let i = 0; i < value.length; i++) {
    const size: unknown = value[i];
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > PRESET_LIMIT)
      return failure(`Each preset must be a whole number from 1 to ${PRESET_LIMIT}.`);
    if (i > 0 && size <= (value[i - 1] as number)) return failure("Presets must be in ascending order with no repeats.");
  }
  return { ok: true, value: [...(value as number[])] };
};

const parseImagesMax = (value: unknown): ParseResult<number> =>
  value === 3 || value === 4 ? { ok: true, value } : failure("Images per question must be 3 or 4.");

const parseParentsView = (value: unknown): ParseResult<ParentsView> =>
  typeof value === "string" && (PARENTS_VIEW_LEVELS as readonly string[]).includes(value)
    ? { ok: true, value: value as ParentsView }
    : failure("What a parent can see must be none, a summary or everything.");

const DEFINITIONS: Record<BankSettingKey, { narrow: Narrow; parse: (value: unknown) => ParseResult<unknown> }> = {
  "bank.access.pupils": { narrow: "and", parse: flag("Pupil access") },
  "bank.access.staff": { narrow: "and", parse: flag("Staff access") },
  "bank.access.admins": { narrow: "and", parse: flag("Administrator access") },
  "bank.practice.maxQuestions": { narrow: "lower", parse: whole("The maximum set size", 1, 500) },
  "bank.practice.defaultQuestions": { narrow: "lower", parse: whole("The default set size", 1, 500) },
  "bank.practice.presets": { narrow: "subset", parse: parsePresets },
  "bank.practice.dailyCap": { narrow: "lower", parse: whole("The daily cap", 1, 1000) },
  "bank.practice.minPoolSize": { narrow: "higher", parse: whole("The minimum pool size", 1, 1000) },
  "bank.reports.teachers": { narrow: "and", parse: flag("Teacher reports") },
  "bank.reports.pupils": { narrow: "and", parse: flag("Pupil reports") },
  "bank.images.max": { narrow: "lower", parse: parseImagesMax },
  "bank.images.maxBytes": { narrow: "lower", parse: whole("The largest image size in bytes", 50 * 1024, 2 * 1024 * 1024) },
  "bank.images.maxLongSide": { narrow: "lower", parse: whole("The longest image side in pixels", 400, 4000) },
  "bank.print.nearExamDays": { narrow: "higher", parse: whole("The near-exam days", 0, 60) },
  "bank.smallSummary.min": { narrow: "higher", parse: whole("The small-summary threshold", 3, 50) },
  "bank.parents.view": { narrow: "level", parse: parseParentsView },
};

const isKey = (key: unknown): key is BankSettingKey => typeof key === "string" && Object.hasOwn(DEFINITIONS, key);

/// One stored or proposed value for one key. An unknown key (including a prototype name) is refused.
export function parseBankSetting<K extends BankSettingKey>(key: K, value: unknown): ParseResult<BankSettingValues[K]> {
  if (!isKey(key)) return failure("Unknown question bank setting.");
  return DEFINITIONS[key].parse(value) as ParseResult<BankSettingValues[K]>;
}

/// Whether `proposed` is at least as strict as `base` for this key (both already valid). This is what a campus may do; the API refuses anything else.
export function isNarrowing<K extends BankSettingKey>(key: K, base: BankSettingValues[K], proposed: BankSettingValues[K]): boolean {
  switch (DEFINITIONS[key].narrow) {
    case "and":
      return !(proposed === true && base === false);
    case "lower":
      return (proposed as number) <= (base as number);
    case "higher":
      return (proposed as number) >= (base as number);
    case "subset":
      return (proposed as number[]).every((size) => (base as number[]).includes(size));
    case "level":
      return PARENTS_VIEW_LEVELS.indexOf(proposed as ParentsView) <= PARENTS_VIEW_LEVELS.indexOf(base as ParentsView);
  }
}

type Rows = Readonly<Record<string, unknown>>;
const own = (rows: Rows, key: string): unknown => (Object.hasOwn(rows, key) ? rows[key] : undefined);

/// The effective settings for a campus: defaults, then the school-wide rows, then the campus's rows where they narrow. `global` and `campus` map a key to the raw
/// stored value (a SettingValue's `value`); pass `{}` for no rows.
export function effectiveBankSettings(global: Rows, campus: Rows): BankSettingValues {
  const merged: Record<string, unknown> = {};
  for (const key of BANK_SETTING_KEYS) {
    const school = parseBankSetting(key, own(global, key));
    const base: unknown = school.ok ? school.value : BANK_DEFAULTS[key];
    const mine = parseBankSetting(key, own(campus, key));
    let value: unknown = base;
    if (mine.ok) {
      const narrow = DEFINITIONS[key].narrow;
      if (narrow === "and") value = (base as boolean) && (mine.value as boolean);
      else if (narrow === "subset") {
        const kept = (mine.value as number[]).filter((size) => (base as number[]).includes(size));
        value = kept.length > 0 ? kept : base;
      } else if (isNarrowing(key, base as never, mine.value as never)) value = mine.value;
    }
    merged[key] = Array.isArray(value) ? [...(value as number[])] : value;
  }

  // The numbers must agree with each other. A set can be no bigger than the maximum or the daily cap, whichever is smaller.
  const values = merged as BankSettingValues;
  const limit = Math.min(values["bank.practice.maxQuestions"], values["bank.practice.dailyCap"]);
  values["bank.practice.defaultQuestions"] = Math.min(values["bank.practice.defaultQuestions"], limit);
  const presets = values["bank.practice.presets"].filter((size) => size <= limit);
  values["bank.practice.presets"] = presets.length > 0 ? presets : [values["bank.practice.defaultQuestions"]];
  return values;
}

/// What is wrong with a complete set of school-wide values, in words an administrator can act on. Missing keys use the defaults. Used before a change is written.
export function settingProblems(values: Partial<BankSettingValues>): string[] {
  const problems: string[] = [];
  const full: Record<string, unknown> = { ...BANK_DEFAULTS };
  for (const key of BANK_SETTING_KEYS) {
    if (!Object.hasOwn(values, key)) continue;
    const parsed = parseBankSetting(key, values[key]);
    if (parsed.ok) full[key] = parsed.value;
    else problems.push(parsed.message);
  }
  if (problems.length > 0) return problems;
  const v = full as BankSettingValues;
  const max = v["bank.practice.maxQuestions"];
  if (v["bank.practice.defaultQuestions"] > max)
    problems.push(`The default number of questions (${v["bank.practice.defaultQuestions"]}) cannot be above the maximum (${max}).`);
  const largest = Math.max(...v["bank.practice.presets"]);
  if (largest > max) problems.push(`Every preset must be within the maximum (${max}); the largest is ${largest}.`);
  if (v["bank.practice.dailyCap"] < max)
    problems.push(`The daily cap (${v["bank.practice.dailyCap"]}) cannot be below the maximum set size (${max}).`);
  return problems;
}

/// Every key's value, with the default for anything missing or invalid. No narrowing and no clamping: this is the school's (or a campus's) own choice as stored, what
/// `settingProblems` checks before a change is written.
export function completeBankSettings(source: Rows): BankSettingValues {
  const out: Record<string, unknown> = {};
  for (const key of BANK_SETTING_KEYS) {
    const parsed = parseBankSetting(key, own(source, key));
    out[key] = parsed.ok ? parsed.value : Array.isArray(BANK_DEFAULTS[key]) ? [...(BANK_DEFAULTS[key] as number[])] : BANK_DEFAULTS[key];
  }
  return out as BankSettingValues;
}

export type BankSettingMeta = {
  label: string;
  help: string;
  /// How the screen asks for it: an on/off switch, a whole number, a list of set sizes, or a choice between 3 and 4.
  kind: "flag" | "whole" | "presets" | "images" | "choice";
  /// For a "choice": the values in order, least first, with the words to show for each.
  choices?: ReadonlyArray<{ value: string; label: string }>;
  min?: number;
  max?: number;
  unit?: string;
  /// In words, which way a campus may move it ("a campus may only narrow").
  stricter: string;
};

const FLAG_STRICTER = "Off is stricter: a campus can switch it off, never on if the school has it off.";
const LOWER_STRICTER = "A lower number is stricter: a campus can lower it, never raise it.";
const HIGHER_STRICTER = "A higher number is stricter: a campus can raise it, never lower it.";

/// What the Question bank settings screen shows for each key. The bounds repeat the validators above; the unit spec checks the two agree.
export const BANK_SETTING_META: Readonly<Record<BankSettingKey, BankSettingMeta>> = {
  "bank.access.pupils": {
    label: "Pupils can use the question bank",
    help: "Turns practice off for pupils.",
    kind: "flag",
    stricter: FLAG_STRICTER,
  },
  "bank.access.staff": {
    label: "Teachers and other staff can use the question bank",
    help: "Turns the bank off for staff who are not administrators.",
    kind: "flag",
    stricter: FLAG_STRICTER,
  },
  "bank.access.admins": {
    label: "Administrators can use the question bank",
    help: "Turns the bank off for administrators.",
    kind: "flag",
    stricter: FLAG_STRICTER,
  },
  "bank.practice.maxQuestions": {
    label: "Largest practice set",
    help: "The most questions a pupil can ask for in one practice set.",
    kind: "whole",
    min: 1,
    max: 500,
    unit: "questions",
    stricter: LOWER_STRICTER,
  },
  "bank.practice.defaultQuestions": {
    label: "Default practice set size",
    help: "What a pupil gets if they do not choose a size. Cannot be above the largest set.",
    kind: "whole",
    min: 1,
    max: 500,
    unit: "questions",
    stricter: LOWER_STRICTER,
  },
  "bank.practice.presets": {
    label: "Practice set sizes offered",
    help: "The sizes a pupil can pick, smallest first. None can be above the largest set.",
    kind: "presets",
    min: 1,
    max: 500,
    stricter: "Fewer is stricter: a campus can keep some of the school's sizes, never add one.",
  },
  "bank.practice.dailyCap": {
    label: "Questions a pupil can practise in a day",
    help: "Stops one pupil from working through the whole bank. Cannot be below the largest set.",
    kind: "whole",
    min: 1,
    max: 1000,
    unit: "questions",
    stricter: LOWER_STRICTER,
  },
  "bank.practice.minPoolSize": {
    label: "Smallest pool before practice is offered",
    help: "For a subject and class with fewer approved practice questions than this, practice is simply not offered.",
    kind: "whole",
    min: 1,
    max: 1000,
    unit: "questions",
    stricter: HIGHER_STRICTER,
  },
  "bank.reports.teachers": {
    label: "Teachers can report a problem with a question",
    help: "Turns teacher reports on or off.",
    kind: "flag",
    stricter: FLAG_STRICTER,
  },
  "bank.reports.pupils": {
    label: "Pupils can report a problem with a question",
    help: "Turns pupil reports on or off.",
    kind: "flag",
    stricter: FLAG_STRICTER,
  },
  "bank.images.max": {
    label: "Images per question",
    help: "3 or 4. The database never allows more than 4.",
    kind: "images",
    min: 3,
    max: 4,
    stricter: LOWER_STRICTER,
  },
  "bank.images.maxBytes": {
    label: "Largest image file",
    help: "In bytes (512000 is 500 KB).",
    kind: "whole",
    min: 50 * 1024,
    max: 2 * 1024 * 1024,
    unit: "bytes",
    stricter: LOWER_STRICTER,
  },
  "bank.images.maxLongSide": {
    label: "Longest image side",
    help: "Larger images are refused.",
    kind: "whole",
    min: 400,
    max: 4000,
    unit: "pixels",
    stricter: LOWER_STRICTER,
  },
  "bank.print.nearExamDays": {
    label: "Days before an exam when teachers cannot print its questions",
    help: "Exam approvers can still print, audited and watermarked.",
    kind: "whole",
    min: 0,
    max: 60,
    unit: "days",
    stricter: HIGHER_STRICTER,
  },
  "bank.smallSummary.min": {
    label: "Fewest responses before a breakdown is shown",
    help: "Below this a summary shows only the total, so no one can be picked out.",
    kind: "whole",
    min: 3,
    max: 50,
    unit: "responses",
    stricter: HIGHER_STRICTER,
  },
  "bank.parents.view": {
    label: "What a parent can see of the question bank",
    help: "A parent account has its own sign-in. Nothing is the safest start; a summary shows how their child is getting on; everything shows the child's answers.",
    kind: "choice",
    choices: [
      { value: "NONE", label: "Nothing" },
      { value: "SUMMARY", label: "A summary of their child's practice" },
      { value: "FULL", label: "Their child's practice in full" },
    ],
    stricter: "Showing less is stricter: a campus can choose less than the school, never more.",
  },
};
