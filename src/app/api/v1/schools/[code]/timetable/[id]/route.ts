import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { armsScope, timetableSlotScope } from "@/lib/auth/campus-scope";
import { updateTimetableSlotSchema, timetableFailure } from "@/lib/timetable/http";
import { updateTimetableSlot, deleteTimetableSlot } from "@/lib/timetable/service";

type RouteCtx = { params: Promise<{ code: string; id: string }> };

// PATCH /api/v1/schools/[code]/timetable/[id]
export const PATCH = withAuth(
  validate({ body: updateTimetableSlotSchema }, async (_req, auth: TenantAuthContext, ctx: RouteCtx, { body }) => {
    const { id } = await ctx.params;
    // A campus administrator works only on their own campus's arms (404 for another campus, 403 for a school-wide arm); other roles are unchanged.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfScope = (await timetableSlotScope(auth, id)) ?? (await armsScope(auth, [body.classArmId]));
      if (outOfScope) return outOfScope;
    }
    const result = await updateTimetableSlot(auth.tenant.tenantId, id, body);
    if (!result.ok) {
      return timetableFailure(result.failure, result.detail, result.clashes);
    }
    return ok(result.data);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);

// DELETE /api/v1/schools/[code]/timetable/[id]
export const DELETE = withAuth(
  async (_req, auth: TenantAuthContext, ctx: RouteCtx) => {
    const { id } = await ctx.params;
    // A campus administrator works only on their own campus's arms (404 for another campus, 403 for a school-wide arm); other roles are unchanged.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfScope = await timetableSlotScope(auth, id);
      if (outOfScope) return outOfScope;
    }
    const result = await deleteTimetableSlot(auth.tenant.tenantId, id);
    if (!result.ok) {
      return timetableFailure(result.failure, result.detail);
    }
    return ok(result.data);
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
