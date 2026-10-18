import { CertificateStatus, Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listCertificates, issueCertificate } from "@/lib/certificates/service";

const querySchema = z.object({
  studentId: z.string().optional(),
  status: z.nativeEnum(CertificateStatus).optional(),
});

const issueSchema = z.strictObject({
  studentId: z.string().min(1, "Student ID is required."),
  periodId: z.string().optional(),
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
    try {
      const certificate = await issueCertificate(auth.tenant.tenantId, body);
      return ok({ certificate }, {}, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to issue certificate";
      return fail(message, 400, "BAD_REQUEST");
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
