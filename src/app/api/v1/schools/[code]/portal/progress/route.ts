import { Role } from "@prisma/client";
import { z } from "zod";
import { idField } from "@/lib/academics/http";
import { noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { getStudentForViewer, listChildrenForGuardian } from "@/lib/portal/portal-helpers";
import { familyProgress, type FamilyProgram } from "@/lib/programs/progress-family";

const Query = z.object({ studentId: idField.regex(/^[A-Za-z0-9_-]+$/).optional() });
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

/**
 * GET /api/v1/schools/[code]/portal/progress?studentId=
 * What the pupil, or a guardian of the pupil, may see of the progress records (task 0027, slice R3): only the VERIFIED copy of each entry, and for a guardian a summary unless the program
 * allows the full entries. The school's, the campus's and the program's progress switches are read on every request. A pupil sees their own; a guardian each linked child (or the one named).
 * The school's administrator, a teacher and the rest are not the family: they read the records through the program.
 */
export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    const { tenantId, role } = auth.tenant;
    const userId = auth.userId;
    const actor = role === Role.PARENT ? "GUARDIAN" : "PUPIL";
    const children = await auth.tenant.run(async (tx) => {
      const out: { studentId: string; name: string; programs: FamilyProgram[] }[] = [];
      if (role === Role.PARENT && !query.studentId) {
        for (const child of await listChildrenForGuardian(tx, tenantId, userId))
          out.push({ studentId: child.id, name: child.name, programs: (await familyProgress(tx, tenantId, child.id, actor)).programs });
        return out;
      }
      const student = await getStudentForViewer(tx, { tenantId, userId, role, requestedStudentId: query.studentId });
      if (!student) return out;
      out.push({
        studentId: student.id,
        name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
        programs: (await familyProgress(tx, tenantId, student.id, actor)).programs,
      });
      return out;
    });
    return noStore(ok({ actor, children }));
  }),
  { tenant: true, roles: [Role.STUDENT, Role.PARENT], area: "academics" },
);
