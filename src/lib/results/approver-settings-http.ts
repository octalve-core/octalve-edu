import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { stepUpProofSchema } from "@/lib/school-settings/http";
import type { ApproverSettingsFailure } from "./approver-settings";
import { SCOPES_PER_PERSON_MAX } from "./section-rules";

// The HTTP face of the sections and approver-scope settings (ADR 0018): the request bodies, the limiter, and the one place that turns a refusal into a status, a stable
// `code` and words a person can act on. An unknown id, another school's id and another campus's id share ONE answer (NOT_FOUND), as everywhere else.

/// A path parameter that cannot be an id of ours is the same "no such thing" as one that merely does not exist.
export const isPlausibleId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

const idField = z.string({ error: "Give an id." }).min(1).max(64);
const nameField = z.string({ error: "Give a name." }).max(400, "That is too long.");
const sortOrderField = z.number({ error: "The order must be a whole number from 0 to 999." }).int().min(0).max(999);

export const createSectionBody = z.strictObject({
  name: nameField,
  campusId: idField.nullable().optional(),
  sortOrder: sortOrderField.optional(),
  stepUp: stepUpProofSchema,
});

export const updateSectionBody = z
  .strictObject({
    name: nameField.optional(),
    sortOrder: sortOrderField.optional(),
    archived: z.boolean({ error: "Say whether it is archived." }).optional(),
    stepUp: stepUpProofSchema,
  })
  .refine((body) => body.name !== undefined || body.sortOrder !== undefined || body.archived !== undefined, {
    message: "Give at least one of name, sortOrder and archived.",
  });

export const placeClassGroupBody = z.strictObject({
  sectionId: idField.nullable(),
  stepUp: stepUpProofSchema,
});

const scopeEntry = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("GENERAL") }),
  z.strictObject({ kind: z.literal("SECTION"), sectionId: idField }),
  z.strictObject({ kind: z.literal("CLASS"), classGroupId: idField }),
]);
export const setScopesBody = z.strictObject({
  scopes: z.array(scopeEntry, { error: "Give the scopes as a list." }).max(SCOPES_PER_PERSON_MAX, "That is too many."),
  stepUp: stepUpProofSchema,
});

const WRITES_PER_WINDOW = 120;
/// One administrator's changes to sections and scopes are limited like the Users page's: a runaway client cannot hammer the school's approval setup.
export async function settingsWriteLimited(auth: TenantAuthContext): Promise<Response | null> {
  if (await reserveAttempt(`approver-settings:write:${auth.tenant.tenantId}:${auth.userId}`, WRITES_PER_WINDOW)) return null;
  return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
}

export function approverSettingsFailure(reason: ApproverSettingsFailure, what?: string): Response {
  switch (reason) {
    case "NOT_FOUND":
      return fail(`No such ${what ?? "item"}.`, 404, "NOT_FOUND");
    case "INVALID_NAME":
      return fail("Give it a name of 1 to 80 characters.", 400, "VALIDATION", [
        { path: "body.name", message: "Give it a name (not blank, at most 80 characters)." },
      ]);
    case "INVALID_CAMPUS":
      return fail("Choose one of this school's campuses.", 400, "VALIDATION", [
        { path: "body.campusId", message: "Choose one of this school's campuses." },
      ]);
    case "NAME_TAKEN":
      return fail("Another section on that campus already has that name.", 409, "NAME_TAKEN", [
        { path: "body.name", message: "Another section on that campus already has that name." },
      ]);
    case "ARCHIVED":
      return fail(`That ${what ?? "item"} is archived. Restore it first.`, 409, "ARCHIVED");
    case "CAMPUS_MISMATCH":
      return fail(`That ${what ?? "item"} belongs to a different campus.`, 409, "CAMPUS_MISMATCH");
    case "NOT_AN_APPROVER":
      return fail("That person does not hold the permission to approve results. Give them the permission first.", 409, "NOT_AN_APPROVER");
    case "GENERAL_WITH_OTHERS":
      return fail("General already covers every class. Remove the other entries, or remove General.", 400, "VALIDATION", [
        { path: "body.scopes", message: "General already covers every class." },
      ]);
  }
}
