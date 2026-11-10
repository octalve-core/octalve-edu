import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { lockAction } from "@/lib/programs/progress-service";
import { lockSchema } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string; entryId: string }> };

/**
 * POST /api/v1/schools/[code]/programs/[id]/progress/people/[personId]/entries/[entryId]/lock { action: "take" | "heartbeat" | "viewing" | "release" }
 * The lock on one entry. take and heartbeat hold it for the program's inactivity time (409 `LOCKED` while someone else does); viewing hands it back after the program's short delay; release
 * (the holder, or an administrator) at once. Advisory: the version check on a save is the safety net.
 */
export const POST = withAuth(
  validate({ body: lockSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, personId, entryId } = await params;
    return respond(await lockAction(auth, id, personId, entryId, body.action));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
