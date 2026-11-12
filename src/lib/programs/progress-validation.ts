import { z } from "zod";
import { idField } from "@/lib/academics/http";
import { HAS_CONTROL_CHARACTER } from "./rules";
import { MAX_COMMENT, MAX_RANGE_DAYS, MAX_WEEK_ROWS, PAGE_SIZE } from "./progress-rules";
import { PRESET_KEYS } from "./progress-templates";

// Progress records: the strict shapes of every body and query (task 0030). A key a route does not know is a mistake or an attack and is refused. The values of a row are
// only checked here for being an object; the server checks them against the track's columns (progress-rules.ts), which is the check that counts.

const id = (label: string) => idField.regex(/^[A-Za-z0-9_-]+$/, `${label} is not valid`);
const day = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD)`);
const key = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/i, "A track key is letters, digits and underscores");
const values = z.record(z.string().max(40), z.unknown());
const comment = z
  .string()
  .trim()
  .min(3, "Give the reason in a few words")
  .max(MAX_COMMENT, `At most ${MAX_COMMENT} characters`)
  .refine((v) => !HAS_CONTROL_CHARACTER.test(v), "That has a character that is not allowed");

export const peopleQuery = z
  .object({
    q: z.string().trim().max(64, "Search for at most 64 characters.").optional(),
    groupId: id("The group").optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const PEOPLE_PAGE_SIZE = PAGE_SIZE;

export const recordQuery = z
  .object({
    from: day("From").optional(),
    to: day("To").optional(),
    trackKey: key.optional(),
  })
  .strict();
export const MAX_RECORD_DAYS = MAX_RANGE_DAYS;

export const startSchema = z.object({ template: z.enum(PRESET_KEYS) }).strict();

export const profileSchema = z.object({ values, version: z.number().int().min(1).optional() }).strict();

export const createEntrySchema = z
  .object({ trackKey: key, entryDate: day("The date"), values, submit: z.boolean().default(false) })
  .strict();
export const updateEntrySchema = z.object({ values, version: z.number().int().min(1), submit: z.boolean().default(false) }).strict();

export const weekSchema = z
  .object({
    submit: z.boolean().default(false),
    rows: z
      .array(
        z
          .object({
            id: id("An entry").optional(),
            trackKey: key,
            entryDate: day("The date"),
            values,
            version: z.number().int().min(1).optional(),
          })
          .strict(),
      )
      .min(1, "Give at least one row")
      .max(MAX_WEEK_ROWS, `At most ${MAX_WEEK_ROWS} rows in a save`),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.rows.forEach((row, index) => {
      if (row.id && row.version === undefined)
        ctx.addIssue({ code: "custom", path: ["rows", index, "version"], message: "A row that changes an entry needs its version" });
    });
  });

/// verify: confirm a submitted entry. return: send it back to its writer with a comment. submit: the writer says it is done.
export const entryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), version: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("return"), version: z.number().int().min(1), comment }).strict(),
  z.object({ action: z.literal("submit"), version: z.number().int().min(1) }).strict(),
]);
export const verifyWeekSchema = z.object({ weekStart: day("The week") }).strict();

export const lockSchema = z.object({ action: z.enum(["take", "heartbeat", "viewing", "release"]) }).strict();

export const seenSchema = z
  .object({ studentId: id("The pupil").optional(), programId: id("The program"), weekStart: day("The week") })
  .strict();
