import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { isPlausibleId } from "@/lib/members/http";
import { platformGuard, platformStepUp } from "@/lib/platform/guard";
import { changeLimited, noSuchSchool, passwordField } from "@/lib/platform/http";
import { setSchoolSuspended } from "@/lib/platform/service";

// POST /api/v1/platform/schools/[id]/suspension  { suspended, reason?, password }          (plan C5, ADR 0016)
// Suspends (a typed reason is REQUIRED) or reinstates a school. A suspended school's members get the same refusal as a stranger when they use it, and
// it drops out of their list of schools; nobody's membership is touched, so reinstating gives everything back. Idempotent (doing it twice writes one
// audit row). Audited in the platform's own log. Needs the password again.
type Ctx = { params: Promise<{ id: string }> };
const body = z
  .strictObject({
    suspended: z.boolean({ error: "Say whether to suspend or reinstate." }),
    reason: z.string().trim().max(500).optional(),
    password: passwordField,
  })
  .refine((value) => !value.suspended || Boolean(value.reason), { message: "Give a reason for suspending the school.", path: ["reason"] });

const change = validate({ body }, async (_req, auth: { userId: string }, ctx: Ctx, { body: input }) => {
  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return noSuchSchool();
  const proof = await platformStepUp(auth, input.password);
  if (proof) return proof;
  const limited = await changeLimited(auth.userId);
  if (limited) return limited;
  const result = await setSchoolSuspended(auth.userId, id, input.suspended, input.reason ?? null);
  if (result.ok) return ok({ school: result.school, changed: result.changed });
  if (result.reason === "NOT_FOUND") return noSuchSchool();
  return fail("That can't be done.", 400, "VALIDATION");
});

export const POST = withAuth(async (req, auth, ctx: Ctx) => (await platformGuard(auth)) ?? change(req, auth, ctx));
