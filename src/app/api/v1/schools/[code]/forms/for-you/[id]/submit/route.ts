import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FOR_YOU_ROLES } from "@/lib/question-bank/items-http";
import { submitQuestionnaireForMember } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

const SubmitBody = z.object({
  answers: z.array(
    z.object({
      formQuestionId: z.string().min(1),
      value: z.unknown(),
    }),
  ),
});

// A member of staff or a guardian answers a questionnaire addressed to them, once (a participation code under the unique index; on an anonymous questionnaire the code cannot be turned
// back into the person).
export const POST = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = SubmitBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid answers payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) =>
        submitQuestionnaireForMember(tx, {
          formId,
          memberId: auth.userId,
          isStudent: false,
          memberRole: auth.tenant.role,
          campusId: auth.tenant.campusId,
          tenantId: auth.tenant.tenantId,
          answers: parsed.data.answers,
        }),
      );
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) return fail(err.message, err.statusCode, err.code);
      throw err;
    }
  },
  { tenant: true, roles: FOR_YOU_ROLES },
);
