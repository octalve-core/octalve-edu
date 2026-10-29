import { Role } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { createCampus, ownCampusOnly } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, requireFreshProof, settingsChangeBody, settingsFailureResponse, settingsQuery } from "@/lib/question-bank/http";
import { bankSettingsView, changeBankSettings } from "@/lib/question-bank/settings-service";

// The question bank's switches (task 0024 slice B). School and campus administrators only; NO `area`, so no support view reaches it.
// GET ?campusId=  Each of the switches with its default, the school's value, the campus's override and the value that applies. A campus administrator sees their own campus's
//                 view; the school's administrator the school's own, or any campus's.
// PUT             { scope: SCHOOL | CAMPUS, campusId?, changes: { key: value | null }, reason?, stepUp } Fresh re-authentication for EVERY change, school-wide or campus (decision
//                 D3), one audit row per switch in the same transaction. A campus may only make a switch stricter than the school's; the school's own change is the school
//                 administrator's alone.
export const GET = withAuth(
  validate({ query: settingsQuery }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const refused = ownCampusOnly(auth, query.campusId);
    if (refused) return refused;
    const campusId = query.campusId ?? (auth.tenant.role === "CAMPUS_ADMIN" ? auth.tenant.campusId : null);
    if (campusId !== null) {
      const known = await auth.tenant.run((tx) =>
        tx.campus.findFirst({ where: { id: campusId, tenantId: auth.tenant.tenantId }, select: { id: true } }),
      );
      if (!known) return fail("No such campus.", 404, "NOT_FOUND");
    }
    return ok({ campusId, settings: await bankSettingsView(auth.tenant, campusId) });
  }),
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);

export const PUT = withAuth(
  validate({ body: settingsChangeBody }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    if (body.campusId && !isPlausibleId(body.campusId)) return fail("No such campus.", 404, "NOT_FOUND");
    let campusId: string | null = null;
    if (body.scope === "CAMPUS" && body.campusId === null) return fail("A campus change needs the campus.", 400, "VALIDATION"); // null is not "mine"
    if (body.scope === "CAMPUS") {
      const where = createCampus(auth, body.campusId ?? undefined);
      if (where instanceof Response) return where;
      campusId = where.campusId;
    } else if (auth.tenant.role !== "ADMIN") {
      return fail("Only a school administrator can change the school's own settings.", 403, "FORBIDDEN");
    }
    const proof = await requireFreshProof(auth, body.stepUp);
    if (!proof.ok) return proof.response;
    const result = await changeBankSettings(auth.tenant, {
      actorUserId: auth.userId,
      actorRole: auth.tenant.role,
      actorCampusId: auth.tenant.campusId,
      scope: body.scope,
      campusId,
      changes: body.changes,
      reason: body.reason ?? null,
      stepUpVerifiedAt: proof.verifiedAt,
    });
    return result.ok ? ok({ changed: result.changed, settings: result.settings }) : settingsFailureResponse(result);
  }),
  { tenant: true, roles: [Role.ADMIN, Role.CAMPUS_ADMIN] },
);
