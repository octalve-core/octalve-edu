import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { submitAssignmentSchema } from "@/lib/lms/validation";
import { submitAssignment } from "@/lib/lms/service";
import { z } from "zod";

const submitBodySchema = submitAssignmentSchema.extend({
  studentId: z.string().optional(),
});

// POST /api/v1/schools/[code]/lms/assignments/[id]/submissions
export const POST = withAuth(
  validate(
    { body: submitBodySchema },
    async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }, { body }) => {
      const { id } = await ctx.params;
      const submission = await submitAssignment(auth.tenant.tenantId, id, auth.userId, body);
      return ok(submission, {}, 201);
    },
  ),
  {
    tenant: true,
    roles: [Role.STUDENT, Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
