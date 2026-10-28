import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { getResponseForMarking, markFormAnswer, markFormAttempt, ManualMarkingError } from "@/lib/forms/manual-marking-service";

const AnswerMarkingItem = z.object({
  answerId: z.string().min(1),
  score: z.number().min(0),
  feedback: z.string().max(2000).optional().nullable(),
});

const PatchBody = z.object({
  answerId: z.string().optional(),
  score: z.number().min(0).optional(),
  feedback: z.string().max(2000).optional().nullable(),
  answers: z.array(AnswerMarkingItem).optional(),
});

export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string; responseId: string }> }) => {
    const { responseId } = await ctx.params;
    try {
      const response = await auth.tenant.run(async (tx) => {
        return getResponseForMarking(tx, {
          tenantId: auth.tenant.tenantId,
          responseId,
        });
      });
      return ok({ response });
    } catch (err) {
      if (err instanceof ManualMarkingError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES, area: "academics" },
);

export const PATCH = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string; responseId: string }> }) => {
    const { responseId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = PatchBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid marking payload", 400, "VALIDATION");
    }

    try {
      if (parsed.data.answers && parsed.data.answers.length > 0) {
        // Batch attempt marking
        const result = await auth.tenant.run(async (tx) => {
          return markFormAttempt(tx, {
            tenantId: auth.tenant.tenantId,
            responseId,
            teacherUserId: auth.userId,
            answers: parsed.data.answers!,
          });
        });
        return ok(result);
      } else if (parsed.data.answerId && parsed.data.score !== undefined) {
        // Single answer marking
        const result = await auth.tenant.run(async (tx) => {
          return markFormAnswer(tx, {
            tenantId: auth.tenant.tenantId,
            responseId,
            answerId: parsed.data.answerId!,
            teacherUserId: auth.userId,
            score: parsed.data.score!,
            feedback: parsed.data.feedback,
          });
        });
        return ok(result);
      } else {
        return fail("Provide either 'answerId' and 'score', or an array of 'answers'.", 400, "VALIDATION");
      }
    } catch (err) {
      if (err instanceof ManualMarkingError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
