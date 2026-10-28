import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { getPracticeSetForStaff, updatePracticeSet, FormsServiceError } from "@/lib/forms/forms-service";
import { FormStatus } from "@prisma/client";

const UpdateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().max(5000).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]).optional(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  maxDurationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  classGroupIds: z.array(z.string()).optional(),
});

export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const form = await auth.tenant.run(async (tx) => {
        return getPracticeSetForStaff(tx, {
          formId,
          tenantId: auth.tenant.tenantId,
          userId: auth.userId,
        });
      });
      return ok({ form });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: BANK_STAFF_ROLES, area: "academics" },
);

export const PATCH = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = UpdateBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid update payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return updatePracticeSet(tx, {
          formId,
          tenantId: auth.tenant.tenantId,
          userId: auth.userId,
          title: parsed.data.title,
          instructions: parsed.data.instructions,
          status: parsed.data.status as FormStatus | undefined,
          opensAt: parsed.data.opensAt,
          closesAt: parsed.data.closesAt,
          maxDurationMinutes: parsed.data.maxDurationMinutes,
          classGroupIds: parsed.data.classGroupIds,
        });
      });
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
