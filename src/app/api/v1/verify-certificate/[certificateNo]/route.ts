import type { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { verifyPublicCertificate } from "@/lib/certificates/service";

type Ctx = { params: Promise<{ certificateNo: string }> };

const IP_LIMIT = 60; // 60 attempts per 10 minutes per IP

// GET /api/v1/verify-certificate/[certificateNo]
// Unauthenticated public route for external validation of vocational certificates.
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

  const { certificateNo } = await ctx.params;
  if (!certificateNo || certificateNo.length < 5) {
    return fail("Invalid certificate number format.", 400, "INVALID_CERTIFICATE_NUMBER");
  }

  const certificate = await verifyPublicCertificate(certificateNo);
  if (!certificate) {
    return fail("No valid or issued certificate found for this certificate number.", 404, "NOT_FOUND");
  }

  return ok(certificate);
}
