import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { reviewQueue } from "@/lib/question-bank/review-service";
import { idSchema } from "@/lib/question-bank/validation";

const Query = z.object({ campusId: idSchema.optional() });
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

/// GET /api/v1/schools/[code]/question-bank/review-queue?campusId=  The pending questions the caller has authority to decide, oldest first, never their own (the school's
/// administrator, who may decide anything, sees their own too). Overlap flags are carried only on the questions where the caller is an exam approver. A person who reviews
/// nothing gets an empty list.
export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) =>
    ok(await reviewQueue(auth.tenant, { userId: auth.userId, campusId: query.campusId })),
  ),
  { tenant: true, roles: BANK_STAFF_ROLES },
);
