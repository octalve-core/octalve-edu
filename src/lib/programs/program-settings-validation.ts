import { z } from "zod";
import { bandsSchema } from "./assessment-validation";
import { MAX_CERT_BODY, MAX_CERT_TITLE, MAX_SIGNATORIES, MAX_SIGNATORY_FIELD } from "./completion-rules";
import { PRESET_KEYS } from "./progress-templates";
import { HAS_CONTROL_CHARACTER } from "./rules";

// The program's own settings, one strict body for every slice that has one (task 0027): attendance (P3), then assessments (P3b), fees (P4) and completion and certificates (P5) add their
// fields here. A key the route does not know is a mistake or an attack, and it is refused.

const plain = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} can be at most ${max} characters`)
    .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`);

export const programSettingsSchema = z
  .object({
    attendanceEnabled: z.boolean().optional(),
    lowAttendancePercent: z
      .number()
      .int()
      .min(1, "The threshold is a percentage from 1 to 100")
      .max(100, "The threshold is a percentage from 1 to 100")
      .optional(),
    assessmentsEnabled: z.boolean().optional(),
    gradeBands: bandsSchema.optional(),
    feesEnabled: z.boolean().optional(),
    certTitle: plain("The title", 1, MAX_CERT_TITLE).optional(),
    certBody: plain("The wording", 1, MAX_CERT_BODY).optional(),
    certSignatories: z
      .array(
        z
          .object({
            name: plain("A signatory's name", 1, MAX_SIGNATORY_FIELD),
            title: plain("A signatory's title", 0, MAX_SIGNATORY_FIELD),
          })
          .strict(),
      )
      .max(MAX_SIGNATORIES, `At most ${MAX_SIGNATORIES} signatories`)
      .optional(),
    completionMinAverage: z
      .number()
      .min(0, "The average is a percentage from 0 to 100")
      .max(100, "The average is a percentage from 0 to 100")
      .refine((n) => Math.round(n * 100) / 100 === n, "At most two decimal places")
      .nullable()
      .optional(),
    completionRequirePassed: z.boolean().optional(),
    noCertWhileOwing: z.boolean().optional(),
    progressEnabled: z.boolean().optional(),
    progressTemplate: z.enum(PRESET_KEYS).optional(),
    progressWriters: z.enum(["TEACHERS", "ASSIGNED", "BOTH"]).optional(),
    progressRequireVerification: z.boolean().optional(),
    progressFourEyes: z.boolean().optional(),
    progressLockInactivity: z.number().int().min(60, "From 60 to 3600 seconds").max(3600, "From 60 to 3600 seconds").optional(),
    progressLockRelease: z.number().int().min(0, "From 0 to 300 seconds").max(300, "From 0 to 300 seconds").optional(),
    progressStudentView: z.boolean().optional(),
    progressGuardianView: z.boolean().optional(),
    progressGuardianDetail: z.enum(["SUMMARY", "FULL"]).optional(),
    progressHijriAdjust: z.number().int().min(-2, "From -2 to 2 days").max(2, "From -2 to 2 days").optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Change at least one setting");
