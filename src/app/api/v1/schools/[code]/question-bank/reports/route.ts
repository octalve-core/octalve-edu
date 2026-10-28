import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { listReportsForReviewer, ReportServiceError } from "@/lib/question-bank/reports-service";
import { QuestionReportStatus } from "@prisma/client";

const Query = z.object({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED", "ALL"]).optional(),
  itemId: z.string().optional(),
});
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    try {
      const reports = await auth.tenant.run(async (tx) => {
        return listReportsForReviewer(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          status: query.status as QuestionReportStatus | "ALL" | undefined,
          itemId: query.itemId,
        });
      });
      return ok({ reports });
    } catch (err) {
      if (err instanceof ReportServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  }),
  { tenant: true, roles: BANK_STAFF_ROLES, area: "academics" },
);
