import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { completePlace } from "@/lib/programs/completion-service";
import { completePlaceSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/**
 * POST /api/v1/schools/[code]/programs/[id]/completion/places/[personId] { note?, overrideReason? }
 * Completes one person's place, at any time. A person who does not meet the completion rule needs `overrideReason` (409 `RULE_NOT_MET`); a suspended, expelled or departed person's place is not
 * completed (409 `NOT_APPLICABLE`). A school's administrator or a program admin.
 */
export const POST = withAuth(
  validate({ body: completePlaceSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await completePlace(auth, id, personId, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
