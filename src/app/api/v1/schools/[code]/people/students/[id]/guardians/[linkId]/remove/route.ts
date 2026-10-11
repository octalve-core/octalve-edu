import { ok } from "@/lib/api/envelope";
import { studentScope } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { CAMPUS_WRITE_ROLES, isPlausibleId, notFound, peopleFailure, peopleWriteLimited } from "@/lib/people/http";
import { removeLink } from "@/lib/people/guardians";

// POST /api/v1/schools/[code]/people/students/[id]/guardians/[linkId]/remove — ADMIN only. Revokes the link (kept for history). Idempotent: twice answers 200 with changed: false.
type Ctx = { params: Promise<{ code: string; id: string; linkId: string }> };

export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id, linkId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(linkId)) return notFound("guardian");
    const limited = await peopleWriteLimited(auth);
    if (limited) return limited;
    const scoped = await studentScope(auth, id);
    if (scoped) return scoped;
    const result = await removeLink(auth.tenant, auth.userId, id, linkId);
    return result.ok ? ok({ changed: result.changed }) : peopleFailure(result.reason, result.detail, "guardian");
  },
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
