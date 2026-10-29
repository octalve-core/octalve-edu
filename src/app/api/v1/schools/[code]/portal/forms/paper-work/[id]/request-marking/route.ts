import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { requestMarkingForPupil, PaperWorkError } from "@/lib/forms/paper-work-service";
import { PracticeError } from "@/lib/question-bank/practice-service";

const Body = z.object({
  note: z.string().max(500).optional().nullable(),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const parsed = Body.safeParse(read.json);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 400, "VALIDATION");

    try {
      const result = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return requestMarkingForPupil(tx, auth.tenant.tenantId, formId, student.id, parsed.data.note);
      });
      return ok(result);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES },
);
