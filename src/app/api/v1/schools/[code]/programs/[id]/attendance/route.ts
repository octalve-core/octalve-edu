import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { getRoll, markRoll } from "@/lib/programs/attendance-service";
import { markRollSchema, rollQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };
const PER_WINDOW = 240;

/** GET .../attendance?groupId=&date=&label= - the roll of one group (and the groups inside it) on one day: who is on it, who is flagged suspended, the marks already made, and what the caller may do (`rights`). Reading never opens a session. */
export const GET = withAuth(
  validate({ query: rollQuery }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await getRoll(auth, id, query));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);

/** PUT .../attendance { groupId, date, label?, reason?, marks: [{ participantId, status, remarks?, version? }] } - saves the roll: every mark or none. A teacher or a recorder: their groups, today and the 6 days before; the school's administrator or a program admin: any group, any past day; a supervisor: corrects existing marks, with a reason. */
export const PUT = withAuth(
  validate({ body: markRollSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    if (!(await reserveAttempt(`attendance:${auth.tenant.tenantId}:${auth.userId}`, PER_WINDOW)))
      return fail("Too many saves. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return respond(await markRoll(auth, id, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
