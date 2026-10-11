import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { armsScope } from "@/lib/auth/campus-scope";
import { batchSaveTimetableSchema, timetableFailure } from "@/lib/timetable/http";
import { batchSaveTimetable } from "@/lib/timetable/service";

// POST /api/v1/schools/[code]/timetable/batch
export const POST = withAuth(
  validate({ body: batchSaveTimetableSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    // A campus administrator works only on their own campus's arms (404 for another campus, 403 for a school-wide arm); other roles are unchanged.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfScope = await armsScope(auth, [body.classArmId, ...body.slots.map((s) => s.classArmId)]);
      if (outOfScope) return outOfScope;
    }
    const result = await batchSaveTimetable(auth.tenant.tenantId, body);
    if (!result.ok) {
      return timetableFailure(result.failure, result.detail, result.clashes);
    }
    return ok(result.data, {}, 200);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
