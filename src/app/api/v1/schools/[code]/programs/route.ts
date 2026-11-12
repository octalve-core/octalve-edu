import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { ok } from "@/lib/api/envelope";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { createProgram, listPrograms } from "@/lib/programs/service";
import { createProgramSchema } from "@/lib/programs/validation";
import { Role } from "@prisma/client";

/** GET /api/v1/schools/[code]/programs - the programs this person has a place in (the school's administrator: all), and whether programs are switched on for the school. */
export const GET = withAuth(async (_req, auth: TenantAuthContext) => ok(await listPrograms(auth)), { tenant: true, roles: PROGRAM_ROLES });

/** POST /api/v1/schools/[code]/programs - makes a program (a draft). The school's administrator only. `campusIds` empty = it runs school-wide. */
export const POST = withAuth(
  validate({ body: createProgramSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) =>
    respond(await createProgram(auth, body), 201),
  ),
  { tenant: true, roles: [Role.ADMIN] },
);
