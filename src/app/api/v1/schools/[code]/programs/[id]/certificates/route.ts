import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { issueCertificates, listCertificates } from "@/lib/programs/completion-service";
import { issueSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/certificates - the program's certificates (a school's administrator and a program admin all; a campus administrator those of people through their own campus). */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, { params }: Ctx) => respond(await listCertificates(auth, (await params).id)),
  {
    tenant: true,
    roles: PROGRAM_ROLES,
  },
);

/**
 * POST /api/v1/schools/[code]/programs/[id]/certificates { participantIds? }
 * Issues certificates for completed places, one, some or all (a person who already has one in force is skipped, so doing it twice makes nothing new). The wording and the name are copied onto
 * each. A school's administrator or a program admin.
 */
export const POST = withAuth(
  validate({ body: issueSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) =>
    respond(await issueCertificates(auth, (await params).id, body.participantIds), 201),
  ),
  { tenant: true, roles: PROGRAM_ROLES },
);
