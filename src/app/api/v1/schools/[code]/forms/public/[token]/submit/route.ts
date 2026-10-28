import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { submitPublicQuestionnaire } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

const SubmitBody = z.object({
  answers: z.array(
    z.object({
      formQuestionId: z.string().min(1),
      value: z.unknown(),
    }),
  ),
});

export async function POST(req: Request, ctx: { params: Promise<{ code: string; token: string }> }) {
  const { token } = await ctx.params;
  const read = await readJsonBody(req as never);
  if (!read.ok) return read.response;

  const parsed = SubmitBody.safeParse(read.json);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message || "Invalid answers payload", 400, "VALIDATION");
  }

  try {
    const result = await submitPublicQuestionnaire({
      token,
      answers: parsed.data.answers,
    });
    return ok(result);
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return fail(err.message, err.statusCode, err.code);
    }
    throw err;
  }
}
