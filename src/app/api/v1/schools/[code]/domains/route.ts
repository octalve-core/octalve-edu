import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { listCustomDomains, addCustomDomain } from "@/lib/domains/service";

const addDomainSchema = z.strictObject({
  domain: z.string().trim().min(4, "Domain is required."),
});

// GET /api/v1/schools/[code]/domains
export const GET = withAuth(
  async (_req, auth: TenantAuthContext) => {
    const domains = await listCustomDomains(auth.tenant.tenantId);
    return ok({ domains });
  },
  {
    tenant: true,
    area: "settings",
    roles: [Role.ADMIN],
  },
);

// POST /api/v1/schools/[code]/domains
export const POST = withAuth(
  validate({ body: addDomainSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    try {
      const customDomain = await addCustomDomain(auth.tenant.tenantId, body.domain);
      return ok({ customDomain }, {}, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to register custom domain";
      return fail(message, 400, "BAD_REQUEST");
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN],
  },
);
