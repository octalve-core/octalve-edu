import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { ResultStatus } from "@prisma/client";
import { isPlausibleId } from "@/lib/academics/http";

export const STAFF_READ_ROLES = ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const;
export const WRITE_ROLES = ["ADMIN", "TEACHING_STAFF"] as const;

/// The largest mark the column holds (`Result.score` and `maxScore` are Decimal(6,2)): a larger one is a refusal, not a database error.
const MAX_MARK = 9999.99;
const idField = (what: string) => z.string().min(1, `${what} is required`).refine(isPlausibleId, `Not a valid ${what.toLowerCase()}.`);

export const componentScoreItemSchema = z.strictObject({
  name: z.string().min(1, "Component name is required").max(40, "Component name cannot exceed 40 characters"),
  score: z.number().min(0, "Component score cannot be negative").max(MAX_MARK, `A score cannot exceed ${MAX_MARK}`),
  maxScore: z.number().positive("Component max score must be positive").max(MAX_MARK, `A maximum cannot exceed ${MAX_MARK}`),
});

export const studentResultEntrySchema = z.strictObject({
  studentId: idField("Student ID"),
  score: z.number().min(0, "Score cannot be negative").max(MAX_MARK, `A score cannot exceed ${MAX_MARK}`).optional(),
  maxScore: z.number().positive("Max score must be positive").max(MAX_MARK, `A maximum cannot exceed ${MAX_MARK}`).optional().default(100),
  components: z.array(componentScoreItemSchema).optional(),
});

export const recordResultsSchema = z.strictObject({
  periodId: idField("Academic period ID"),
  subjectId: idField("Subject ID"),
  results: z
    .array(studentResultEntrySchema)
    .min(1, "Provide at least one student result")
    .superRefine((entries, ctx) => {
      const seen = new Set<string>();
      entries.forEach((entry, index) => {
        if (seen.has(entry.studentId)) ctx.addIssue({ code: "custom", path: [index, "studentId"], message: "This student appears twice." });
        seen.add(entry.studentId);
      });
    }),
});

export type RecordResultsInput = z.infer<typeof recordResultsSchema>;

export const transitionStatusSchema = z.strictObject({
  resultIds: z.array(idField("Result ID")).min(1, "Provide at least one result ID"),
  toStatus: z.nativeEnum(ResultStatus, { error: "Invalid result status" }),
  reason: z.string().max(500, "Reason cannot exceed 500 characters").optional().nullable(),
});

export type TransitionStatusInput = z.infer<typeof transitionStatusSchema>;

const queryId = (what: string) => z.string().refine(isPlausibleId, `Not a valid ${what}.`).optional();

export const resultsQuerySchema = z.object({
  periodId: queryId("period id"),
  subjectId: queryId("subject id"),
  classArmId: queryId("class arm id"),
  status: z.nativeEnum(ResultStatus).optional(),
});

export type ResultFailure =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "INVALID_TRANSITION"
  | "MISSING_REASON"
  | "SCHEME_VALIDATION_FAILED"
  | "SCORE_OUT_OF_BOUNDS"
  | "NOT_EDITABLE"
  | "NOT_ASSIGNED"
  | "FORBIDDEN_STUDENT_ACCESS"
  | "PERIOD_NOT_ACTIVE";

export function resultFailure(reason: ResultFailure, message?: string): Response {
  switch (reason) {
    case "NOT_FOUND":
      return fail(message ?? "Resource not found.", 404, "NOT_FOUND");
    case "UNAUTHORIZED":
      return fail(message ?? "You lack the permission to perform this result action.", 403, "FORBIDDEN");
    case "INVALID_TRANSITION":
      return fail(message ?? "The requested result status transition is invalid.", 400, "INVALID_TRANSITION");
    case "MISSING_REASON":
      return fail(message ?? "A non-empty reason is required for this status change.", 400, "MISSING_REASON");
    case "SCHEME_VALIDATION_FAILED":
      return fail(message ?? "Component scores do not conform to assessment scheme.", 400, "VALIDATION");
    case "SCORE_OUT_OF_BOUNDS":
      return fail(message ?? "Score exceeds allowed maximum or is negative.", 400, "VALIDATION");
    case "NOT_EDITABLE":
      return fail(message ?? "That result has left DRAFT and cannot be changed here.", 409, "CONFLICT");
    case "NOT_ASSIGNED":
      return fail(message ?? "You are not assigned to teach this subject to this class.", 403, "FORBIDDEN");
    case "FORBIDDEN_STUDENT_ACCESS":
      return fail(message ?? "You are not authorized to view this student's report card.", 403, "FORBIDDEN");
    case "PERIOD_NOT_ACTIVE":
      return fail(message ?? "The academic period is closed or invalid.", 409, "CONFLICT");
    default:
      return fail(message ?? "Results operation failed.", 400, "BAD_REQUEST");
  }
}
