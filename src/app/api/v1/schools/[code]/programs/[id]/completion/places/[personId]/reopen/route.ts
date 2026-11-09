import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { reopenPlace } from "@/lib/programs/completion-service";
import { reopenSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/** POST /api/v1/schools/[code]/programs/[id]/completion/places/[personId]/reopen { reason } - reopens a completed place, with a reason that is kept. A school's administrator only; 409 `HAS_CERTIFICATE` until the certificate is withdrawn. */
export const POST = withAuth(
  validate({ body: reopenSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await reopenPlace(auth, id, personId, body.reason));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
