import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { printTarget, PrintingServiceError } from "@/lib/question-bank/printing-service";
import { PrintTargetKind } from "@prisma/client";
import { auditClientInfo } from "@/lib/auth/rate-limit";

const Body = z.object({
  includeAnswerKey: z.boolean().optional(),
  recipientStudentId: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const parsed = Body.safeParse(read.json);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid print request payload", 400, "VALIDATION");

    const { ipAddress, userAgent } = auditClientInfo(req);

    try {
      const result = await auth.tenant.run(async (tx) => {
        return printTarget(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          targetKind: PrintTargetKind.FORM,
          targetId: formId,
          includeAnswerKey: parsed.data.includeAnswerKey ?? false,
          recipientStudentId: parsed.data.recipientStudentId,
          reason: parsed.data.reason,
          ipAddress,
          userAgent,
        });
      });

      return new Response(new Uint8Array(result.pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "X-Watermark": encodeURIComponent(result.watermark),
          "X-Print-Log-Id": result.printLogId,
        },
      });
    } catch (err) {
      if (err instanceof PrintingServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
