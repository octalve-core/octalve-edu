import { ok } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { getUserMemberships } from "@/lib/auth/memberships";

/**
 * GET /api/v1/auth/me
 * Who is signed in, and which schools they belong to. The standard
 * session-introspection call for any client (web, later mobile), and the
 * first route to use withAuth.
 */
export const GET = withAuth(async (_req, auth) => {
  const memberships = await getUserMemberships(auth.userId);
  return ok({ user: auth.user, memberships });
});
