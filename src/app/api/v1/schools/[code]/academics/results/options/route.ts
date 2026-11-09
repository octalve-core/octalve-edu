import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { STAFF_READ_ROLES } from "@/lib/results/http";
import { entryOptions } from "@/lib/results/sheet";

// GET /api/v1/schools/[code]/academics/results/options                                                                                                (task 0031)
// What the Marks tab offers: the periods of the active session(s) the person works in, and the (class arm, subject) pairs they may enter marks for - every offered pair for an administrator,
// only their assignments for a teacher, none for other staff (who still get the periods, which a reviewer needs). `arms` is what the review filter and the report cards may read. A
// campus-anchored member sees their campus's calendar and the school's.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) =>
    ok(
      await auth.tenant.run((tx) =>
        entryOptions(tx, auth.tenant.tenantId, {
          role: auth.tenant.role,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          permissions: auth.tenant.permissions ?? [],
        }),
      ),
    ),
  { tenant: true, area: "results", roles: STAFF_READ_ROLES },
);
