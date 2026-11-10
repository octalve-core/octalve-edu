import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { getRecord, saveProfile } from "@/lib/programs/progress-service";
import { profileSchema, recordQuery } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/**
 * GET /api/v1/schools/[code]/programs/[id]/progress/people/[personId]?from=&to=&trackKey=
 * One person's record: the template, the profile, the entries of the range (the last 28 days by default, at most 400; the notes tracks in full), each with its status, lock and what the
 * caller may do with it, where the next range of each track starts, and the weeks a pupil or a guardian marked as seen. A person out of the caller's reach is 404.
 */
export const GET = withAuth(
  validate({ query: recordQuery }, async (_req, auth: TenantAuthContext, { params }: Ctx, { query }) => {
    const { id, personId } = await params;
    return respond(await getRecord(auth, id, personId, query));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);

/** PUT /api/v1/schools/[code]/programs/[id]/progress/people/[personId] { values, version? } - the profile fields of the template (what the system does not already know). 409 `CHANGED` for a stale version. */
export const PUT = withAuth(
  validate({ body: profileSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await saveProfile(auth, id, personId, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
