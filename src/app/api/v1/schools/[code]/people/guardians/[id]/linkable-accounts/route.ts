import { ok } from "@/lib/api/envelope";
import { guardianScope } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { linkableAccounts } from "@/lib/people/accounts";
import { CAMPUS_WRITE_ROLES, isPlausibleId, notFound, peopleFailure } from "@/lib/people/http";

// GET /api/v1/schools/[code]/people/guardians/[id]/linkable-accounts — ADMIN, and a campus administrator for their own campus. The active members of THIS school who sign in as a parent and are not linked to
// a guardian record yet (at most 200; a campus administrator: their own campus's): the choices for "Link account" (task 0065).
type Ctx = { params: Promise<{ code: string; id: string }> };

export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("guardian");
    const scoped = await guardianScope(auth, id);
    if (scoped) return scoped;
    const result = await linkableAccounts(auth.tenant, "guardian", id);
    return result.ok ? ok({ accounts: result.accounts }) : peopleFailure(result.reason, result.detail, "guardian");
  },
  { tenant: true, area: "people", roles: CAMPUS_WRITE_ROLES },
);
