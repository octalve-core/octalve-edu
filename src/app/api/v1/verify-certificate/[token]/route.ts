import type { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { verifyPublicCertificate } from "@/lib/certificates/service";

type Ctx = { params: Promise<{ token: string }> };

const IP_LIMIT = 60; // 60 attempts per 5 minutes per IP (the window in rate-limit.ts)

// GET /api/v1/verify-certificate/[token]
// Unauthenticated public route for external validation of vocational certificates, by the 32-character token the school gives the holder (the
// certificate number is printed on the certificate and identifies it, but it is not a credential). The answer names a student, so it is never cached
// and never indexed: every response, refusals included, says noindex.
export async function GET(req: NextRequest, ctx: Ctx) {
  const response = noStore(await handle(req, ctx));
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

async function handle(req: NextRequest, ctx: Ctx) {
  const ip = getClientIp(req);
  if (!(await reserveAttempt(`verify:cert:ip:${ip}`, IP_LIMIT))) {
    return fail("Too many verification attempts. Please try again in a few minutes.", 429, "RATE_LIMITED");
  }

  const { token } = await ctx.params;
  if (!token || !/^[0-9a-f]{32}$/.test(token)) {
    return fail("Invalid verification token format.", 400, "INVALID_TOKEN");
  }

  const certificate = await verifyPublicCertificate(token);
  if (!certificate) {
    return fail("No valid or issued certificate found for this verification token.", 404, "NOT_FOUND");
  }

  return ok(certificate);
}
