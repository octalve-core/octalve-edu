import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { READ_ROLES } from "@/lib/attendance/http";
import { listRollCallArms } from "@/lib/attendance/access";

// GET /api/v1/schools/[code]/academics/attendance/arms                                                   (task 0010 F3, ISS-0013)
// The live class arms the caller may take or read a roll for: an administrator all of them, a campus administrator / registrar their campus's and the
// school-wide ones, a teacher only the arms they are assigned to (none until an administrator assigns them). What the attendance screen offers.
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    const arms = await listRollCallArms(auth);
    return ok({ arms });
  },
  { tenant: true, roles: READ_ROLES },
);
