import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { listPendingMarkingResponses, ManualMarkingError } from "@/lib/forms/manual-marking-service";
import { FormMarkingStatus } from "@prisma/client";

const Query = z.object({
  formId: z.string().optional(),
  markingStatus: z.enum(["NOT_REQUIRED", "PENDING", "PARTIALLY_MARKED", "MARKED"]).optional(),
});
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    try {
      const queue = await auth.tenant.run(async (tx) => {
        return listPendingMarkingResponses(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          formId: query.formId,
          markingStatus: query.markingStatus as FormMarkingStatus | undefined,
        });
      });
      return ok({ queue });
    } catch (err) {
      if (err instanceof ManualMarkingError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  }),
  { tenant: true, roles: FORM_STAFF_ROLES, area: "academics" },
);
