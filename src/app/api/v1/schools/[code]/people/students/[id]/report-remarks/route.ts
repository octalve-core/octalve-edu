import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId } from "@/lib/academics/http";
import { saveReportRemarks } from "@/lib/results/remarks-service";
import { WRITE_ROLES } from "@/lib/results/http";

type Ctx = { params: Promise<{ code: string; id: string }> };

// A remark is checked by the service (trimmed, 500 characters, no control characters); the schema only says what shape the body has. A key left out is left alone; null clears.
const body = z
  .strictObject({
    periodId: z.string().min(1, "The term is required.").refine(isPlausibleId, "Not a valid term."),
    teacherRemark: z.string().max(5000, "That remark is far too long.").nullable().optional(),
    principalRemark: z.string().max(5000, "That remark is far too long.").nullable().optional(),
  })
  .refine(
    (value) => value.teacherRemark !== undefined || value.principalRemark !== undefined,
    "Give the teacher's remark, the principal's remark, or both.",
  );

// PUT /api/v1/schools/[code]/people/students/[id]/report-remarks { periodId, teacherRemark?, principalRemark? }
// The teacher's and the principal's remark on a pupil's report card for a term (task 0036). The principal's is the administrator's alone; the teacher's is the administrator's or the teacher's who is
// assigned to the pupil's arm; a pupil the caller may not reach is the same 404 as one that does not exist. Refused (409) once any of the pupil's results for the term is published.
// It declares no support `area`: a support session is read-only, so a state-changing handler never names one (tests/unit/route-area-guard.spec.ts).
export const PUT = withAuth(
  validate({ body }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body: input }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return fail("No such pupil on the roll of that term.", 404, "NOT_FOUND");
    const caller = { role: auth.tenant.role, userId: auth.userId, campusId: auth.tenant.campusId };
    const result = await auth.tenant.run((tx) => saveReportRemarks(tx, auth.tenant.tenantId, caller, id, input));
    if (!result.ok) return fail(result.message, result.status, result.code);
    const { changed, teacherRemark, principalRemark } = result.data;
    return ok({ remarks: { teacherRemark, principalRemark }, changed });
  }),
  { tenant: true, roles: [...WRITE_ROLES] },
);
