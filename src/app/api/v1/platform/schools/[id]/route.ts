import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { isPlausibleId } from "@/lib/members/http";
import { platformGuard, platformStepUp } from "@/lib/platform/guard";
import { changeLimited, hasPeriods, noSuchSchool, passwordField, schoolTypeField } from "@/lib/platform/http";
import { setSchoolType } from "@/lib/platform/service";
import { fail } from "@/lib/api/envelope";

// PATCH /api/v1/platform/schools/[id]  { schoolType, password }                              (plan C5/C6, ADR 0010, ADR 0016)
// Changes a school's type - the ONLY way it changes after creation. Refused (409 HAS_PERIODS) once the school has any academic period, so a school that
// already runs terms is never stranded on another kind. Audited in the platform's own log. Needs the password again.
type Ctx = { params: Promise<{ id: string }> };
const body = z.strictObject({ schoolType: schoolTypeField, password: passwordField });

const change = validate({ body }, async (_req, auth: { userId: string }, ctx: Ctx, { body: input }) => {
  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return noSuchSchool();
  const proof = await platformStepUp(auth, input.password);
  if (proof) return proof;
  const limited = await changeLimited(auth.userId);
  if (limited) return limited;
  const result = await setSchoolType(auth.userId, id, input.schoolType);
  if (result.ok) return ok({ school: result.school, changed: result.changed });
  if (result.reason === "NOT_FOUND") return noSuchSchool();
  if (result.reason === "HAS_PERIODS") return hasPeriods();
  return fail("That can't be done.", 400, "VALIDATION");
});

export const PATCH = withAuth(async (req, auth, ctx: Ctx) => (await platformGuard(auth)) ?? change(req, auth, ctx));
