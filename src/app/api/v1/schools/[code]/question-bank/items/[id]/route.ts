import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";
import { getItem, updateItem } from "@/lib/question-bank/items-service";

type Ctx = { params: Promise<{ code: string; id: string }> };

/// GET /api/v1/schools/[code]/question-bank/items/[id]  One question and the decisions made on it, if the caller may see it; otherwise "Not found", the same as for one that does
/// not exist (or belongs to another school). The `overlap` key is there only for an exam approver in scope or the school's administrator.
export const GET = withAuth(
  async (_req: NextRequest, auth: TenantAuthContext, { params }: Ctx) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await getItem(auth.tenant, { userId: auth.userId, id });
    if (!result.ok) return failure(result);
    return ok({ item: result.item, history: result.history });
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);

/// PATCH /api/v1/schools/[code]/question-bank/items/[id]  The whole question again (the body of a new one, without `campusId`). Its writer while it is a draft, pending or rejected;
/// a reviewer in scope for an approved one.
export const PATCH = withAuth(
  async (req: NextRequest, auth: TenantAuthContext, { params }: Ctx) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const result = await updateItem(auth.tenant, { userId: auth.userId, id, body: read.json });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
