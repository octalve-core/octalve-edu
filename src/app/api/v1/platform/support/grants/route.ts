import { ok } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { platformGuard } from "@/lib/platform/guard";
import { listOpenableSchools } from "@/lib/support/session";

// GET /api/v1/platform/support/grants                                                                                 (task 0011 slice B, ADR 0017)
// The schools this platform administrator may open a support view of right now: school code and name, the areas, and when the grant ends. No reason
// text, no people.
export const GET = withAuth(async (_req, auth) => {
  const refused = await platformGuard(auth);
  if (refused) return refused;
  return ok({ grants: await listOpenableSchools(auth.userId) });
});
