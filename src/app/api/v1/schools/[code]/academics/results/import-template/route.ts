import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { WRITE_ROLES, resultFailure, sheetQuerySchema } from "@/lib/results/http";
import { markTemplate } from "@/lib/results/mark-import-service";

// A byte-order mark makes a spreadsheet read the file as UTF-8, so a pupil's name keeps its letters. The CSV reader of the import drops it again.
const BOM = String.fromCharCode(0xfeff);

// GET /api/v1/schools/[code]/academics/results/import-template?periodId=&classArmId=&subjectId=                                                        (task 0039)
// The marks sheet of one subject in one arm and term as a CSV file to fill in: `admission_no`, `name`, a column per part of the class's scheme (the exam is a part), one row per pupil on the roll in
// the sheet's order, the saved marks filled in. Exactly the people the sheet shows and exactly who may see it (an administrator, or a teacher assigned to this subject in this arm: anyone else 403;
// another campus's arm, an archived one and an unknown id are the same 404). Every cell is neutralised against spreadsheet formulas.
export const GET = withAuth(
  validate({ query: sheetQuerySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const res = await auth.tenant.run((tx) =>
      markTemplate(tx, auth.tenant.tenantId, { role: auth.tenant.role, campusId: auth.tenant.campusId, userId: auth.userId }, query),
    );
    if (!res.ok) return resultFailure(res.failure, res.message);
    return new Response(BOM + res.data.csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${res.data.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-row-count": String(res.data.pupils),
      },
    });
  }),
  { tenant: true, area: "results", roles: WRITE_ROLES },
);
