import { fail, ok } from "@/lib/api/envelope";
import { getPublicQuestionnaireByToken } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string; token: string }> }) {
  const { token } = await ctx.params;
  try {
    const questionnaire = await getPublicQuestionnaireByToken(token);
    return ok(questionnaire);
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return fail(err.message, err.statusCode, err.code);
    }
    throw err;
  }
}
