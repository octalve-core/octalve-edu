import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/envelope";
import { readBoundedForm } from "@/lib/api/read-body";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { IMAGE_INPUT_MAX_BYTES } from "@/lib/question-bank/images";
import { parseImageForm } from "@/lib/question-bank/images-input";
import { addImage } from "@/lib/question-bank/images-service";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";

type Ctx = { params: Promise<{ code: string; id: string }> };

/// The most a form may weigh: the largest picture the image function accepts, and the little the other two fields and the boundaries add.
const FORM_OVERHEAD = 64 * 1024;

/// POST /api/v1/schools/[code]/question-bank/items/[id]/images  multipart/form-data: `file` (one JPEG, PNG or WebP), `alt`, `decorative`.
/// Adds a picture to a question the caller may edit. The picture is drawn again before it is stored; the answer is the question as it now is, and the new picture's id.
export const POST = withAuth(
  async (req: NextRequest, auth: TenantAuthContext, { params }: Ctx) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const read = await readBoundedForm(req, IMAGE_INPUT_MAX_BYTES + FORM_OVERHEAD);
    if (!read.ok) {
      if (read.reason === "TOO_BIG") return fail("That file is too large. Use a picture under 8 MB.", 413, "PAYLOAD_TOO_LARGE");
      if (read.reason === "NOT_MULTIPART") return fail("Send the picture as a multipart form.", 415, "UNSUPPORTED_MEDIA_TYPE");
      return fail("The form could not be read.", 400, "VALIDATION");
    }
    const parsed = await parseImageForm(read.form);
    if (!parsed.ok) return fail(parsed.message, 400, "VALIDATION");
    const result = await addImage(auth.tenant, { userId: auth.userId, itemId: id, ...parsed.upload });
    if (!result.ok) return failure(result);
    return ok({ item: result.item, imageId: result.imageId }, {}, 201);
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
