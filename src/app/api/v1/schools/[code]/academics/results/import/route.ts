import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { WRITE_ROLES, markImportSchema, resultFailure } from "@/lib/results/http";
import { importMarks } from "@/lib/results/mark-import-service";
import { IMPORT_MAX_BYTES } from "@/lib/results/mark-import";

// POST /api/v1/schools/[code]/academics/results/import  { periodId, classArmId, subjectId, csv, dryRun }                                              (task 0039)
// Marks for one subject in one arm and term from a CSV file (the template of `import-template`; UTF-8, at most 1 MiB and 1,000 rows). ADMIN and TEACHING_STAFF, the writers of marks; a teacher only for
// a subject they are assigned in that arm (the sheet's answers: 403, or the 404 of an unknown id). Pupils are found by admission number among the pupils on THIS roll only. ALL OR NOTHING: any problem,
// a check (`dryRun: true`) or a file with nothing new writes nothing and the answer is a report of every row (200, `committed: false`); with no problem the new and changed rows go to
// `recordStudentResults` in the same transaction, so every rule of marks applies, and the answer is 200 with `committed: true`. A check proves nothing to the server: a real run re-checks everything.
// State-changing, so no support `area`. 12 a window per user (a check and a real run each count).
/// A 1 MiB file, JSON-escaped, can approach twice its size (every CR and LF is two characters); the default body cap would refuse files the importer accepts.
const IMPORT_MAX_BODY_BYTES = IMPORT_MAX_BYTES * 2 + 1024;
const IMPORTS_PER_WINDOW = 12;

export const POST = withAuth(
  validate(
    { body: markImportSchema, maxBodyBytes: IMPORT_MAX_BODY_BYTES },
    async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
      if (!(await reserveAttempt(`results:import:${auth.tenant.tenantId}:${auth.userId}`, IMPORTS_PER_WINDOW)))
        return fail("Too many imports. Please try again in a few minutes.", 429, "RATE_LIMITED");
      const res = await auth.tenant.run((tx) =>
        importMarks(tx, auth.tenant.tenantId, { role: auth.tenant.role, campusId: auth.tenant.campusId, userId: auth.userId }, body),
      );
      return res.ok ? ok({ report: res.data.report }) : resultFailure(res.failure, res.message);
    },
  ),
  { tenant: true, roles: WRITE_ROLES },
);
