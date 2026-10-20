import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { getQuiz } from "@/lib/lms/service";

// GET /api/v1/schools/[code]/lms/quizzes/[id]
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id } = await ctx.params;
    try {
      // what the caller may see depends on their role: a draft and the answer key are for staff (the service decides)
      const quiz = await getQuiz(auth.tenant.tenantId, id, { userId: auth.userId, role: auth.tenant.role });
      return ok(quiz);
    } catch {
      return fail("Quiz not found", 404, "NOT_FOUND");
    }
  },
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT],
  },
);
