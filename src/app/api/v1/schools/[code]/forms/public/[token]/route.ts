import type { NextRequest } from "next/server";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { getPublicQuestionnaireByToken } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

/// Reads from one address in a window (the window is in lib/auth/rate-limit.ts): a link is opened a few times by a person, never hundreds of times.
const READ_LIMIT = 120;

// GET /api/v1/schools/[code]/forms/public/[token]
// Unauthenticated: the link is the credential. The school in the address must be the school that owns the survey (otherwise it is "not found", like an unknown link).
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string; token: string }> }) {
  if (!(await reserveAttempt(`forms:public:read:ip:${getClientIp(req)}`, READ_LIMIT))) {
    return noStore(fail("Too many requests. Please try again in a few minutes.", 429, "RATE_LIMITED"));
  }
  const { code, token } = await ctx.params;
  try {
    const questionnaire = await getPublicQuestionnaireByToken(code, token);
    return noStore(ok(questionnaire));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    throw err;
  }
}
