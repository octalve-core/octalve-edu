import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { stepUpProofSchema } from "@/lib/school-settings/http";
import { verifyStepUpProof } from "@/lib/school-settings/service";
import { stepUpFailure } from "@/lib/school-settings/step-up";
import type { ChangeResult } from "@/lib/question-bank/settings-service";
import type { Fail } from "@/lib/question-bank/reviewers-service";

// The HTTP face of the question bank's administration (task 0024 slice B): the request bodies, the limiter, the fresh re-authentication, and the one place that turns a refusal
// into a status, a stable `code` and words a person can act on. An unknown id, another school's id and another campus's id share ONE answer (404), as everywhere else.

/// A path parameter that cannot be an id of ours is the same "no such thing" as one that merely does not exist.
export const isPlausibleId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

const idField = z.string({ error: "Give an id." }).min(1).max(64);

export const addReviewerBody = z.strictObject({
  /// REQUIRED, and null on purpose means "every campus of the school" (only the school's administrator): an administrator who leaves it out is told, not given the widest reach.
  campusId: idField.nullable(),
  userId: idField,
  scope: z.enum(["GENERAL", "SUBJECT"], { error: "Choose whether the reviewer covers every subject or one." }),
  subjectLabel: z.string().max(200, "That subject name is too long.").nullable().optional(),
  isExamApprover: z.boolean({ error: "Say whether they are an exam approver." }).optional(),
  stepUp: stepUpProofSchema,
});

export const removeReviewerBody = z.strictObject({ stepUp: stepUpProofSchema });

export const CHANGES_MAX = 20;
export const settingsChangeBody = z.strictObject({
  scope: z.enum(["SCHOOL", "CAMPUS"], { error: "Say whether this is the school's setting or a campus's." }),
  campusId: idField.nullable().optional(),
  changes: z
    .record(z.string().max(80), z.unknown(), { error: "Give the changes as a list of settings." })
    .refine((changes) => Object.keys(changes).length <= CHANGES_MAX, `Change at most ${CHANGES_MAX} settings at a time.`),
  reason: z.string().max(500, "The reason can be at most 500 characters.").nullable().optional(),
  stepUp: stepUpProofSchema,
});

export const settingsQuery = z.object({ campusId: idField.optional() });

const WRITES_PER_WINDOW = 120;
/// One administrator's changes are limited like the Users page's: a runaway client cannot hammer the school's question bank setup.
export async function bankWriteLimited(auth: TenantAuthContext): Promise<Response | null> {
  if (await reserveAttempt(`question-bank:write:${auth.tenant.tenantId}:${auth.userId}`, WRITES_PER_WINDOW)) return null;
  return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
}

/// The limiter, then the fresh proof. `ok` carries when the person proved who they are (the audit rows record it); otherwise the response to send.
export async function requireFreshProof(
  auth: TenantAuthContext,
  stepUp: z.infer<typeof stepUpProofSchema>,
): Promise<{ ok: true; verifiedAt: Date } | { ok: false; response: Response }> {
  const limited = await bankWriteLimited(auth);
  if (limited) return { ok: false, response: limited };
  const proof = await verifyStepUpProof(auth.userId, stepUp);
  if (!proof.ok) return { ok: false, response: stepUpFailure(proof) };
  return { ok: true, verifiedAt: proof.verifiedAt };
}

export const failureResponse = (result: Fail) => fail(result.message, result.status, result.code);

export function settingsFailureResponse(result: Extract<ChangeResult, { ok: false }>) {
  return fail(result.message, result.status, result.code, result.details.length > 0 ? result.details : undefined);
}
