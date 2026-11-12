import { z } from "zod";
import { MAX_REASON, MIN_REASON } from "./rules";

// Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused, never ignored.

const reason = z
  .string()
  .trim()
  .min(MIN_REASON, `Say why (at least ${MIN_REASON} characters)`)
  .max(MAX_REASON, `The reason can be at most ${MAX_REASON} characters`)
  // Letters, digits, punctuation and spaces; a control character (other than a line break or tab) in a reason is refused.
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "The reason has a character that is not allowed");

const until = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "The end date must be a date (YYYY-MM-DD)")
  .nullish();

export const studentStandingSchema = z.object({ action: z.enum(["suspend", "lift", "expel", "reinstate"]), reason, until }).strict();

export const staffStandingSchema = z.object({ action: z.enum(["suspend", "lift", "terminate", "reinstate"]), reason, until }).strict();

export type StudentStandingBody = z.infer<typeof studentStandingSchema>;
export type StaffStandingBody = z.infer<typeof staffStandingSchema>;
