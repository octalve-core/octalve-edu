import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { updateProgramSettings } from "@/lib/programs/program-settings-service";
import { programSettingsSchema } from "@/lib/programs/program-settings-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** PATCH .../settings { attendanceEnabled?, lowAttendancePercent? } - the program's own switches and numbers (the third level under the school's and the campus's). The school's administrator or a program admin, while the program is a draft or active. Audited. */
export const PATCH = withAuth(
  validate({ body: programSettingsSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("program");
    return respond(await updateProgramSettings(auth, id, body));
  }),
  { tenant: true, roles: PROGRAM_ROLES },
);
