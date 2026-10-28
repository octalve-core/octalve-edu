import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { startPracticeSession, PracticeError } from "@/lib/question-bank/practice-service";
import { PracticeFeedbackMode } from "@prisma/client";

const Body = z.object({
  subjectLabel: z.string().optional(),
  topic: z.string().optional(),
  size: z.number().int().min(1).max(50).optional(),
  feedbackMode: z.enum(["EACH", "END"]).optional(),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    const parsed = Body.safeParse(read.ok ? read.json : {});

    try {
      const result = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return startPracticeSession(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: student.campusId,
          studentId: student.id,
          role: auth.tenant.role,
          subjectLabel: parsed.success ? parsed.data.subjectLabel : undefined,
          topic: parsed.success ? parsed.data.topic : undefined,
          size: parsed.success ? parsed.data.size : undefined,
          feedbackMode: parsed.success ? (parsed.data.feedbackMode as PracticeFeedbackMode) : undefined,
        });
      });
      return ok(result, {}, 201);
    } catch (err) {
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES },
);
