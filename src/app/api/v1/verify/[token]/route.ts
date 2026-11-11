import { NextResponse, type NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { wantsPage } from "@/lib/api/wants-page";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { verifyPublicCredential } from "@/lib/results/service";
import { VERIFY_CODE } from "@/lib/results/verify-code";

type Ctx = { params: Promise<{ token: string }> };

const IP_LIMIT = 60; // 60 attempts per 5 minutes per IP (the window in rate-limit.ts)

// GET /api/v1/verify/[token]
// Unauthenticated public route for external validation of report cards.
// The answer names a student, so it is never cached and never indexed (ISS-0008): every response, refusals included, says noindex.
// A browser that opens this address (an older printed card carries it) is sent to the page that answers in words, `/verify/[token]` (task 0043); everything else gets the JSON.
export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const response = noStore(
    wantsPage(req.headers.get("accept")) && VERIFY_CODE.test(token ?? "") ? sendToPage(token) : await handle(req, token),
  );
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Vary", "Accept");
  return response;
}

/// A relative `Location`: the address the browser asked for is the one it keeps, whatever host or port sits in front of this server. Costs no attempt (the page makes its own lookups).
function sendToPage(token: string) {
  return new NextResponse(null, { status: 307, headers: { Location: `/verify/${token}` } });
}

async function handle(req: NextRequest, token: string | undefined) {
  const ip = getClientIp(req);
  if (!(await reserveAttempt(`verify:token:ip:${ip}`, IP_LIMIT))) {
    return fail("Too many verification attempts. Please try again in a few minutes.", 429, "RATE_LIMITED");
  }

  if (!token || !VERIFY_CODE.test(token)) {
    return fail("Invalid verification token format.", 400, "INVALID_TOKEN");
  }

  const credential = await verifyPublicCredential(token);
  if (!credential) {
    return fail(
      "No published academic credential found for this verification token. Ensure the credential has been published by the institution.",
      404,
      "NOT_FOUND",
    );
  }

  return ok(credential);
}
