import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { STAFF_READ_ROLES, resultFailure, rosterQuerySchema } from "@/lib/results/http";
import { classRoster } from "@/lib/results/sheet";

// GET /api/v1/schools/[code]/academics/results/roster?periodId=&classArmId=                                                                           (task 0031)
// The pupils of an arm for a period, with how many of their results are published: the class list of the report-cards tab. An administrator reads every arm; a teacher the arms they are assigned
// and the arms of their approver scope; other staff the campus rule. Another campus's arm, or one the teacher has no part in, is the same 404 as an unknown id.
export const GET = withAuth(
  validate({ query: rosterQuerySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const res = await auth.tenant.run((tx) =>
      classRoster(
        tx,
        auth.tenant.tenantId,
        { role: auth.tenant.role, campusId: auth.tenant.campusId, userId: auth.userId, permissions: auth.tenant.permissions ?? [] },
        query,
      ),
    );
    return res.ok ? ok(res.data) : resultFailure(res.failure, res.message);
  }),
  { tenant: true, area: "results", roles: STAFF_READ_ROLES },
);
