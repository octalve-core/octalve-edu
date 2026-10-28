import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { batchUpdateTurnIns, PaperWorkError } from "@/lib/forms/paper-work-service";
import { TurnInStatus } from "@prisma/client";

const BatchBody = z.object({
  updates: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PENDING", "HANDED_IN", "LATE"]),
        note: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = BatchBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid batch updates payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return batchUpdateTurnIns(
          tx,
          auth.tenant.tenantId,
          auth.userId,
          formId,
          parsed.data.updates.map((u) => ({
            studentId: u.studentId,
            status: u.status as TurnInStatus,
            note: u.note,
          })),
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
  { tenant: true, roles: BANK_STAFF_ROLES },
);
