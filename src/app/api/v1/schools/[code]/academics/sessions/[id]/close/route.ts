import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PASSWORD_MAX_LENGTH } from "@/lib/auth/password";
import { passwordProofFailure, proveOwnPassword } from "@/lib/auth/reauth";
import { CAMPUS_WRITE_ROLES, academicFailure, isPlausibleId, notFound, writeLimited } from "@/lib/academics/http";
import { sessionScope } from "@/lib/auth/campus-scope";
import { closeSession } from "@/lib/academics/sessions";

// POST /api/v1/schools/[code]/academics/sessions/[id]/close  { password? } — ADMIN only, audited in the same transaction.
// Closing is SCHEDULED, not instant (plan, "closing a session takes time"): without a password the session closes a day from now; with the
// administrator's own password it closes a minute from now. Until then it is fully active and the close can be cancelled (…/close/cancel).
type Ctx = { params: Promise<{ code: string; id: string }> };
const body = z.strictObject({ password: z.string().max(PASSWORD_MAX_LENGTH).optional() });

export const POST = withAuth(
  validate({ body }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body: input }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("session");
    const limited = await writeLimited(auth);
    if (limited) return limited;
    const outOfScope = await sessionScope(auth, id);
    if (outOfScope) return outOfScope;
    const force = input.password !== undefined;
    if (force) {
      const proof = await proveOwnPassword(auth.userId, input.password);
      if (proof !== "ok") return passwordProofFailure(proof);
    }
    const result = await closeSession(auth.tenant, auth.userId, id, { force });
    return result.ok ? ok({ session: result.session, changed: result.changed }) : academicFailure(result.reason, result.detail);
  }),
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
