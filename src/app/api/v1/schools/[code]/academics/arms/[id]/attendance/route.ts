import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { READ_ROLES, WRITE_ROLES, isoDateField, bulkMarkAttendanceSchema, attendanceFailure } from "@/lib/attendance/http";
import { armReadScope, armScope } from "@/lib/auth/campus-scope";
import { armAccess } from "@/lib/attendance/access";
import { getArmRollCall, markArmAttendance } from "@/lib/attendance/service";

type Ctx = { params: Promise<{ code: string; id: string }> };

const querySchema = z.object({
  date: isoDateField.optional(),
});

// GET /api/v1/schools/[code]/academics/arms/[id]/attendance?date=YYYY-MM-DD
export const GET = withAuth(
  validate({ query: querySchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("arm");

    // A campus administrator reads the roll of their own campus's arms and the school-wide ones; another campus's arm is the usual 404.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfScope = await armReadScope(auth, id);
      if (outOfScope) return outOfScope;
    }

    // Staff read only the arms their campus and (for a teacher) their assignments allow; anything else is the 404 an unknown id gets (ISS-0013).
    const noAccess = await armAccess(auth, id);
    if (noAccess) return noAccess;

    const dateStr = query.date ?? new Date().toISOString().split("T")[0];
    const role = auth.tenant.role;

    const result = await auth.tenant.run((tx) => getArmRollCall(tx, auth.tenant.tenantId, id, dateStr, role));

    if (!result.ok) {
      return attendanceFailure(result.failure);
    }

    return ok(result.data);
  }),
  { tenant: true, roles: READ_ROLES },
);

// POST /api/v1/schools/[code]/academics/arms/[id]/attendance
// Body: { date: "YYYY-MM-DD", records: [{ studentId, status, remarks? }], source?: "ONLINE" | "OFFLINE_SYNC" }
export const POST = withAuth(
  validate({ body: bulkMarkAttendanceSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body: input }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("arm");

    // A campus administrator takes the roll only of their own campus's arms (404 for another campus, 403 for a school-wide arm). Teachers keep
    // the behaviour they had; reads follow row-level security, which already hides another campus's arm.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfScope = await armScope(auth, id);
      if (outOfScope) return outOfScope;
    }

    // The same rule as the read: a teacher who cannot read an arm cannot write to it (ISS-0013).
    const noAccess = await armAccess(auth, id);
    if (noAccess) return noAccess;

    const role = auth.tenant.role;

    const result = await auth.tenant.run((tx) => markArmAttendance(tx, auth.tenant.tenantId, id, auth.userId, role, input));

    if (!result.ok) {
      return attendanceFailure(result.failure);
    }

    return ok(result.data);
  }),
  { tenant: true, roles: WRITE_ROLES },
);
