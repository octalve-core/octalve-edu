import { CertificateStatus, Role } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { isPlausibleId, notFound } from "@/lib/academics/http";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listCertificates, issueCertificate } from "@/lib/certificates/service";

const querySchema = z.object({
  studentId: z.string().refine(isPlausibleId, "Not a valid student id.").optional(),
  status: z.nativeEnum(CertificateStatus).optional(),
});

const issueSchema = z.strictObject({
  studentId: z.string().min(1, "Student ID is required.").refine(isPlausibleId, "Not a valid student id."),
  periodId: z.string().refine(isPlausibleId, "Not a valid period id.").optional(),
  title: z.string().trim().min(3).max(150),
  prefix: z.string().trim().max(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/v1/schools/[code]/certificates
export const GET = withAuth(
  validate({ query: querySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const certificates = await listCertificates(auth.tenant.tenantId, query);
    return ok({ certificates });
  }),
  {
    tenant: true,
    area: "results",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT],
  },
);

// POST /api/v1/schools/[code]/certificates
export const POST = withAuth(
  validate({ body: issueSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    const issued = await issueCertificate(auth.tenant.tenantId, body);
    if (!issued.ok) return notFound(issued.failure === "STUDENT_NOT_FOUND" ? "student" : "academic period");
    return ok({ certificate: issued.certificate }, {}, 201);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
