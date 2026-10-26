import { z } from "zod";
import { normalizeLabel } from "@/lib/question-bank/labels";
import { overlapTokens } from "@/lib/question-bank/overlap";
import { hasForbiddenCharacters } from "@/lib/question-bank/validation";

// What a teacher may send when writing a question, and what is stored. One module, no database: the request body is parsed and normalised here, the stored shape
// (`options` as `[{ id, text }]`, `correctAnswer` as ids or accepted answers) is built here, and `toEditable` turns a stored question back into what the form edits, so
// the two can be tested against each other. Slice 2 handles the ASSESSMENT bank only: the body has no `bank` field.
//
// The four types (design note section 4):
//   SINGLE      2 to 8 options, exactly one correct          { options: string[], correct: number }
//   MULTI       2 to 8 options, one or more correct          { options: string[], correct: number[] }  (right only when exactly the right set is chosen)
//   TRUE_FALSE  fixed options "True" and "False"             { correct: boolean }
//   SHORT       the accepted answers (1 to 10)               { correct: string[] }
//
// Text rules: NFC-normalised and trimmed; no NUL, other control, private-use, unassigned or lone-surrogate characters; no bidi override or isolate characters (they make
// text read differently from how it is stored); new lines and tabs are allowed in a prompt and an explanation only. Zero-width joiners and the left-to-right and
// right-to-left marks stay, because Persian and Arabic text needs them.

export const ITEM_LIMITS = {
  prompt: 4000,
  explanation: 2000,
  topic: 120,
  subject: 80,
  option: 500,
  options: { min: 2, max: 8 },
  accepted: { max: 10, length: 500 },
  tags: { max: 10, length: 40 },
  points: { min: 0, max: 100 },
} as const;

// \p{Cc} is every control character (a tab or a new line is allowed in multi-line text only, and is turned into a space in single-line text first). \p{Cf} is NOT refused
// wholesale (see above): only the bidi embeddings, overrides and isolates, the zero-width space, the invisible operators, the soft hyphen, the byte-order mark and the
// interlinear annotation characters, which only ever hide or reorder text.
const BIDI_AND_INVISIBLE = /[\u200b\u202a-\u202e\u2066-\u2069\u2060-\u2064\u00ad\ufeff\ufff9-\ufffb\u180e]/u;
const NOT_ALLOWED = /[\p{Cc}\p{Co}\p{Cn}\p{Cs}]/u;

/// NFC, trimmed, and refused when it holds a character a question must not carry. Returns null when the text is not acceptable.
export function cleanText(raw: string, { multiline }: { multiline: boolean }): string | null {
  const normalised = raw.normalize("NFC");
  const text = multiline ? normalised.replace(/\r\n?/g, "\n").trim() : normalised.replace(/\s+/g, " ").trim();
  // in multi-line text the tab and the new line are the two controls that are allowed: check everything else
  const checked = multiline ? text.replace(/[\t\n]/g, " ") : text;
  if (NOT_ALLOWED.test(checked) || BIDI_AND_INVISIBLE.test(checked)) return null;
  return text;
}

const text = (max: number, what: string, { multiline = false, optional = false } = {}) =>
  z
    .string({ error: `${what} must be text.` })
    .max(max * 4, `${what} is too long.`) // a cheap cap on the raw size before any normalising
    .transform((raw, ctx) => {
      const cleaned = cleanText(raw, { multiline });
      if (cleaned === null) {
        ctx.addIssue({
          code: "custom",
          message: `${what} contains a character that cannot be used (a control, invisible or direction-changing character).`,
        });
        return z.NEVER;
      }
      if (cleaned.length === 0 && !optional) {
        ctx.addIssue({ code: "custom", message: `${what} is required.` });
        return z.NEVER;
      }
      if (cleaned.length > max) {
        ctx.addIssue({ code: "custom", message: `${what} is at most ${max} characters.` });
        return z.NEVER;
      }
      return cleaned;
    });

const optionalText = (max: number, what: string, multiline = false) =>
  z.union([text(max, what, { multiline, optional: true }), z.null()]).transform((v) => (v === "" || v === null ? null : v));

const common = {
  prompt: text(ITEM_LIMITS.prompt, "The question", { multiline: true }),
  explanation: optionalText(ITEM_LIMITS.explanation, "The explanation", true).optional(),
  points: z
    .number({ error: "Points must be a number." })
    .int("Points must be a whole number.")
    .min(ITEM_LIMITS.points.min)
    .max(ITEM_LIMITS.points.max)
    .default(1),
  difficulty: z.number().int().min(1, "Difficulty is 1 to 5.").max(5, "Difficulty is 1 to 5.").nullable().optional(),
  topic: optionalText(ITEM_LIMITS.topic, "The topic").optional(),
  subject: optionalText(ITEM_LIMITS.subject, "The subject").optional(),
  classTags: z
    .array(text(ITEM_LIMITS.tags.length, "A class"))
    .max(ITEM_LIMITS.tags.max, `At most ${ITEM_LIMITS.tags.max} classes.`)
    .default([]),
};

const optionTexts = z
  .array(text(ITEM_LIMITS.option, "An option"))
  .min(ITEM_LIMITS.options.min, `A question needs at least ${ITEM_LIMITS.options.min} options.`)
  .max(ITEM_LIMITS.options.max, `A question has at most ${ITEM_LIMITS.options.max} options.`);

const index = z.number({ error: "The correct answer must be the number of an option." }).int().min(0);

export const itemBody = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("SINGLE"), ...common, options: optionTexts, correct: index }),
  z.strictObject({
    type: z.literal("MULTI"),
    ...common,
    options: optionTexts,
    correct: z.array(index).min(1, "Choose at least one correct option.").max(ITEM_LIMITS.options.max),
  }),
  z.strictObject({ type: z.literal("TRUE_FALSE"), ...common, correct: z.boolean({ error: "Choose True or False." }) }),
  z.strictObject({
    type: z.literal("SHORT"),
    ...common,
    correct: z
      .array(text(ITEM_LIMITS.accepted.length, "An accepted answer"))
      .min(1, "Give at least one accepted answer.")
      .max(ITEM_LIMITS.accepted.max, `At most ${ITEM_LIMITS.accepted.max} accepted answers.`),
  }),
]);

export type ItemBody = z.infer<typeof itemBody>;

export type StoredOption = { id: string; text: string };
export type StoredItem = {
  type: "SINGLE" | "MULTI" | "TRUE_FALSE" | "SHORT";
  prompt: string;
  explanation: string | null;
  points: number;
  difficulty: number | null;
  topic: string | null;
  options: StoredOption[];
  correctAnswer: string | string[];
  subjectLabel: string | null;
  subjectKey: string | null;
  classTags: { label: string; labelKey: string }[];
};

export type ItemProblem = { path: string; message: string };
export type ParsedItem = { ok: true; item: StoredItem } | { ok: false; problems: ItemProblem[] };

const TRUE_FALSE_OPTIONS: StoredOption[] = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
];

/// The key two options are compared by: the same folding the overlap check uses, so "Paris" and "paris." are one option.
const optionKey = (value: string) => overlapTokens(value).join(" ");

function semanticProblems(body: ItemBody): ItemProblem[] {
  const problems: ItemProblem[] = [];
  if (body.type === "SINGLE" || body.type === "MULTI") {
    const keys = body.options.map(optionKey);
    keys.forEach((key, i) => {
      if (key === "") problems.push({ path: `options.${i}`, message: "An option needs at least one letter or digit." });
    });
    const seen = new Map<string, number>();
    keys.forEach((key, i) => {
      if (key === "") return;
      if (seen.has(key)) problems.push({ path: `options.${i}`, message: "Two options are the same." });
      else seen.set(key, i);
    });
    const corrects = body.type === "SINGLE" ? [body.correct] : body.correct;
    for (const c of corrects)
      if (c >= body.options.length) problems.push({ path: "correct", message: "The correct answer is not one of the options." });
    if (body.type === "MULTI") {
      if (new Set(body.correct).size !== body.correct.length)
        problems.push({ path: "correct", message: "The same option is marked correct twice." });
    }
  }
  if (body.type === "SHORT") {
    const keys = body.correct.map(optionKey);
    keys.forEach((key, i) => {
      if (key === "") problems.push({ path: `correct.${i}`, message: "An accepted answer needs at least one letter or digit." });
    });
  }
  return problems;
}

/// The whole path from request to stored shape. Never throws: a bad body is a list of problems, each with the field it belongs to and a sentence that can be shown.
export function parseItem(raw: unknown): ParsedItem {
  const parsed = itemBody.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  }
  const body = parsed.data;
  const problems = semanticProblems(body);

  let subjectLabel: string | null = null;
  let subjectKey: string | null = null;
  if (body.subject) {
    subjectKey = normalizeLabel(body.subject);
    if (!subjectKey || hasForbiddenCharacters(body.subject))
      problems.push({ path: "subject", message: "The subject needs at least one letter or digit." });
    else subjectLabel = body.subject;
  }

  const classTags: StoredItem["classTags"] = [];
  const seenTags = new Set<string>();
  body.classTags.forEach((label, i) => {
    const labelKey = normalizeLabel(label);
    if (!labelKey || hasForbiddenCharacters(label)) {
      problems.push({ path: `classTags.${i}`, message: "A class needs at least one letter or digit." });
      return;
    }
    if (seenTags.has(labelKey)) return; // "JSS 1" and "jss-1" are one class: keep the first
    seenTags.add(labelKey);
    classTags.push({ label, labelKey });
  });
  if (problems.length > 0) return { ok: false, problems };

  const base = {
    prompt: body.prompt,
    explanation: body.explanation ?? null,
    points: body.points,
    difficulty: body.difficulty ?? null,
    topic: body.topic ?? null,
    subjectLabel,
    subjectKey,
    classTags,
  };
  switch (body.type) {
    case "SINGLE":
      return {
        ok: true,
        item: {
          type: "SINGLE",
          ...base,
          options: body.options.map((t, i) => ({ id: `o${i + 1}`, text: t })),
          correctAnswer: `o${body.correct + 1}`,
        },
      };
    case "MULTI":
      return {
        ok: true,
        item: {
          type: "MULTI",
          ...base,
          options: body.options.map((t, i) => ({ id: `o${i + 1}`, text: t })),
          correctAnswer: [...body.correct].sort((a, b) => a - b).map((c) => `o${c + 1}`),
        },
      };
    case "TRUE_FALSE":
      return {
        ok: true,
        item: {
          type: "TRUE_FALSE",
          ...base,
          options: TRUE_FALSE_OPTIONS.map((o) => ({ ...o })),
          correctAnswer: body.correct ? "true" : "false",
        },
      };
    case "SHORT":
      return { ok: true, item: { type: "SHORT", ...base, options: [], correctAnswer: body.correct } };
  }
}

/// What the question form edits, from the stored shape: the request body that would store this question again.
export function toEditable(stored: Omit<StoredItem, "classTags"> & { classTags: { label: string }[] }): Record<string, unknown> {
  const common = {
    prompt: stored.prompt,
    explanation: stored.explanation,
    points: stored.points,
    difficulty: stored.difficulty,
    topic: stored.topic,
    subject: stored.subjectLabel,
    classTags: stored.classTags.map((t) => t.label),
  };
  switch (stored.type) {
    case "SINGLE":
      return {
        type: "SINGLE",
        ...common,
        options: stored.options.map((o) => o.text),
        correct: stored.options.findIndex((o) => o.id === stored.correctAnswer),
      };
    case "MULTI": {
      const ids = new Set(Array.isArray(stored.correctAnswer) ? stored.correctAnswer : [stored.correctAnswer]);
      return {
        type: "MULTI",
        ...common,
        options: stored.options.map((o) => o.text),
        correct: stored.options.flatMap((o, i) => (ids.has(o.id) ? [i] : [])),
      };
    }
    case "TRUE_FALSE":
      return { type: "TRUE_FALSE", ...common, correct: stored.correctAnswer === "true" };
    case "SHORT":
      return { type: "SHORT", ...common, correct: Array.isArray(stored.correctAnswer) ? stored.correctAnswer : [stored.correctAnswer] };
  }
}
