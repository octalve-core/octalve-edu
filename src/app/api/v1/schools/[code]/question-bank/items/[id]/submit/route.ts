import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";
import { submitItem } from "@/lib/question-bank/items-service";

type Ctx = { params: Promise<{ code: string; id: string }> };

/// POST /api/v1/schools/[code]/question-bank/items/[id]/submit  Sends the caller's own draft or rejected question for review. The caller is told only that it is pending, never
/// whether it was flagged.
export const POST = withAuth(
  async (_req: NextRequest, auth: TenantAuthContext, { params }: Ctx) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await submitItem(auth.tenant, { userId: auth.userId, id });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
