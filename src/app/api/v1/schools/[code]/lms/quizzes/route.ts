import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { createQuizSchema } from "@/lib/lms/validation";
import { listQuizzes, createQuiz } from "@/lib/lms/service";
import { z } from "zod";

const querySchema = z.object({
  subjectId: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

// GET /api/v1/schools/[code]/lms/quizzes
export const GET = withAuth(
  validate({ query: querySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    // what the caller may see depends on their role: drafts are for staff (the service decides)
    const quizzes = await listQuizzes(auth.tenant.tenantId, { userId: auth.userId, role: auth.tenant.role }, query);
    return ok(quizzes);
  }),
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT],
  },
);

// POST /api/v1/schools/[code]/lms/quizzes
export const POST = withAuth(
  validate({ body: createQuizSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    const quiz = await createQuiz(auth.tenant.tenantId, auth.userId, body);
    return ok(quiz, {}, 201);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
