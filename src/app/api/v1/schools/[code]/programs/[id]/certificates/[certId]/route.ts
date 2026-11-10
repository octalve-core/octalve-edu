import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { getCertificate, revokeCertificate } from "@/lib/programs/completion-service";
import { revokeSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ code: string; id: string; certId: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/certificates/[certId] - one certificate as it was issued, with the code for its QR (for the print page). */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, { params }: Ctx) => {
    const { id, certId } = await params;
    return respond(await getCertificate(auth, id, certId));
  },
  { tenant: true, roles: PROGRAM_ROLES },
);

/** POST /api/v1/schools/[code]/programs/[id]/certificates/[certId] { action: "revoke", reason } - withdraws a certificate with a reason that is kept; it stays on record and the public page says it was withdrawn. */
export const POST = withAuth(
  validate({ body: revokeSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, certId } = await params;
    return respond(await revokeCertificate(auth, id, certId, body.reason));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
