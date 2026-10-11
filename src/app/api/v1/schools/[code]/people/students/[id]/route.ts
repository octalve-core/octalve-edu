import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { studentScope } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { CAMPUS_WRITE_ROLES, READ_ROLES, isPlausibleId, notFound, peopleFailure, peopleWriteLimited, textField } from "@/lib/people/http";
import { getStudent, updateStudent } from "@/lib/people/students";

// GET   /api/v1/schools/[code]/people/students/[id]  — the student and their enrolment history, newest session first.
// PATCH /api/v1/schools/[code]/people/students/[id]  { firstName?, middleName?, lastName?, dateOfBirth?, admissionNo? } — ADMIN only. The campus is fixed at creation.
type Ctx = { params: Promise<{ code: string; id: string }> };
const patchBody = z
  .strictObject({
    firstName: textField.optional(),
    middleName: textField.nullable().optional(),
    lastName: textField.optional(),
    dateOfBirth: z.string().max(20).optional(),
    admissionNo: z.string().max(100).optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), "Give at least one thing to change.");

export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("student");
    const result = await getStudent(auth.tenant, id);
    return result.ok ? ok({ student: result.student, enrolments: result.enrolments }) : peopleFailure(result.reason, result.detail);
  },
  { tenant: true, roles: READ_ROLES },
);

export const PATCH = withAuth(
  validate({ body: patchBody }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("student");
    const limited = await peopleWriteLimited(auth);
    if (limited) return limited;
    const scoped = await studentScope(auth, id);
    if (scoped) return scoped;
    const result = await updateStudent(auth.tenant, auth.userId, id, body);
    return result.ok ? ok({ student: result.student, changed: result.changed }) : peopleFailure(result.reason, result.detail);
  }),
  { tenant: true, roles: CAMPUS_WRITE_ROLES },
);
