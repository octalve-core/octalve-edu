import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { gradeSubmissionSchema } from "@/lib/lms/validation";
import { gradeSubmission } from "@/lib/lms/service";

// PATCH /api/v1/schools/[code]/lms/assignments/[id]/submissions/[submissionId]/grade
export const PATCH = withAuth(
  validate(
    { body: gradeSubmissionSchema },
    async (
      _req,
      auth: TenantAuthContext,
      ctx: { params: Promise<{ code: string; id: string; submissionId: string }> },
      { body },
    ) => {
      const { submissionId } = await ctx.params;
      const graded = await gradeSubmission(auth.tenant.tenantId, submissionId, auth.userId, body);
      return ok(graded);
    },
  ),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
