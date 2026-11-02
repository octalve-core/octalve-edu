import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listChildrenForGuardian } from "@/lib/portal/portal-helpers";

// The pupils a guardian may look at the practice of (the history route needs a pupil's id and a guardian has no other way to learn it). Only a guardian asks: a pupil has their own
// record and an administrator names any pupil. What is listed is what the history route will open (`listChildrenForGuardian` follows the same rule), nothing more.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    const children = await auth.tenant.run(async (tx) => listChildrenForGuardian(tx, auth.tenant.tenantId, auth.userId));
    return ok({ children });
  },
  { tenant: true, roles: [Role.PARENT] },
);
