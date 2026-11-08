import { z } from "zod";
import { stepUpProofSchema } from "@/lib/school-settings/http";

// The body of a ceiling switch's PATCH (task 0027 and 0028). Strict: a key the route does not know is refused. A school value names no campus and needs a fresh proof; a campus value
// names the campus and needs none (it can only turn the switch off).
export const switchSettingSchema = z
  .strictObject({
    scope: z.enum(["SCHOOL", "CAMPUS"]),
    campusId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, "The campus is not valid")
      .optional(),
    /// null removes the stored value (back to the default, on).
    enabled: z.boolean().nullable(),
    reason: z.string().trim().max(200).optional(),
    stepUp: stepUpProofSchema.optional(),
  })
  .refine(
    (value) => (value.scope === "CAMPUS") === (value.campusId !== undefined),
    "A campus value names the campus and a school value does not",
  )
  .refine((value) => value.scope === "CAMPUS" || value.stepUp !== undefined, {
    message: "Changing the school's setting needs a fresh password or code",
    path: ["stepUp"],
  });
