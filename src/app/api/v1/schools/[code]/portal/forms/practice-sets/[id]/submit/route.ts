import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { submitPracticeSetForPupil, FormsServiceError } from "@/lib/forms/forms-service";
import { PracticeError } from "@/lib/question-bank/practice-service";

const SubmitBody = z.object({
  responseId: z.string().min(1),
  answers: z.array(
    z.object({
      formQuestionId: z.string().min(1),
      value: z.unknown(),
    }),
  ),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = SubmitBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid submission payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return submitPracticeSetForPupil(tx, {
          formId,
          responseId: parsed.data.responseId,
          studentId: student.id,
          tenantId: auth.tenant.tenantId,
          answers: parsed.data.answers,
        });
      });
      return ok(result);
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
  { tenant: true, roles: PORTAL_STUDENT_ROLES },
);
