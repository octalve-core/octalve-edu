import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { getPracticeOptions, PracticeError } from "@/lib/question-bank/practice-service";

export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    try {
      const options = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return getPracticeOptions(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: student.campusId,
          studentId: student.id,
          role: auth.tenant.role,
        });
      });
      return ok(options);
    } catch (err) {
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES, area: "academics" },
);
