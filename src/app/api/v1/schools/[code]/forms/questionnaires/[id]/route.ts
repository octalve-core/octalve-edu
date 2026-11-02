import { z } from "zod";
import { FormAudienceKind, FormStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { getQuestionnaireForStaff, updateQuestionnaire } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

// A questionnaire for the staff who manage it (the list route had no detail and nothing could publish a draft): GET the questionnaire with its questions, PATCH its details and status
// (DRAFT to PUBLISHED, and so on). The rules are the service's (`reachForm`: the school, the campus and who manages it); this route only carries them.

const UpdateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().max(5000).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]).optional(),
  isAnonymous: z.boolean().optional(),
  audienceKind: z.enum(["MEMBERS", "PUBLIC"]).optional(),
  roles: z.array(z.string()).optional(),
  classGroupIds: z.array(z.string()).optional(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
});

export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const form = await auth.tenant.run(async (tx) =>
        getQuestionnaireForStaff(tx, { formId, tenantId: auth.tenant.tenantId, userId: auth.userId }),
      );
      return ok({ form });
    } catch (err) {
      if (err instanceof FormsServiceError) return fail(err.message, err.statusCode, err.code);
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
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid update payload", 400, "VALIDATION");

    try {
      const result = await auth.tenant.run(async (tx) =>
        updateQuestionnaire(tx, {
          formId,
          tenantId: auth.tenant.tenantId,
          userId: auth.userId,
          title: parsed.data.title,
          instructions: parsed.data.instructions,
          status: parsed.data.status as FormStatus | undefined,
          isAnonymous: parsed.data.isAnonymous,
          audienceKind: parsed.data.audienceKind as FormAudienceKind | undefined,
          roles: parsed.data.roles,
          classGroupIds: parsed.data.classGroupIds,
          opensAt: parsed.data.opensAt,
          closesAt: parsed.data.closesAt,
        }),
      );
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) return fail(err.message, err.statusCode, err.code);
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
