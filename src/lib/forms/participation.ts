import crypto from "node:crypto";
import { deriveKey } from "@/lib/auth/mfa/secret-box";

// What an anonymous questionnaire keeps of the person who answered it.
//
// A participation record exists to stop a second answer, so it must recognise the same pupil again; an ANONYMOUS questionnaire promises that nobody can tell which pupil gave which
// answer, so the record must not hold the pupil. Both hold when the record keeps a CODE: the same pupil in the same survey always gives the same code, a different survey gives a
// different one (the codes of one pupil in two surveys cannot be matched), and the code cannot be turned back into the pupil without the school's key, which lives in the environment and
// never in the database. A questionnaire that is NOT anonymous keeps the pupil's own id: the school asked to know who answered.
//
// The other half is TIME. Participation, response and answers used to carry the same instant, so a code (or an id) could be joined to its response by that instant. An anonymous
// questionnaire records the DAY only (`dayOnly`), on all three.

/// The code that stands for `memberId` in the participation records of `form`: the member's own id when the form is not anonymous. Throws `MfaUnavailableError` when the school's key
/// is not set (an anonymous questionnaire then cannot be answered: failing closed beats storing an identity).
export function participationCode(form: { id: string; isAnonymous: boolean }, memberId: string): string {
  if (!form.isAnonymous) return memberId;
  const key = deriveKey("questionnaire-participation/v1");
  return crypto.createHmac("sha256", key).update(`${form.id}\u0000${memberId}`).digest("hex");
}

/// Midnight UTC of the day `when` falls on.
export const dayOnly = (when: Date): Date => new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));

/// The time to record for an answer: the day only on an anonymous questionnaire, the moment otherwise.
export const recordedAt = (form: { isAnonymous: boolean }, when: Date): Date => (form.isAnonymous ? dayOnly(when) : when);
