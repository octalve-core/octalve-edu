import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { completeProgram, getCompletion, previewProgramCompletion } from "@/lib/programs/completion-service";
import { completeProgramSchema } from "@/lib/programs/completion-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/completion - the people with open or completed places: whether each can be completed, meets the completion rule, owes fees, and their certificate. A school's administrator or a program admin. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, { params }: Ctx) => respond(await getCompletion(auth, (await params).id)),
  {
    tenant: true,
    roles: PROGRAM_ROLES,
  },
);

/**
 * POST /api/v1/schools/[code]/programs/[id]/completion { confirm?, overrides?: [{ participantId, reason }] }
 * Without `confirm: true`: who would be completed, who is skipped and why, who does not meet the rule, who owes. With it: one step under the program's lock completes every open place whose person
 * is taking part and sets the program COMPLETED. Only a fixed-term program that has reached its end date (409 `NOT_COMPLETABLE`); anyone who does not meet the rule needs an override with a
 * reason or the whole step is refused (409 `RULE_NOT_MET`). A school's administrator or a program admin.
 */
export const POST = withAuth(
  validate({ body: completeProgramSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id } = await params;
    if (body.confirm) return respond(await completeProgram(auth, id, body.overrides));
    return respond(await previewProgramCompletion(auth, id));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
