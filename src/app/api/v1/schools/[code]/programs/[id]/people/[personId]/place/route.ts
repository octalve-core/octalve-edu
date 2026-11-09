import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { setPlace } from "@/lib/programs/people-service";
import { placeSchema } from "@/lib/programs/people-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/** POST .../people/[personId]/place { action: withdraw | reenrol, reason, groupId? } - ends the place today, or re-opens it. */
export const POST = withAuth(
  validate({ body: placeSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id, personId } = await ctx.params;
    if (!isPlausibleId(id) || !isPlausibleId(personId)) return notFound("person");
    return respond(
      await setPlace(auth, id, personId, {
        action: body.action === "withdraw" ? "WITHDRAW" : "REENROL",
        reason: body.reason,
        groupId: body.groupId,
      }),
    );
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
