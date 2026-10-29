import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listApprovers } from "@/lib/results/approver-settings";

// GET /api/v1/schools/[code]/settings/approvers — ADMIN only (ADR 0018). Everyone who holds the permission to approve results and is an active member, with where each one
// approves (General, sections, classes). A holder with no scope has an empty list: they approve nothing. The settings area of a support view may read it.
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok(await listApprovers(auth.tenant)), {
  tenant: true,
  area: "settings",
  roles: [Role.ADMIN],
});
