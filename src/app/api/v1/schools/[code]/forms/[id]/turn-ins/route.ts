import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { getPaperWorkForStaff, updateTurnIn, PaperWorkError } from "@/lib/forms/paper-work-service";
import { TurnInStatus, Permission } from "@prisma/client";

const PatchBody = z.object({
  studentId: z.string().min(1),
  status: z.enum(["PENDING", "HANDED_IN", "LATE"]),
  note: z.string().max(500).optional().nullable(),
});

export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    try {
      const details = await auth.tenant.run(async (tx) => {
        return getPaperWorkForStaff(tx, auth.tenant.tenantId, auth.userId, formId);
      });
      return ok(details);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES, permissions: [Permission.CAN_VIEW_FORM_RESULTS], area: "academics" },
);

export const PATCH = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = PatchBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid turn-in payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return updateTurnIn(
          tx,
          auth.tenant.tenantId,
          auth.userId,
          formId,
          parsed.data.studentId,
          parsed.data.status as TurnInStatus,
          parsed.data.note,
        );
      });
      return ok(result);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
