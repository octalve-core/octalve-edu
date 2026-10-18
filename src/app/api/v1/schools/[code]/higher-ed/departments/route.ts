import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listDepartments, createDepartment } from "@/lib/higher-ed/service";

const createDepartmentSchema = z.strictObject({
  name: z.string().trim().min(2, "Department name must be at least 2 characters.").max(100),
  code: z.string().trim().min(2, "Department code must be at least 2 characters.").max(10),
});

// GET /api/v1/schools/[code]/higher-ed/departments
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    const departments = await listDepartments(auth.tenant.tenantId);
    return ok({ departments });
  },
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT],
  },
);

// POST /api/v1/schools/[code]/higher-ed/departments
export const POST = withAuth(
  validate({ body: createDepartmentSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    try {
      const department = await createDepartment(auth.tenant.tenantId, body);
      return ok({ department }, {}, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create department";
      return fail(message, 400, "BAD_REQUEST");
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
