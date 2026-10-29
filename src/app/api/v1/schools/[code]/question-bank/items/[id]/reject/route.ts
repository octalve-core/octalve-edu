import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";
import { reasonBody, rejectItem } from "@/lib/question-bank/review-service";

type Ctx = { params: Promise<{ code: string; id: string }> };
type Body = Parsed<typeof reasonBody._output, undefined>;

/// POST /api/v1/schools/[code]/question-bank/items/[id]/reject  { reason }  A reviewer in scope who is not the writer sends a pending question back, with a reason the writer is shown.
export const POST = withAuth(
  validate({ body: reasonBody }, async (_req: NextRequest, auth: TenantAuthContext, { params }: Ctx, { body }: Body) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await rejectItem(auth.tenant, { userId: auth.userId, id, reason: body.reason });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  }),
  { tenant: true, roles: BANK_STAFF_ROLES },
);
