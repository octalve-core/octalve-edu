import { fail } from "@/lib/api/envelope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { PORTAL_STUDENT_ROLES, getStudentFromAuth } from "@/lib/portal/portal-helpers";
import { printPupilFormResponse, PrintingServiceError } from "@/lib/question-bank/printing-service";
import { PracticeError } from "@/lib/question-bank/practice-service";

export const GET = withAuth(
  async (req, auth: TenantAuthContext, ctx: { params: Promise<{ code: string; responseId: string }> }) => {
    const { responseId } = await ctx.params;
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    try {
      const result = await auth.tenant.run(async (tx) => {
        const student = await getStudentFromAuth(tx, auth.tenant.tenantId, auth.userId);
        if (!student) {
          throw new PracticeError("Student profile not found.", 404, "NOT_FOUND");
        }
        return printPupilFormResponse(tx, {
          tenantId: auth.tenant.tenantId,
          studentId: student.id,
          responseId,
          ipAddress,
          userAgent,
        });
      });

      return new Response(new Uint8Array(result.pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${result.filename}"`,
        },
      });
    } catch (err) {
      if (err instanceof PrintingServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      if (err instanceof PracticeError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: PORTAL_STUDENT_ROLES, area: "academics" },
);
