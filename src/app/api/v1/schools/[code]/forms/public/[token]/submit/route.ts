import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { submitPublicQuestionnaire } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

/// Answers from one address in a window (lib/auth/rate-limit.ts). Every attempt counts, a good one too: a class answering from one school connection fits, a script does not.
const SUBMIT_LIMIT = 60;

const SubmitBody = z.object({
  answers: z.array(
    z.object({
      formQuestionId: z.string().min(1),
      value: z.unknown(),
    }),
  ),
});

// POST /api/v1/schools/[code]/forms/public/[token]/submit
// Unauthenticated: the link is the credential. The answer is stored under the school that owns the survey, with no respondent.
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string; token: string }> }) {
  if (!(await reserveAttempt(`forms:public:submit:ip:${getClientIp(req)}`, SUBMIT_LIMIT))) {
    return noStore(fail("Too many requests. Please try again in a few minutes.", 429, "RATE_LIMITED"));
  }
  const { code, token } = await ctx.params;
  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);

  const parsed = SubmitBody.safeParse(read.json);
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message || "Invalid answers payload", 400, "VALIDATION"));
  }

  try {
    const result = await submitPublicQuestionnaire({ code, token, answers: parsed.data.answers });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    throw err;
  }
}
