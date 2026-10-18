import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { studentScope } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { CAMPUS_WRITE_ROLES, idField, isPlausibleId, notFound, peopleFailure, peopleWriteLimited } from "@/lib/people/http";
import { moveEnrolment } from "@/lib/people/students";

// PATCH /api/v1/schools/[code]/people/students/[id]/enrolments/[enrolmentId]  { classArmId } — ADMIN only. Moves an ACTIVE enrolment to another class in the same session.
type Ctx = { params: Promise<{ code: string; id: string; enrolmentId: string }> };
const body = z.strictObject({ classArmId: idField });

export const PATCH = withAuth(
  validate({ body }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body: input }) => {
    const { id, enrolmentId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(enrolmentId)) return notFound("enrolment");
    const limited = await peopleWriteLimited(auth);
    if (limited) return limited;
    const scoped = await studentScope(auth, id);
    if (scoped) return scoped;
    const result = await moveEnrolment(auth.tenant, auth.userId, id, enrolmentId, input);
    return result.ok
      ? ok({ enrolment: result.enrolment, changed: result.changed })
      : peopleFailure(result.reason, result.detail, "enrolment");
  }),
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
