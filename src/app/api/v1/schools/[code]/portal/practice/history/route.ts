import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody, validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_ALL_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { getPracticeHistory, archivePracticeAttempt, PracticeError } from "@/lib/question-bank/practice-service";

const Query = z.object({
  studentId: z.string().optional(),
  archived: z.enum(["1", "true"]).optional(),
});
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

const PatchBody = z.object({
  attemptId: z.string().min(1),
  archived: z.boolean(),
});

export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    try {
      const history = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId, query.studentId);
        if (!student) {
          throw new PracticeError("Student record not found.", 404, "NOT_FOUND");
        }
        return getPracticeHistory(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: student.campusId,
          studentId: student.id,
          role: auth.tenant.role,
          archived: query.archived !== undefined,
        });
      });
      return ok(history);
    } catch (err) {
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  }),
  { tenant: true, roles: PORTAL_ALL_ROLES, area: "academics" },
);

export const PATCH = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = PatchBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid archive payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return archivePracticeAttempt(tx, {
          tenantId: auth.tenant.tenantId,
          studentId: student.id,
          role: auth.tenant.role,
          attemptId: parsed.data.attemptId,
          archived: parsed.data.archived,
        });
      });
      return ok(result);
    } catch (err) {
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_ALL_ROLES },
);
