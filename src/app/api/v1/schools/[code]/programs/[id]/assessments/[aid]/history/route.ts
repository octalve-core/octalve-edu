import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { z } from "zod";
import { idField } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { scoreHistory } from "@/lib/programs/assessment-service";

type Ctx = { params: Promise<{ code: string; id: string; aid: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/assessments/[aid]/history?personId= - every entry and change of one person's score, newest first (who, when, from, to, why). Only people the caller may see. */
export const GET = withAuth(
  validate(
    { query: z.object({ personId: idField.regex(/^[A-Za-z0-9_-]+$/) }) },
    async (_req, auth: TenantAuthContext, { params }: Ctx, { query }) => {
      const { id, aid } = await params;
      return respond(await scoreHistory(auth, id, aid, query.personId));
    },
  ),
  { tenant: true, roles: PROGRAM_ROLES },
);
