import { z } from "zod";
import { SchoolType } from "@prisma/client";
import { fail } from "@/lib/api/envelope";
import { PASSWORD_MAX_LENGTH } from "@/lib/auth/password";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { isValidTenantCode } from "@/lib/tenant/validate-code";
import { emailField } from "@/lib/members/http";

// The HTTP face of the platform surface: the shared field rules, and the refusals in words a person can act on.

export const SCHOOL_TYPES = Object.values(SchoolType) as [SchoolType, ...SchoolType[]];
export const schoolTypeField = z.enum(SCHOOL_TYPES, { error: "Choose a school type." });
/// The password typed again for a change (a step-up). Optional in the SHAPE so a missing one is answered as a wrong one (403 WRONG_PASSWORD, in the
/// shape the dialogs read) rather than as a validation problem.
export const passwordField = z.string().max(PASSWORD_MAX_LENGTH).optional();
export const codeField = z
  .string({ error: "Enter the school's code." })
  .refine(isValidTenantCode, "Use 2 to 40 lowercase letters, numbers or hyphens, and not a reserved word.");
export const nameField = z
  .string({ error: "Enter the school's name." })
  .transform((value) => value.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Enter the school's name.").max(100, "Use at most 100 characters."));
export { emailField };

const CHANGES_PER_WINDOW = 30; // per platform administrator per 5 minutes
export async function changeLimited(userId: string): Promise<Response | null> {
  if (await reserveAttempt(`platform:change:${userId}`, CHANGES_PER_WINDOW)) return null;
  return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
}

export const noSuchSchool = () => fail("No such school.", 404, "NOT_FOUND");
export const hasPeriods = () => fail("This school already has academic periods, so its type can no longer be changed.", 409, "HAS_PERIODS");
