import { fail } from "@/lib/api/envelope";
import type { StepUpVerificationResult } from "./service";

/// The one answer to a step-up proof that did not pass (PRD section 14, plan 1.3), shared by every route that changes the school's settings: the settings row itself, and
/// the sections and approver scopes of ADR 0018. A proof that passed is `{ ok: true }` and has no failure to show.
export function stepUpFailure(result: Extract<StepUpVerificationResult, { ok: false }>): Response {
  if (result.reason === "RATE_LIMITED") return fail("Too many verification attempts. Please wait a few minutes.", 429, "RATE_LIMITED");
  if (result.reason === "MFA_NOT_ENROLLED") {
    return fail("MFA is not enrolled for this account; please provide password re-authentication.", 400, "MFA_NOT_ENROLLED");
  }
  if (result.reason === "WRONG_PASSWORD") {
    return fail("Incorrect password entered for step-up verification.", 403, "WRONG_PASSWORD", [
      { path: "body.stepUp.value", message: "Incorrect password" },
    ]);
  }
  return fail("Invalid two-factor authentication code entered.", 403, "INVALID_MFA_CODE", [
    { path: "body.stepUp.value", message: "Invalid or expired code" },
  ]);
}
