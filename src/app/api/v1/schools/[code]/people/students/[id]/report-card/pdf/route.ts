import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { isPlausibleId } from "@/lib/academics/http";
import { studentAccess } from "@/lib/attendance/access";
import { resultFailure } from "@/lib/results/http";
import { appOrigin } from "@/lib/app-url";
import { singleCardPdf } from "@/lib/results/report-card-pdf-service";

type Ctx = { params: Promise<{ code: string; id: string }> };

const querySchema = z.object({ periodId: z.string().min(1, "Academic period ID is required") });
const PDFS_PER_WINDOW = 60;

// GET /api/v1/schools/[code]/people/students/[id]/report-card/pdf?periodId=...                                                                         (task 0038)
// One pupil's report card as a PDF file. Exactly who may read the card (task 0031, with the payment gate of task 0037 and the remarks of task 0036): the same access check, the same read,
// so a pupil or a parent who is held gets the same 403 as from the card, and a pupil or parent sees published results only. Every download is audited (REPORT_CARD_PDF_DOWNLOADED).
export const GET = withAuth(
  validate({ query: querySchema }, async (req, auth: TenantAuthContext, ctx: Ctx, { query }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return fail("No such student.", 404, "NOT_FOUND");
    const noAccess = await studentAccess(auth, id);
    if (noAccess) return noAccess;
    if (!(await reserveAttempt(`results:pdf:${auth.tenant.tenantId}:${auth.userId}`, PDFS_PER_WINDOW)))
      return fail("Too many downloads. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const file = await auth.tenant.run((tx) =>
      singleCardPdf(
        tx,
        auth.tenant.tenantId,
        { role: auth.tenant.role, userId: auth.userId },
        id,
        query.periodId,
        appOrigin(new URL(req.url).origin),
      ),
    );
    if (!file.ok) return resultFailure(file.failure, file.message);
    return new Response(new Uint8Array(file.pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Report-Card-Unsupported-Characters": String(file.unsupported),
      },
    });
  }),
  { tenant: true, area: "results", roles: ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF", "STUDENT", "PARENT"] },
);
