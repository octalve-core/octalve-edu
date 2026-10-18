import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { platformGuard, platformStepUp } from "@/lib/platform/guard";
import { changeLimited, passwordField } from "@/lib/platform/http";
import { openSupport } from "@/lib/support/session";

// POST /api/v1/platform/support/open  { code, password }                                                              (task 0011 slice B, ADR 0017)
// Opens a READ-ONLY support view of the school with this code on THIS sign-in - only if the school's administrator has granted one that is live and open to
// the caller. Needs the password again. One answer (404) for no such school, no live grant, or a suspended school. The reply says what the view allows and
// when it ends (the earlier of the grant's expiry and one hour).
const body = z.strictObject({ code: z.string().trim().min(1).max(40), password: passwordField });

const open = validate({ body }, async (_req, auth: { userId: string; sessionId: string }, _ctx: unknown, { body: input }) => {
  const proof = await platformStepUp(auth, input.password);
  if (proof) return proof;
  const limited = await changeLimited(auth.userId);
  if (limited) return limited;
  const result = await openSupport(auth.userId, auth.sessionId, input.code);
  if (!result.ok) return fail("There is no support access to that school.", 404, "NOT_FOUND");
  return ok({ school: result.school, areas: result.view.areas, endsAt: result.view.endsAt.toISOString() });
});

export const POST = withAuth(async (req, auth, ctx: unknown) => (await platformGuard(auth)) ?? open(req, auth, ctx));
