import { NextResponse, type NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { wantsPage } from "@/lib/api/wants-page";
import { getClientIp, reserveAttempt } from "@/lib/auth/rate-limit";
import { verifyPublicCertificate } from "@/lib/certificates/service";
import { verifyProgramCertificate } from "@/lib/programs/certificate-verify";
import { VERIFY_CODE } from "@/lib/results/verify-code";

type Ctx = { params: Promise<{ token: string }> };

const IP_LIMIT = 60; // 60 attempts per 5 minutes per IP (the window in rate-limit.ts)

// GET /api/v1/verify-certificate/[token]
// Unauthenticated public route for external validation of vocational certificates, by the 32-character token the school gives the holder (the
// certificate number is printed on the certificate and identifies it, but it is not a credential). The answer names a student, so it is never cached
// and never indexed: every response, refusals included, says noindex.
// A browser that opens this address (the QR code of a certificate printed before task 0043 carries it) is sent to the page that answers in words, `/verify/[token]`; everything else gets the JSON.
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
  if (!(await reserveAttempt(`verify:cert:ip:${ip}`, IP_LIMIT))) {
    return fail("Too many verification attempts. Please try again in a few minutes.", 429, "RATE_LIMITED");
  }

  if (!token || !VERIFY_CODE.test(token)) {
    return fail("Invalid verification token format.", 400, "INVALID_TOKEN");
  }

  // The school's vocational certificates first, then the certificates of completion of a program (the code alone tells them apart).
  const certificate = (await verifyPublicCertificate(token)) ?? (await verifyProgramCertificate(token));
  if (!certificate) {
    return fail("No valid or issued certificate found for this verification token.", 404, "NOT_FOUND");
  }

  return ok(certificate);
}
