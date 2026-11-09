import { z } from "zod";
import { idField } from "@/lib/academics/http";
import {
  MAX_BAND_NAME,
  MAX_BANDS,
  MAX_COMMENT,
  MAX_KIND,
  MAX_SCORE,
  MAX_SCORE_ENTRIES,
  MAX_TITLE,
  SCORE_CODES,
  bandsProblem,
  cleanText,
  roundTo2,
} from "./assessment-rules";
import { HAS_CONTROL_CHARACTER, parseIsoDate } from "./rules";

// Programs, slice P3b: the shapes of the assessment routes. Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused.

const id = (label: string) => idField.regex(/^[A-Za-z0-9_-]+$/, `${label} is not valid`);
const day = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD)`)
    .refine((value) => parseIsoDate(value) !== null, `${label} must be a real date (YYYY-MM-DD)`);

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, `${label} is required`)
        .max(max, `${label} can be at most ${max} characters`)
        .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`),
    );

const note = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters`)
    .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`);

/// A number with at most two decimals, never NaN or infinite (JSON cannot carry those, but a string cannot slip in either: this is a number).
const amount = (label: string, min: number, max: number) =>
  z
    .number({ message: `${label} must be a number` })
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} can be at most ${max}`)
    .refine((n) => roundTo2(n) === n, `${label} has at most two decimal places`);

const fields = {
  title: text("The title", 1, MAX_TITLE),
  kind: text("The kind", 0, MAX_KIND).default(""),
  date: day("The date"),
  maxScore: amount("The maximum", 0.01, MAX_SCORE),
  passMark: amount("The pass mark", 0, MAX_SCORE).nullish(),
  weight: amount("The weight", 0.01, 100).default(1),
  required: z.boolean().default(false),
  groupIds: z.array(id("A group")).max(200).default([]),
};

export const createAssessmentSchema = z
  .object(fields)
  .strict()
  .refine((v) => v.passMark == null || v.passMark <= v.maxScore, {
    message: "The pass mark can't be above the maximum",
    path: ["passMark"],
  });

/// A draft can change anything; an open one only its labels, pass mark, weight and `required` (the route and the service say which).
export const updateAssessmentSchema = z
  .object({
    title: fields.title.optional(),
    // No default here: an edit that does not mention the kind must leave it alone (and an empty edit must stay empty so it is refused).
    kind: text("The kind", 0, MAX_KIND).optional(),
    date: fields.date.optional(),
    maxScore: fields.maxScore.optional(),
    passMark: fields.passMark,
    weight: amount("The weight", 0.01, 100).optional(),
    required: z.boolean().optional(),
    groupIds: z.array(id("A group")).max(200).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Change at least one thing");

export const assessmentActionSchema = z.object({ action: z.enum(["open", "mark", "reopen", "publish", "archive"]) }).strict();

export const saveScoresSchema = z
  .object({
    reason: note("The reason", 500).optional(),
    entries: z
      .array(
        z
          .object({
            participantId: id("A person"),
            score: amount("A score", 0, MAX_SCORE).optional(),
            code: z.enum(SCORE_CODES).optional(),
            comment: note("A comment", MAX_COMMENT).nullish(),
            version: z.number().int().min(1).max(1_000_000).optional(),
          })
          .strict()
          .refine((e) => (e.score !== undefined) !== (e.code !== undefined), "Give a score or a code, not both and not neither"),
      )
      .min(1, "Enter at least one score")
      .max(MAX_SCORE_ENTRIES, `At most ${MAX_SCORE_ENTRIES} scores can be saved at once`),
  })
  .strict();

export const bandsSchema = z
  .array(z.object({ name: text("A grade name", 1, MAX_BAND_NAME), from: amount("A grade start", 0, 100) }).strict())
  .max(MAX_BANDS, `At most ${MAX_BANDS} grades`)
  .superRefine((bands, context) => {
    const problem = bandsProblem(bands);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });

export const resultsQuery = z.object({ groupId: id("The group").optional() });
