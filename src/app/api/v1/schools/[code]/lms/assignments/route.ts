import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { createAssignmentSchema } from "@/lib/lms/validation";
import { listAssignments, createAssignment } from "@/lib/lms/service";
import { z } from "zod";

const querySchema = z.object({
  subjectId: z.string().optional(),
  classGroupId: z.string().optional(),
  classArmId: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  studentId: z.string().optional(),
});

// GET /api/v1/schools/[code]/lms/assignments
export const GET = withAuth(
  validate({ query: querySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const assignments = await listAssignments(auth.tenant.tenantId, query);
    return ok(assignments);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT],
  },
);

// POST /api/v1/schools/[code]/lms/assignments
export const POST = withAuth(
  validate({ body: createAssignmentSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    const assignment = await createAssignment(auth.tenant.tenantId, auth.userId, body);
    return ok(assignment, {}, 201);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
