import type { NextRequest } from "next/server";
import { fail } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { getSessionFromRequest, type ResolvedSession } from "@/lib/auth/session";

// The shared route guard (same name and call shape as AlEemaan's, replacing
// its requireAdmin()). Authorization stays in route handlers, never in
// Next.js middleware — CVE-2025-29927 was a critical middleware-bypass, and
// this design already put every check in handlers; it's now a stated rule
// (docs/auth-review-2026-09-29.md finding 16).

export type AuthContext = ResolvedSession;

/// `roles` / `permissions` are deliberately typed `never` in this repo until
/// §0.5.2 lands. A role only means something *against a specific, verified
/// tenant's membership*; a straight port of AlEemaan's "any ADMIN membership
/// row grants access" would let an ADMIN of School A pass the check on School
/// B's routes — a cross-tenant privilege escalation. So passing either option
/// is a compile error now (and throws at module load if the types are
/// bypassed), rather than silently evaluating against the wrong scope. They
/// arrive with `resolve-tenant.ts`, checked against the resolved tenant.
export type WithAuthOptions = {
  roles?: never;
  permissions?: never;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function withAuth<C = unknown>(
  handler: (req: NextRequest, auth: AuthContext, routeContext: C) => Promise<Response> | Response,
  options: WithAuthOptions = {},
) {
  if ("roles" in options || "permissions" in options) {
    throw new Error(
      "withAuth: `roles`/`permissions` are not available until §0.5.2 (tenant resolution) — " +
        "see domain-implementation-plan.md §0.5.1, divergence #1.",
    );
  }

  return async (req: NextRequest, routeContext: C): Promise<Response> => {
    // CSRF is enforced HERE for every state-changing method, not left as a
    // per-route opt-in call — one forgotten validateCSRF() in one route is a
    // real gap, and every school shares one origin.
    if (!SAFE_METHODS.has(req.method) && !validateCSRF(req)) {
      return fail("Cross-origin request blocked", 403, "CSRF");
    }

    const session = await getSessionFromRequest(req);
    if (!session) {
      return fail("Authentication required", 401, "UNAUTHENTICATED");
    }

    const response = await handler(req, session, routeContext);
    // Responses to an authenticated request are user-specific: never cache.
    try {
      if (!response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", "private, no-store");
      }
    } catch {
      // Immutable headers (e.g. Response.redirect) — handlers should return a NextResponse.
    }
    return response;
  };
}
