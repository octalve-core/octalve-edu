import { ok } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { platformGuard } from "@/lib/platform/guard";
import { closeSupport } from "@/lib/support/session";

// POST /api/v1/platform/support/close                                                                                 (task 0011 slice B, ADR 0017)
// Ends the support view on this sign-in. Safe to repeat. No password: leaving needs no proof.
export const POST = withAuth(async (_req, auth) => {
  const refused = await platformGuard(auth);
  if (refused) return refused;
  await closeSupport(auth.userId, auth.sessionId);
  return ok({ closed: true });
});
