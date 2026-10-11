import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { READ_ROLES, isPlausibleId, notFound } from "@/lib/people/http";
import { studentReadScope } from "@/lib/auth/campus-scope";
import { attendanceFailure } from "@/lib/attendance/http";
import { getStudentAttendanceHistory } from "@/lib/attendance/service";

type Ctx = { params: Promise<{ code: string; id: string }> };

// GET /api/v1/schools/[code]/people/students/[id]/attendance
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("student");

    // A campus administrator reads their own campus's students (and the school-wide ones); another campus's student is the usual 404.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfScope = await studentReadScope(auth, id);
      if (outOfScope) return outOfScope;
    }

    const result = await auth.tenant.run((tx) => getStudentAttendanceHistory(tx, auth.tenant.tenantId, id));

    if (!result.ok) {
      return attendanceFailure(result.failure);
    }

    return ok(result.data);
  },
  { tenant: true, roles: READ_ROLES },
);
