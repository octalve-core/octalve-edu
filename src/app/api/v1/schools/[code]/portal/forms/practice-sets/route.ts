import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { listAvailablePracticeSetsForPupil, FormsServiceError } from "@/lib/forms/forms-service";
import { PracticeError } from "@/lib/question-bank/practice-service";

export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    try {
      const sets = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return listAvailablePracticeSetsForPupil(tx, {
          studentId: student.id,
          tenantId: auth.tenant.tenantId,
        });
      });
      return ok({ practiceSets: sets });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES, area: "academics" },
);
