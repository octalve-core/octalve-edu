import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { studentScope } from "@/lib/auth/campus-scope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { CAMPUS_WRITE_ROLES, isPlausibleId, notFound } from "@/lib/people/http";
import { respond, toAction } from "@/lib/standing/http";
import { changeStudentStanding, studentStandingHistory } from "@/lib/standing/student-service";
import { studentStandingSchema } from "@/lib/standing/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };
const PER_WINDOW = 60;

/** GET /api/v1/schools/[code]/people/students/[id]/standing - the pupil's standing and its history (newest first). The school's administrator, or the administrator of the pupil's own campus; any other answers 404. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("student");
    const scoped = await studentScope(auth, id);
    if (scoped) return scoped;
    return respond(await studentStandingHistory(auth.tenant, id));
  },
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);

/**
 * POST /api/v1/schools/[code]/people/students/[id]/standing { action: "suspend" | "lift" | "expel" | "reinstate", reason, until? }
 * Suspend and lift: the school's administrator, or the administrator of the pupil's own campus while the school allows it. Expel and reinstate: the school's administrator. A reason
 * is required and kept in an append-only history. `until` (suspend only) is the last day of the suspension; with none it lasts until someone lifts it.
 */
export const POST = withAuth(
  validate({ body: studentStandingSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("student");
    if (!(await reserveAttempt(`standing:${auth.tenant.tenantId}:${auth.userId}`, PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const scoped = await studentScope(auth, id);
    if (scoped) return scoped;
    return respond(
      await changeStudentStanding(auth.tenant, auth.userId, id, toAction(body.action) as "SUSPEND" | "LIFT" | "EXPEL" | "REINSTATE", {
        reason: body.reason,
        until: body.until ?? null,
      }),
    );
  }),
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
