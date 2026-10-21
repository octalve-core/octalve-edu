import { fail, ok } from "@/lib/api/envelope";
import { readBoundedText } from "@/lib/api/read-body";
import { MAX_BODY_BYTES } from "@/lib/api/validate";
import { studentScope } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { CAMPUS_WRITE_ROLES, isPlausibleId, notFound, peopleFailure, peopleWriteLimited } from "@/lib/people/http";
import { restoreStudent } from "@/lib/people/students";

// POST /api/v1/schools/[code]/people/students/[id]/restore — ADMIN only. Idempotent: doing it twice answers 200 with changed: false.
type Ctx = { params: Promise<{ code: string; id: string }> };

export const POST = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("student");
    const limited = await peopleWriteLimited(auth);
    if (limited) return limited;
    const scoped = await studentScope(auth, id);
    if (scoped) return scoped;
    let allowDuplicate = false;
    // The body is optional ({ allowDuplicate }); an empty or non-JSON body keeps the default. It is read no further than the cap.
    const text = await readBoundedText(_req, MAX_BODY_BYTES).catch(() => "");
    if (text === null) return fail("That request is too large.", 413, "PAYLOAD_TOO_LARGE");
    if (text.trim()) {
      try {
        const json = JSON.parse(text);
        allowDuplicate = Boolean(json?.allowDuplicate);
      } catch {
        // empty or non-JSON body keeps default false
      }
    }
    const result = await restoreStudent(auth.tenant, auth.userId, id, allowDuplicate);
    return result.ok ? ok({ student: result.student, changed: result.changed }) : peopleFailure(result.reason, result.detail);
  },
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
