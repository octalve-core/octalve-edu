import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listSupportActivity } from "@/lib/support/grants";

// GET /api/v1/schools/[code]/support-grants/activity                                                                  (task 0011 slice D, ADR 0017)
// What platform support did in this school (a view opened, each page or list read, a view closed), newest first. SCHOOL ADMIN only, and - like the rest of
// the support controls - never reachable from a support view itself (no `area`).
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok({ activity: await listSupportActivity(auth.tenant) }), {
  tenant: true,
  roles: [Role.ADMIN],
});
