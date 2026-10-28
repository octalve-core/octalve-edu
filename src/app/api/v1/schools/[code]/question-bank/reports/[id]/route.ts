import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { resolveQuestionReport, ReportServiceError } from "@/lib/question-bank/reports-service";
import { QuestionReportOutcome } from "@prisma/client";

const Body = z.object({
  outcome: z.enum(["FIXED", "NOT_AN_ERROR", "NEEDS_DISCUSSION"]),
  outcomeReason: z.string().trim().min(3),
  applyRegrade: z.boolean().optional(),
});

export const PATCH = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: reportId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = Body.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid resolve payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return resolveQuestionReport(tx, {
          tenantId: auth.tenant.tenantId,
          userId: auth.userId,
          reportId,
          outcome: parsed.data.outcome as QuestionReportOutcome,
          outcomeReason: parsed.data.outcomeReason,
          applyRegrade: parsed.data.applyRegrade,
        });
      });
      return ok(result);
    } catch (err) {
      if (err instanceof ReportServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
