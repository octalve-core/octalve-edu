import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { staffScope } from "@/lib/auth/campus-scope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { CAMPUS_WRITE_ROLES, isPlausibleId, notFound } from "@/lib/people/http";
import { respond, toAction } from "@/lib/standing/http";
import { changeStaffStanding, staffStandingHistory } from "@/lib/standing/staff-service";
import { staffStandingSchema } from "@/lib/standing/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };
const PER_WINDOW = 60;

/** GET /api/v1/schools/[code]/people/staff/[id]/standing - the staff record's standing and its history (newest first). The school's administrator, or the administrator of the record's own campus; any other answers 404. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("staff record");
    const scoped = await staffScope(auth, id);
    if (scoped) return scoped;
    return respond(await staffStandingHistory(auth.tenant, { staffRecordId: id }));
  },
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);

/**
 * POST /api/v1/schools/[code]/people/staff/[id]/standing { action: "suspend" | "lift" | "terminate" | "reinstate", reason, until? }
 * Suspend and lift: the school's administrator, or the administrator of the record's own campus while the school allows it (never for an administrator). Terminate and reinstate: the
 * school's administrator. Nobody changes their own, and the school's last administrator is protected. A reason is required and kept in an append-only history.
 */
export const POST = withAuth(
  validate({ body: staffStandingSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("staff record");
    if (!(await reserveAttempt(`standing:${auth.tenant.tenantId}:${auth.userId}`, PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const scoped = await staffScope(auth, id);
    if (scoped) return scoped;
    return respond(
      await changeStaffStanding(
        auth.tenant,
        auth.userId,
        { staffRecordId: id },
        toAction(body.action) as "SUSPEND" | "LIFT" | "TERMINATE" | "REINSTATE",
        {
          reason: body.reason,
          until: body.until ?? null,
        },
      ),
    );
  }),
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
