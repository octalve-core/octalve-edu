import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { reportQuestionAsTeacher, ReportServiceError } from "@/lib/question-bank/reports-service";

const Body = z.object({
  reason: z.string().trim().min(5).max(1000),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: itemId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = Body.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid report payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return reportQuestionAsTeacher(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          itemId,
          reason: parsed.data.reason,
        });
      });
      return ok(result, {}, 201);
    } catch (err) {
      if (err instanceof ReportServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
