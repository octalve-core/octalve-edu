import { after } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { mailInvitation } from "@/lib/invitations/deliver";
import { isPlausibleId } from "@/lib/members/http";
import { platformGuard, platformStepUp } from "@/lib/platform/guard";
import { changeLimited, emailField, noSuchSchool, passwordField } from "@/lib/platform/http";
import { reinviteFirstAdministrator } from "@/lib/platform/service";

// POST /api/v1/platform/schools/[id]/first-admin-invitation  { email, password }                          (task 0010 F2, ISS-0015, ADR 0016)
// Sends a school's first administrator a NEW invitation - ONLY for a school that has no active administrator (the database checks, inside the school,
// and the answer for a school that has one is 409 HAS_ADMINISTRATOR). Every open ADMIN invitation of the school is revoked and one new one written
// (7 days, mailed); both the platform's log and the school's own log record it. Needs the password again. The platform administrator gains no access to
// the school: whoever opens the link becomes its administrator.
type Ctx = { params: Promise<{ id: string }> };
const body = z.strictObject({ email: emailField, password: passwordField });

const send = validate({ body }, async (_req, auth: { userId: string; user: { name: string | null } }, ctx: Ctx, { body: input }) => {
  const { id } = await ctx.params;
  if (!isPlausibleId(id)) return noSuchSchool();
  const proof = await platformStepUp(auth, input.password);
  if (proof) return proof;
  const limited = await changeLimited(auth.userId);
  if (limited) return limited;
  const result = await reinviteFirstAdministrator(auth.userId, id, input.email);
  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return noSuchSchool();
    if (result.reason === "HAS_ADMINISTRATOR") {
      return fail("This school already has an administrator. They can invite others from the Users page.", 409, "HAS_ADMINISTRATOR");
    }
    return fail("That can't be done.", 400, "VALIDATION");
  }
  after(() =>
    mailInvitation({
      to: result.invitation.email,
      token: result.invitation.token,
      schoolName: result.school.name,
      role: "ADMIN",
      inviterName: auth.user.name,
    }),
  );
  return ok({ school: result.school, invitation: { id: result.invitation.id, email: result.invitation.email } }, {}, 201);
});

export const POST = withAuth(async (req, auth, ctx: Ctx) => (await platformGuard(auth)) ?? send(req, auth, ctx));
