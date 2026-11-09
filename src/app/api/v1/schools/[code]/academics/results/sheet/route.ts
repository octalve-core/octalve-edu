import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { WRITE_ROLES, resultFailure, sheetQuerySchema } from "@/lib/results/http";
import { getSheet } from "@/lib/results/sheet";

// GET /api/v1/schools/[code]/academics/results/sheet?periodId=&classArmId=&subjectId=                                                                  (task 0031)
// The marks sheet for one subject in one arm and period: the pupils on the arm's roll, the scheme's parts and what is saved so far. An administrator, or a teacher ASSIGNED to this subject in
// this arm (anyone else 403); another campus's arm, an archived one and an unknown id are the same 404. Saving goes through POST .../academics/results.
export const GET = withAuth(
  validate({ query: sheetQuerySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const res = await auth.tenant.run((tx) =>
      getSheet(tx, auth.tenant.tenantId, { role: auth.tenant.role, campusId: auth.tenant.campusId, userId: auth.userId }, query),
    );
    return res.ok ? ok(res.data) : resultFailure(res.failure, res.message);
  }),
  { tenant: true, area: "results", roles: WRITE_ROLES },
);
