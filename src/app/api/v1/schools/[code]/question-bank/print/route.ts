import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { printTarget, PrintingServiceError } from "@/lib/question-bank/printing-service";
import { PrintTargetKind } from "@prisma/client";

const Body = z.object({
  targetKind: z.enum(["QUESTION_BANK_ITEM", "FORM", "QUIZ"]),
  targetId: z.string().min(1),
  includeAnswerKey: z.boolean().optional(),
  recipientStudentId: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = Body.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid print request payload", 400, "VALIDATION");
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    try {
      const result = await auth.tenant.run(async (tx) => {
        return printTarget(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          targetKind: parsed.data.targetKind as PrintTargetKind,
          targetId: parsed.data.targetId,
          includeAnswerKey: parsed.data.includeAnswerKey,
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
