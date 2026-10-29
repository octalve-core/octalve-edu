import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { reportQuestionAsPupil, getPupilReportHistory, ReportServiceError } from "@/lib/question-bank/reports-service";
import { PracticeError } from "@/lib/question-bank/practice-service";

const PostBody = z.object({
  bankItemId: z.string().min(1),
  reason: z.string().trim().min(5).max(1000),
});

export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    try {
      const reports = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return getPupilReportHistory(tx, {
          tenantId: auth.tenant.tenantId,
          studentId: student.id,
        });
      });
      return ok({ reports });
    } catch (err) {
      if (err instanceof ReportServiceError) {
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

export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = PostBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid report payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return reportQuestionAsPupil(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: student.campusId,
          userId: auth.userId,
          studentId: student.id,
          itemId: parsed.data.bankItemId,
          reason: parsed.data.reason,
        });
      });
      return ok(result, {}, 201);
    } catch (err) {
      if (err instanceof ReportServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES },
);
