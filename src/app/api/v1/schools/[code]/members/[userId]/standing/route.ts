import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/members/http";
import { respond, toAction } from "@/lib/standing/http";
import { changeStaffStanding, staffStandingHistory } from "@/lib/standing/staff-service";
import { staffStandingSchema } from "@/lib/standing/validation";

type Ctx = { params: Promise<{ code: string; userId: string }> };
const PER_WINDOW = 60;

// The standing of a member by their account (the Users page), the same service as the staff record's route: a person with a sign-in and no staff record is reached here. A campus
// administrator reaches the members of their own campus only; the service answers 404 for any other, so the campus check is in the service (`outOfReach` in lib/standing/staff-service.ts).

/** GET /api/v1/schools/[code]/members/[userId]/standing - the member's standing and its history (newest first). */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { userId } = await ctx.params;
    if (!isPlausibleId(userId)) return notFound("member");
    return respond(await staffStandingHistory(auth.tenant, { memberUserId: userId }));
  },
  { tenant: true, roles: ["ADMIN", "CAMPUS_ADMIN"] },
);

/** POST /api/v1/schools/[code]/members/[userId]/standing { action: "suspend" | "lift" | "terminate" | "reinstate", reason, until? } - as the staff record's route. */
export const POST = withAuth(
  validate({ body: staffStandingSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { userId } = await ctx.params;
    if (!isPlausibleId(userId)) return notFound("member");
    if (!(await reserveAttempt(`standing:${auth.tenant.tenantId}:${auth.userId}`, PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return respond(
      await changeStaffStanding(
        auth.tenant,
        auth.userId,
        { memberUserId: userId },
        toAction(body.action) as "SUSPEND" | "LIFT" | "TERMINATE" | "REINSTATE",
        {
          reason: body.reason,
          until: body.until ?? null,
        },
      ),
    );
  }),
  { tenant: true, roles: ["ADMIN", "CAMPUS_ADMIN"] },
);
