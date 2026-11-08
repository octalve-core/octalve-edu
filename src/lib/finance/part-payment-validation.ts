import { z } from "zod";
import { stepUpProofSchema } from "@/lib/school-settings/http";
import { parsePolicy, type PartPaymentPolicy } from "./part-payment";

// Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused, never ignored.

const minimum = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NONE") }),
  z.strictObject({ kind: z.literal("AMOUNT"), value: z.number() }),
  z.strictObject({ kind: z.literal("PERCENT"), value: z.number() }),
]);

const policy = z
  .strictObject({ allowed: z.boolean(), minimum })
  // The same strict reading the server uses for what it stored: an amount of up to two decimals, at most a billion; a percentage from 1 to 100.
  .refine(
    (value) => parsePolicy(value) !== undefined,
    "The smallest part must be an amount in naira with at most two decimals, or a percentage from 1 to 100",
  )
  .transform((value) => parsePolicy(value) as PartPaymentPolicy);

export const partPaymentSettingSchema = z
  .strictObject({
    scope: z.enum(["SCHOOL", "CAMPUS"]),
    campusId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, "The campus is not valid")
      .optional(),
    /// null removes the stored value (back to the default: part payments allowed, any amount).
    policy: policy.nullable(),
    reason: z.string().trim().max(200).optional(),
    /// A change of the SCHOOL's rule needs a fresh re-authentication (PRD section 14); a campus's tightening does not (task 0027, section 2, point 6).
    stepUp: stepUpProofSchema.optional(),
  })
  .refine(
    (value) => (value.scope === "CAMPUS") === (value.campusId !== undefined),
    "A campus value names the campus and a school value does not",
  )
  .refine((value) => value.scope === "CAMPUS" || value.stepUp !== undefined, {
    message: "Changing the school's rule needs a fresh password or code",
    path: ["stepUp"],
  });

export const payInFullSchema = z.strictObject({ payInFull: z.boolean() });
