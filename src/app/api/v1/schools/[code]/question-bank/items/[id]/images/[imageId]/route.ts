import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { removeImage, readImage } from "@/lib/question-bank/images-service";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";

type Ctx = { params: Promise<{ code: string; id: string; imageId: string }> };

/// GET /api/v1/schools/[code]/question-bank/items/[id]/images/[imageId]  The picture's bytes, if the caller may see the question. Never cached or shared, and never sniffed or
/// run as a page: it is served as the type OUR record holds, and the API-wide policy (default-src 'none') applies.
export const GET = withAuth(
  async (_req: NextRequest, auth: TenantAuthContext, { params }: Ctx) => {
    const { id, imageId } = await params;
    const bad = badId(id) ?? badId(imageId);
    if (bad) return bad;
    const result = await readImage(auth.tenant, { userId: auth.userId, itemId: id, imageId });
    if (!result.ok) return failure(result);
    return new Response(result.bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);

/// DELETE /api/v1/schools/[code]/question-bank/items/[id]/images/[imageId]  Removes a picture from a question the caller may edit. The answer is the question as it now is.
export const DELETE = withAuth(
  async (_req: NextRequest, auth: TenantAuthContext, { params }: Ctx) => {
    const { id, imageId } = await params;
    const bad = badId(id) ?? badId(imageId);
    if (bad) return bad;
    const result = await removeImage(auth.tenant, { userId: auth.userId, itemId: id, imageId });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
