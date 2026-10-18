import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { getStudentTranscript } from "@/lib/higher-ed/service";

// GET /api/v1/schools/[code]/higher-ed/transcript/[studentId]
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; studentId: string }> }) => {
    const { studentId } = await ctx.params;

    // Student can only view their own transcript
    if (auth.tenant.role === Role.STUDENT && auth.userId !== studentId) {
      return fail("You can only view your own academic transcript.", 403, "FORBIDDEN");
    }

    try {
      const transcript = await getStudentTranscript(auth.tenant.tenantId, studentId);
      return ok({ transcript });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load transcript";
      return fail(message, 400, "BAD_REQUEST");
    }
  },
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT],
  },
);
