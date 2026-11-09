import { z } from "zod";
import { PromotionDecision } from "@prisma/client";
import { isPlausibleId } from "@/lib/academics/http";

// The shapes the promotion routes accept. Bodies are STRICT objects: a field the server does not read is a refusal, not a silent drop (AlEemaan's task 0037 found a console that sent
// `targetArmId` and `reason` for `targetClassArmId` and `overrideReason` and lost every override's arm and reason because its schema was not strict).

const id = (what: string) => z.string().min(1, `${what} is required`).refine(isPlausibleId, `Not a valid ${what.toLowerCase()}.`);

export const passMarkField = z
  .number({ error: "Give the pass mark as a number." })
  .min(0, "The pass mark cannot be below 0.")
  .max(100, "The pass mark cannot be above 100.");

export const promotionPreviewQuerySchema = z.object({
  sourceSessionId: id("Source session"),
  targetSessionId: id("Target session"),
  sourceClassGroupId: id("Class"),
  passMark: z.coerce.number({ error: "Give the pass mark as a number." }).min(0).max(100).default(50),
});

export const promotionOverrideSchema = z.strictObject({
  studentId: id("Student"),
  decision: z.nativeEnum(PromotionDecision, { error: "Choose PROMOTED, REPEATED, GRADUATED or WITHDRAWN." }),
  targetClassArmId: id("Arm").nullable().optional(),
  overrideReason: z
    .string()
    .trim()
    .min(1, "Say why this pupil's decision is changed.")
    .max(255, "The reason can be at most 255 characters.")
    .optional(),
});

export const executePromotionSchema = z
  .strictObject({
    sourceSessionId: id("Source session"),
    targetSessionId: id("Target session"),
    sourceClassGroupId: id("Class"),
    /// What the screen believed the next class was; checked against the progression as it is NOW (a stale screen is a 409). null = the screen believed the class is the last.
    targetClassGroupId: id("Next class").nullable().optional(),
    passMark: passMarkField.default(50),
    overrides: z.array(promotionOverrideSchema).max(2000, "That is too many overrides.").default([]),
    notes: z.string().trim().max(500, "Notes can be at most 500 characters.").nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.overrides.forEach((o, index) => {
      if (seen.has(o.studentId))
        ctx.addIssue({ code: "custom", path: ["overrides", index, "studentId"], message: "This pupil is listed twice." });
      seen.add(o.studentId);
    });
  });

export type PromotionPreviewQuery = z.infer<typeof promotionPreviewQuerySchema>;
export type PromotionOverride = z.infer<typeof promotionOverrideSchema>;
export type ExecutePromotionInput = z.infer<typeof executePromotionSchema>;
