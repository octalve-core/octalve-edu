import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { changePersonStanding, personStandingHistory } from "@/lib/programs/people-service";
import { personStandingSchema } from "@/lib/programs/people-validation";
import type { StandingAction } from "@/lib/standing/rules";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/** GET .../people/[personId]/standing - the standing of a person typed in and its history, newest first. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id, personId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(personId)) return notFound("person");
    return respond(await personStandingHistory(auth, id, personId));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);

/** POST .../people/[personId]/standing { action: suspend | lift | expel | reinstate, reason, until? } - for a person typed in only (a pupil's or a member of staff's standing is the school's: 409). */
export const POST = withAuth(
  validate({ body: personStandingSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id, personId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(personId)) return notFound("person");
    const action = body.action.toUpperCase() as Exclude<StandingAction, "TERMINATE">;
    return respond(await changePersonStanding(auth, id, personId, action, { reason: body.reason, until: body.until ?? null }));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
