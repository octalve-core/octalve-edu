import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { submitQuizAttemptSchema } from "@/lib/lms/validation";
import { submitQuizAttempt } from "@/lib/lms/service";
import { z } from "zod";

const attemptBodySchema = submitQuizAttemptSchema.extend({
  studentId: z.string().optional(),
});

// POST /api/v1/schools/[code]/lms/quizzes/[id]/attempt
export const POST = withAuth(
  validate({ body: attemptBodySchema }, async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }, { body }) => {
    const { id } = await ctx.params;
    const attempt = await submitQuizAttempt(auth.tenant.tenantId, id, auth.userId, body);
    return ok(attempt, {}, 201);
  }),
  {
    tenant: true,
    roles: [Role.STUDENT, Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
