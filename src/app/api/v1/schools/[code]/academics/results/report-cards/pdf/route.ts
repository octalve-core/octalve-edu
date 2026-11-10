import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { STAFF_READ_ROLES, resultFailure, rosterQuerySchema } from "@/lib/results/http";
import { appOrigin } from "@/lib/app-url";
import { classCardsPdf } from "@/lib/results/report-card-pdf-service";

const PDFS_PER_WINDOW = 20;

// GET /api/v1/schools/[code]/academics/results/report-cards/pdf?periodId=&classArmId=                                                                    (task 0038)
// Every pupil on the roll of an arm for a term, one report card each, in one PDF (at most 100 cards). Who may read the arm is the class list's rule (an administrator every arm, a teacher the
// arms they are assigned and the arms of their approver scope, other staff the campus rule; anything else is the same 404 as an unknown id). Staff only: a pupil or parent downloads their own
// card. Audited (REPORT_CARDS_PDF_DOWNLOADED). Two files at once is more than one person needs: 20 an hour.
export const GET = withAuth(
  validate({ query: rosterQuerySchema }, async (req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    if (!(await reserveAttempt(`results:class-pdf:${auth.tenant.tenantId}:${auth.userId}`, PDFS_PER_WINDOW)))
      return fail("Too many downloads. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const file = await auth.tenant.run((tx) =>
      classCardsPdf(
        tx,
        auth.tenant.tenantId,
        { role: auth.tenant.role, campusId: auth.tenant.campusId, userId: auth.userId, permissions: auth.tenant.permissions ?? [] },
        query,
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
        "X-Report-Card-Count": String(file.cards),
        "X-Report-Card-Unsupported-Characters": String(file.unsupported),
      },
    });
  }),
  { tenant: true, area: "results", roles: STAFF_READ_ROLES },
);
