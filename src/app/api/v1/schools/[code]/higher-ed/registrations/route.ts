import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { registerStudentCourse, gradeStudentCourse } from "@/lib/higher-ed/service";

const registerSchema = z.strictObject({
  studentId: z.string().min(1, "Student ID is required."),
  courseId: z.string().min(1, "Course ID is required."),
  periodId: z.string().min(1, "Academic period/semester ID is required."),
});

const gradeSchema = z.strictObject({
  registrationId: z.string().min(1, "Registration ID is required."),
  score: z.number().min(0).max(100),
});

// GET /api/v1/schools/[code]/higher-ed/registrations (registration metadata)
export const GET = withAuth(
  async () => {
    return ok({ message: "Course registration portal active" });
  },
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT],
  },
);

// POST /api/v1/schools/[code]/higher-ed/registrations (student course registration)
export const POST = withAuth(
  validate({ body: registerSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    try {
      // If student is registering, ensure they register for themselves
      if (auth.tenant.role === Role.STUDENT && auth.userId !== body.studentId) {
        return fail("Students can only register courses for themselves.", 403, "FORBIDDEN");
      }
      const registration = await registerStudentCourse(auth.tenant.tenantId, body);
      return ok({ registration }, {}, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to register course";
      return fail(message, 400, "BAD_REQUEST");
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.STUDENT],
  },
);

// PATCH /api/v1/schools/[code]/higher-ed/registrations (grade submission)
export const PATCH = withAuth(
  validate({ body: gradeSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    try {
      const updated = await gradeStudentCourse(auth.tenant.tenantId, body);
      return ok({ registration: updated });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to submit course grade";
      return fail(message, 400, "BAD_REQUEST");
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
