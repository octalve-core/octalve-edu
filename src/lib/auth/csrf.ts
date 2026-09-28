import { NextRequest } from "next/server";

/// Same-origin check for mutating requests with no CSRF token infrastructure
/// yet (Phase 0.5 hasn't built one) — Origin (or Referer, as a fallback) must
/// match the request's own Host. Rejects outright if both headers are absent.
export function validateCSRF(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return false;
}
