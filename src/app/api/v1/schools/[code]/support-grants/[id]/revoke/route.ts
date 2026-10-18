import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId } from "@/lib/members/http";
import { revokeGrant } from "@/lib/support/grants";

// POST /api/v1/schools/[code]/support-grants/[id]/revoke                                       (task 0011 slice A, ADR 0017)
// Ends a grant at once. No step-up: revoking only ever reduces access. SCHOOL ADMIN only; audited. An unknown or already-revoked grant is 404.
type Ctx = { params: Promise<{ code: string; id: string }> };
export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    const grant = isPlausibleId(id) ? await revokeGrant(auth.tenant, auth.userId, id) : null;
    return grant ? ok({ grant }) : fail("No such open support grant.", 404, "NOT_FOUND");
  },
  { tenant: true, roles: [Role.ADMIN] },
);
