import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { createEntry } from "@/lib/programs/progress-service";
import { createEntrySchema } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/**
 * POST /api/v1/schools/[code]/programs/[id]/progress/people/[personId]/entries { trackKey, entryDate, values, submit? }
 * Quick add: one row. A school's administrator, a program admin, and a teacher or recorder of the person's group (as the program's `writers` setting allows), while the place is taking part. The
 * values are checked against the track's columns on the server. 409 `EXISTS` (with the existing entry's id in `details`) for a second row on the same day of a one-row-a-day track.
 */
export const POST = withAuth(
  validate({ body: createEntrySchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await createEntry(auth, id, personId, body), 201);
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
