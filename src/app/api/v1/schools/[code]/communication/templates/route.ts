import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { queryTemplatesSchema, createTemplateSchema } from "@/lib/communication/http";
import { listTemplates, createTemplate } from "@/lib/communication/service";

// GET /api/v1/schools/[code]/communication/templates
export const GET = withAuth(
  validate({ query: queryTemplatesSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }) => {
    const templates = await listTemplates(auth.tenant.tenantId, query);
    return ok(templates);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);

// POST /api/v1/schools/[code]/communication/templates
export const POST = withAuth(
  validate({ body: createTemplateSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    try {
      const template = await createTemplate(auth.tenant.tenantId, body);
      return ok(template, {}, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create template";
      return fail(message, 400);
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN],
  },
);
