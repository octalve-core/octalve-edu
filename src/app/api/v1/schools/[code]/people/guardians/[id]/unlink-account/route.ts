import { ok } from "@/lib/api/envelope";
import { guardianScope } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { unlinkAccount } from "@/lib/people/accounts";
import { CAMPUS_WRITE_ROLES, isPlausibleId, notFound, peopleFailure, peopleWriteLimited } from "@/lib/people/http";

// POST /api/v1/schools/[code]/people/guardians/[id]/unlink-account — ADMIN, and a campus administrator for their own campus. Clears the link; the account and its membership are untouched (that is the Users
// page's). A record with no account answers 409 NOT_LINKED (task 0065).
type Ctx = { params: Promise<{ code: string; id: string }> };

export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("guardian");
    const limited = await peopleWriteLimited(auth);
    if (limited) return limited;
    const scoped = await guardianScope(auth, id);
    if (scoped) return scoped;
    const result = await unlinkAccount(auth.tenant, auth.userId, "guardian", id);
    return result.ok ? ok({ account: result.account }) : peopleFailure(result.reason, result.detail, "guardian");
  },
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
