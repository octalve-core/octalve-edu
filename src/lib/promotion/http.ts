import { fail } from "@/lib/api/envelope";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { PromotionError, type Caller } from "./service";

/// Who may promote: the school's administrator, and a campus administrator for their own campus's classes (the service judges which; `campusAdminMayRoll`). Nobody else: a roll moves pupils
/// between classes and sessions, which only an administrator does (ADR 0016).
export const PROMOTION_ROLES = ["ADMIN", "CAMPUS_ADMIN"] as const;

export const callerOf = (auth: TenantAuthContext): Caller => ({
  role: auth.tenant.role,
  campusId: auth.tenant.campusId,
  userId: auth.userId,
});

/// Runs `work` and turns a PromotionError into the standard failure (`PROMOTION_REFUSED`, with the status of the refusal). Anything else is a real error and propagates.
export async function promotionCall(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PromotionError) return fail(error.message, error.status, error.code, error.details);
    throw error;
  }
}
