import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { updateTemplateSchema } from "@/lib/communication/http";
import { getTemplate, updateTemplate } from "@/lib/communication/service";

type Ctx = { params: Promise<{ code: string; id: string }> };

// GET /api/v1/schools/[code]/communication/templates/[id]
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    const template = await getTemplate(auth.tenant.tenantId, id);
    if (!template) {
      return fail("Template not found", 404);
    }
    return ok(template);
  },
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);

// PATCH /api/v1/schools/[code]/communication/templates/[id]
export const PATCH = withAuth(
  validate({ body: updateTemplateSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    const updated = await updateTemplate(auth.tenant.tenantId, id, body);
    if (!updated) {
      return fail("Template not found", 404);
    }
    return ok(updated);
  }),
  {
    tenant: true,
    roles: [Role.ADMIN],
  },
);
