import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { createTimetableSlotSchema, queryTimetableSchema, timetableFailure } from "@/lib/timetable/http";
import { armsScope } from "@/lib/auth/campus-scope";
import { queryTimetableSlots, createTimetableSlot } from "@/lib/timetable/service";

// GET /api/v1/schools/[code]/timetable
export const GET = withAuth(
  validate({ query: queryTimetableSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const result = await queryTimetableSlots(auth.tenant.tenantId, query);
    return ok(result);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT],
  },
);

// POST /api/v1/schools/[code]/timetable
export const POST = withAuth(
  validate({ body: createTimetableSlotSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    // A campus administrator works only on their own campus's arms (404 for another campus, 403 for a school-wide arm); other roles are unchanged.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfScope = await armsScope(auth, [body.classArmId]);
      if (outOfScope) return outOfScope;
    }
    const result = await createTimetableSlot(auth.tenant.tenantId, body);
    if (!result.ok) {
      return timetableFailure(result.failure, result.detail, result.clashes);
    }
    return ok(result.data, {}, 201);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
