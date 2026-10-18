import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { createLearningMaterialSchema } from "@/lib/lms/validation";
import { listLearningMaterials, createLearningMaterial } from "@/lib/lms/service";
import { z } from "zod";

const querySchema = z.object({
  subjectId: z.string().optional(),
  classGroupId: z.string().optional(),
});

// GET /api/v1/schools/[code]/lms/materials
export const GET = withAuth(
  validate({ query: querySchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const materials = await listLearningMaterials(auth.tenant.tenantId, query);
    return ok(materials);
  }),
  {
    tenant: true,
    area: "academics",
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT],
  },
);

// POST /api/v1/schools/[code]/lms/materials
export const POST = withAuth(
  validate({ body: createLearningMaterialSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    const material = await createLearningMaterial(auth.tenant.tenantId, auth.userId, body);
    return ok(material, {}, 201);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF],
  },
);
