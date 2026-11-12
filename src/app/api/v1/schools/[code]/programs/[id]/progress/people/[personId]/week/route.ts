import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { saveWeek } from "@/lib/programs/progress-service";
import { weekSchema } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ code: string; id: string; personId: string }> };

/**
 * PUT /api/v1/schools/[code]/programs/[id]/progress/people/[personId]/week { rows: [{ id?, trackKey, entryDate, values, version? }], submit? }
 * The week grid that mirrors the paper booklet: up to 30 rows of one person, new or changed (a changed one carries its `version`), all or nothing - every row is checked before the first is written.
 */
export const PUT = withAuth(
  validate({ body: weekSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await saveWeek(auth, id, personId, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
