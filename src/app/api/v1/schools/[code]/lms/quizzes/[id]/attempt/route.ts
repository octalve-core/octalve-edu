import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { studentScope } from "@/lib/auth/campus-scope";
import { isPlausibleId } from "@/lib/academics/http";
import { submitQuizAttemptSchema } from "@/lib/lms/validation";
import { lmsFailure } from "@/lib/lms/http";
import { submitQuizAttempt } from "@/lib/lms/service";
import { z } from "zod";

// `studentId` is for staff recording an attempt on a student's behalf. A student may name only their own record (the service refuses any other).
const attemptBodySchema = submitQuizAttemptSchema.extend({
  studentId: z.string().refine(isPlausibleId, "Not a valid student id.").optional(),
});

// POST /api/v1/schools/[code]/lms/quizzes/[id]/attempt
export const POST = withAuth(
  validate(
    { body: attemptBodySchema },
    async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }, { body }) => {
      const { id } = await ctx.params;
      // A campus administrator acts only for their own campus's students (404 for another campus or an unknown student, 403 for a school-wide one); other roles are judged by the service.
      if (auth.tenant.role === Role.CAMPUS_ADMIN && body.studentId) {
        const outOfScope = await studentScope(auth, body.studentId);
        if (outOfScope) return outOfScope;
      }
      const result = await submitQuizAttempt(auth.tenant.tenantId, id, { userId: auth.userId, role: auth.tenant.role }, body);
      if (!result.ok) return lmsFailure(result.failure, result.detail);
      return ok(result.data, {}, 201);
    },
  ),
  {
    tenant: true,
    roles: [Role.STUDENT, Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
