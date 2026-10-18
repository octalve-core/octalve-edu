import { fail } from "@/lib/api/envelope";
import { prisma } from "@/lib/db";
import { hasActiveMfa } from "@/lib/auth/mfa/service";
import { passwordProofFailure, proveOwnPassword } from "@/lib/auth/reauth";

// Who may use the platform surface (plan C5, ADR 0016): a signed-in PLATFORM ADMINISTRATOR who has two-step verification turned on — read from the
// database on every request, never from the session — and, for every CHANGE, the password typed again. None of this is a school role: a school's
// own administrator is refused exactly like anyone else.
//
// The database repeats the first check inside every `platform_*` function (`platform_assert_admin`), so a route that forgot this guard would still
// reach nothing; this adds the two-step requirement and the friendly refusal.

/// `null` = go on; otherwise the refusal. A person who is not a platform administrator gets the same 403 whatever else is true of them.
export async function platformGuard(auth: { userId: string }): Promise<Response | null> {
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { isPlatformAdmin: true } });
  if (!user?.isPlatformAdmin) return fail("You don't have access to this.", 403, "FORBIDDEN");
  if (!(await hasActiveMfa(auth.userId))) {
    return fail("Turn on two-step verification in your account before using the platform pages.", 403, "MFA_REQUIRED");
  }
  return null;
}

/// The step-up for a change: the platform administrator re-types their own password (rate-limited per account, a success refunded; see reauth.ts).
export async function platformStepUp(auth: { userId: string }, password: unknown): Promise<Response | null> {
  const proof = await proveOwnPassword(auth.userId, password);
  return proof === "ok" ? null : passwordProofFailure(proof);
}
