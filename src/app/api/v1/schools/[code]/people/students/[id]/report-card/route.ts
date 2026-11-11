import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId } from "@/lib/academics/http";
import { studentAccess } from "@/lib/attendance/access";
import { studentReadScope } from "@/lib/auth/campus-scope";
import { resultFailure } from "@/lib/results/http";
import { getStudentReportCard } from "@/lib/results/service";

type Ctx = { params: Promise<{ code: string; id: string }> };

const querySchema = z.object({
  periodId: z.string().min(1, "Academic period ID is required"),
});

// GET /api/v1/schools/[code]/people/students/[id]/report-card?periodId=...
// Retrieves official report card for student. Strictly guarded against IDOR.
export const GET = withAuth(
  validate({ query: querySchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) {
      return fail("No such student.", 404, "NOT_FOUND");
    }

    // Staff read only the students their campus and (for a teacher) their arms allow; anything else is the 404 an unknown id gets (ISS-0013), the rule the student's
    // attendance history applies. A student and a parent are judged by getStudentReportCard.
    const noAccess = await studentAccess(auth, id);
    if (noAccess) return noAccess;
    // `studentAccess` governs teachers and other staff and returns at once for a campus administrator, whose campus is judged here (task 0046, ADR 0016): their campus's pupils and the school's.
    // Only for them: `studentReadScope` answers 403 to any role that is not an administrator, and a pupil, a parent and the staff are judged above and in `getStudentReportCard`.
    if (auth.tenant.role === "CAMPUS_ADMIN") {
      const outOfCampus = await studentReadScope(auth, id);
      if (outOfCampus) return outOfCampus;
    }

    const role = auth.tenant.role;

    const res = await auth.tenant.run((tx) =>
      getStudentReportCard(tx, auth.tenant.tenantId, id, query.periodId, role, auth.userId, auth.tenant.campusId),
    );

    if (!res.ok) {
      return resultFailure(res.failure, "message" in res ? res.message : undefined);
    }

    return ok(res.data);
  }),
  { tenant: true, area: "results", roles: ["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF", "STUDENT", "PARENT"] },
);
