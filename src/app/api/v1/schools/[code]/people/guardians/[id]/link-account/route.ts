import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { guardianScope } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { linkAccount } from "@/lib/people/accounts";
import { CAMPUS_WRITE_ROLES, idField, isPlausibleId, notFound, peopleFailure, peopleWriteLimited } from "@/lib/people/http";

// POST /api/v1/schools/[code]/people/guardians/[id]/link-account  { userId } — ADMIN, and a campus administrator for their own campus. Links the record to an active member of THIS school who signs in as a
// parent and has no guardian record yet (task 0065). Answers the account as the record now shows it.
type Ctx = { params: Promise<{ code: string; id: string }> };
const body = z.strictObject({ userId: idField });

export const POST = withAuth(
  validate({ body }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body: input }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("guardian");
    const limited = await peopleWriteLimited(auth);
    if (limited) return limited;
    const scoped = await guardianScope(auth, id);
    if (scoped) return scoped;
    const result = await linkAccount(auth.tenant, auth.userId, "guardian", id, input);
    return result.ok ? ok({ account: result.account }) : peopleFailure(result.reason, result.detail, "guardian");
  }),
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
