import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { printTarget, PrintingServiceError } from "@/lib/question-bank/printing-service";
import { PrintTargetKind } from "@prisma/client";

const Body = z.object({
  includeAnswerKey: z.boolean().optional(),
  recipientStudentId: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; id: string }> }) => {
    const { id: formId } = await ctx.params;
    const read = await readJsonBody(req);
    const parsed = Body.safeParse(read.ok ? read.json : {});

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    try {
      const result = await auth.tenant.run(async (tx) => {
        return printTarget(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          targetKind: PrintTargetKind.FORM,
          targetId: formId,
          includeAnswerKey: parsed.success ? parsed.data.includeAnswerKey : false,
          recipientStudentId: parsed.success ? parsed.data.recipientStudentId : undefined,
          reason: parsed.success ? parsed.data.reason : undefined,
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
  { tenant: true, roles: BANK_STAFF_ROLES },
);
