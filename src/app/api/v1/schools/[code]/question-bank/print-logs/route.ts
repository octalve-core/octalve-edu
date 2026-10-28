import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { listPrintLogs, PrintingServiceError } from "@/lib/question-bank/printing-service";
import { PrintTargetKind } from "@prisma/client";

const Query = z.object({
  targetKind: z.enum(["QUESTION_BANK_ITEM", "FORM", "QUIZ", "PRACTICE_SESSION", "FORM_RESPONSE"]).optional(),
  targetId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    try {
      const logs = await auth.tenant.run(async (tx) => {
        return listPrintLogs(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          targetKind: query.targetKind as PrintTargetKind | undefined,
          targetId: query.targetId,
          limit: query.limit,
        });
      });
      return ok({ logs });
    } catch (err) {
      if (err instanceof PrintingServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  }),
  { tenant: true, roles: BANK_STAFF_ROLES, area: "academics" },
);
