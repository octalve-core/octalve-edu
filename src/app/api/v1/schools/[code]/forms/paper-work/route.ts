import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody, validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { createPaperWork, listPaperWorkForStaff, PaperWorkError } from "@/lib/forms/paper-work-service";
import { FormStatus, Permission } from "@prisma/client";

const Query = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED", "ALL"]).optional(),
});
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000).optional().nullable(),
  classGroupIds: z.array(z.string()).min(1),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  maxDurationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
});

export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    try {
      const forms = await auth.tenant.run(async (tx) => {
        return listPaperWorkForStaff(tx, auth.tenant.tenantId, auth.tenant.campusId, query.status as FormStatus | "ALL" | undefined);
      });
      return ok({ forms });
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      throw err;
    }
  }),
  { tenant: true, roles: FORM_STAFF_ROLES, permissions: [Permission.CAN_VIEW_FORM_RESULTS], area: "academics" },
);

export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = CreateBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid paper work payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return createPaperWork(tx, auth.tenant.tenantId, auth.tenant.campusId, auth.userId, parsed.data);
      });
      return ok(result, {}, 201);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
