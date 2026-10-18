import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listCourses, createCourse } from "@/lib/higher-ed/service";

const querySchema = z.object({
  departmentId: z.string().optional(),
  level: z.coerce.number().optional(),
  semester: z.coerce.number().optional(),
});

const createCourseSchema = z.strictObject({
  departmentId: z.string().min(1, "Department is required."),
  code: z.string().trim().min(3).max(20),
  title: z.string().trim().min(3).max(120),
  creditUnits: z.number().int().min(1).max(6),
  level: z.number().int().min(100).max(500),
  semester: z.number().int().min(1).max(2),
  description: z.string().trim().max(500).optional(),
});

// GET /api/v1/schools/[code]/higher-ed/courses
export const GET = withAuth(
  validate({ query: querySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const courses = await listCourses(auth.tenant.tenantId, query);
    return ok({ courses });
  }),
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT],
  },
);

// POST /api/v1/schools/[code]/higher-ed/courses
export const POST = withAuth(
  validate({ body: createCourseSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    try {
      const course = await createCourse(auth.tenant.tenantId, body);
      return ok({ course }, {}, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create course";
      return fail(message, 400, "BAD_REQUEST");
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
