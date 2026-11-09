import { z } from "zod";
import { idField } from "@/lib/academics/http";
import { MAX_ISSUE_BATCH } from "./completion-rules";
import { HAS_CONTROL_CHARACTER } from "./rules";

// Programs, slice P5: the shapes of the completion and certificate routes. Every body is `.strict()`.

const id = (label: string) => idField.regex(/^[A-Za-z0-9_-]+$/, `${label} is not valid`);
const reason = (label: string) =>
  z
    .string()
    .trim()
    .min(3, `${label} must be at least 3 characters`)
    .max(500, `${label} can be at most 500 characters`)
    .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`);

export const completeProgramSchema = z
  .object({
    confirm: z.boolean().default(false),
    /// A reason for each person who does not meet the completion rule but is completed anyway.
    overrides: z
      .array(z.object({ participantId: id("A person"), reason: reason("The reason") }).strict())
      .max(5000)
      .default([]),
  })
  .strict();

export const completePlaceSchema = z
  .object({
    note: z
      .string()
      .trim()
      .max(200, "The note can be at most 200 characters")
      .refine((v) => !HAS_CONTROL_CHARACTER.test(v), "The note has a character that is not allowed")
      .optional(),
    overrideReason: reason("The reason").optional(),
  })
  .strict();

export const reopenSchema = z.object({ reason: reason("The reason") }).strict();
export const issueSchema = z.object({ participantIds: z.array(id("A person")).min(1).max(MAX_ISSUE_BATCH).optional() }).strict();
export const revokeSchema = z.object({ action: z.literal("revoke"), reason: reason("The reason") }).strict();
