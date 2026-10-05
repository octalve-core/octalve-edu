import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { getClientIp, refundAttempt, reserveAttempt } from "@/lib/auth/rate-limit";
import { appEnv, devToolsAccess } from "@/lib/dev-tools";
import { clearDevEmails, getDevEmails } from "@/lib/dev/email-inbox";

// GET / DELETE /api/v1/dev/email-inbox   (domain-implementation-plan.md §0.5.F)
// What the in-app dev inbox widget reads. Where the dev tools are off — always, in production — it answers a
// plain 404. On a staging deployment (reachable by other people, and holding reset links and recovery-code
// notices) it also needs the shared DEV_TOOLS_TOKEN, compared in constant time and rate-limited per IP, so a
// stranger who finds the URL gets nothing. On your own machine (development) it is open.
const TOKEN_HEADER = "x-dev-tools-token";
const TOKEN_FAILURE_LIMIT = 5; // wrong tokens per IP per 5 minutes; a correct one is refunded

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest();
/// Equal-length digests, so the comparison neither throws nor leaks the token's length or a matching prefix.
const sameToken = (given: string, expected: string) => crypto.timingSafeEqual(sha256(given), sha256(expected));

/// null = the caller may proceed; otherwise the refusal to send.
async function gate(req: NextRequest): Promise<NextResponse | null> {
  const access = devToolsAccess();
  if (access.kind === "off") return fail("Not found", 404, "NOT_FOUND");
  if (access.kind === "open") return null; // development: your own machine

  const required = access.token;
  const given = req.headers.get(TOKEN_HEADER) ?? "";
  if (!given) return fail("The dev tools token is required.", 401, "TOKEN_REQUIRED"); // not a guess: costs nothing
  const key = `dev-inbox:ip:${getClientIp(req)}`;
  if (!(await reserveAttempt(key, TOKEN_FAILURE_LIMIT))) {
    return fail("Too many wrong tokens. Please try again in a few minutes.", 429, "RATE_LIMITED");
  }
  if (!sameToken(given, required)) return fail("The dev tools token is wrong.", 401, "TOKEN_REQUIRED");
  await refundAttempt(key);
  return null;
}

export async function GET(req: NextRequest) {
  const refused = await gate(req);
  if (refused) return noStore(refused);
  return noStore(ok({ emails: getDevEmails(), mode: appEnv() }));
}

export async function DELETE(req: NextRequest) {
  if (devToolsAccess().kind !== "off" && !validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const refused = await gate(req);
  if (refused) return noStore(refused);
  clearDevEmails();
  return noStore(ok({ cleared: true }));
}
