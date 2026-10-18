import { after } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { mailInvitation } from "@/lib/invitations/deliver";
import { platformGuard, platformStepUp } from "@/lib/platform/guard";
import { changeLimited, codeField, emailField, nameField, passwordField, schoolTypeField } from "@/lib/platform/http";
import { createSchool, listSchools } from "@/lib/platform/service";

// /api/v1/platform/schools                                                               (plan C5, ADR 0016)
//   GET   every school: identity data (id, code, name, type, created, suspended) and four coarse counters (members, administrators, students, campuses) - no people
//   POST  create a school and invite its first administrator (one atomic step); needs the password again
// PLATFORM ADMINISTRATORS only, with two-step verification on (lib/platform/guard.ts). Reads no school's data.
const body = z.strictObject({
  code: codeField,
  name: nameField,
  schoolType: schoolTypeField,
  adminEmail: emailField,
  password: passwordField,
});

export const GET = withAuth(async (_req, auth) => {
  const refused = await platformGuard(auth);
  if (refused) return refused;
  return ok({ schools: await listSchools(auth.userId) });
});

const create = validate({ body }, async (_req, auth: { userId: string; user: { name: string | null } }, _ctx: unknown, { body: input }) => {
  const proof = await platformStepUp(auth, input.password);
  if (proof) return proof;
  const limited = await changeLimited(auth.userId);
  if (limited) return limited;
  const result = await createSchool(auth.userId, input);
  if (!result.ok) {
    if (result.reason === "CODE_TAKEN") {
      return fail("That code is already used by another school.", 409, "CODE_TAKEN", [
        { path: "body.code", message: "That code is already used by another school." },
      ]);
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

export const POST = withAuth(async (req, auth, ctx) => (await platformGuard(auth)) ?? create(req, auth, ctx));
