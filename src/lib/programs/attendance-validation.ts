import { z } from "zod";
import { idField } from "@/lib/academics/http";
import { ATTENDANCE_STATUSES, MAX_REMARKS, MAX_ROLL_MARKS, MAX_SESSION_LABEL, cleanLabel } from "./attendance-rules";
import { HAS_CONTROL_CHARACTER, parseIsoDate } from "./rules";

// Programs, slice P3: the shapes of the attendance routes. Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused.

const id = (label: string) => idField.regex(/^[A-Za-z0-9_-]+$/, `${label} is not valid`);
const day = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD)`)
    .refine((value) => parseIsoDate(value) !== null, `${label} must be a real date (YYYY-MM-DD)`);

const label = z
  .string()
  .transform(cleanLabel)
  .pipe(
    z
      .string()
      .max(MAX_SESSION_LABEL, `A session name can be at most ${MAX_SESSION_LABEL} characters`)
      .refine((value) => !HAS_CONTROL_CHARACTER.test(value), "The session name has a character that is not allowed"),
  );

const note = (what: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${what} can be at most ${max} characters`)
    .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${what} has a character that is not allowed`);

export const rollQuery = z.object({ groupId: id("The group"), date: day("The date"), label: label.default("") });

export const markRollSchema = z
  .object({
    groupId: id("The group"),
    date: day("The date"),
    label: label.default(""),
    /// Why a mark is being corrected: required when the correction needs one (a supervisor's, or one for a day older than a teacher can reach). One reason for the whole save.
    reason: note("The reason", 500).optional(),
    marks: z
      .array(
        z
          .object({
            participantId: id("A person"),
            status: z.enum(ATTENDANCE_STATUSES),
            remarks: note("A remark", MAX_REMARKS).nullish(),
            /// The version of the mark the page showed (absent = the page showed no mark). A stale one is refused, so two people cannot silently overwrite each other.
            version: z.number().int().min(1).max(1_000_000).optional(),
          })
          .strict(),
      )
      .min(1, "Mark at least one person")
      .max(MAX_ROLL_MARKS, `At most ${MAX_ROLL_MARKS} people can be marked in one save`),
  })
  .strict();

const range = {
  from: day("The first date"),
  to: day("The last date"),
};

export const sessionsQuery = z.object({ groupId: id("The group").optional(), ...range });
export const summaryQuery = z.object({ groupId: id("The group").optional(), ...range });
export const historyQuery = z.object({ from: range.from.optional(), to: range.to.optional() });
