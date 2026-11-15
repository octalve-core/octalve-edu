import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { announcementAudience } from "@/lib/auth/campus-scope";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { createBroadcastSchema } from "@/lib/communication/http";
import { createBroadcast } from "@/lib/communication/service";

// POST /api/v1/schools/[code]/communication/broadcast
export const POST = withAuth(
  validate({ body: createBroadcastSchema }, async (_req, auth: TenantAuthContext, _ctx: unknown, { body }) => {
    // The campus (task 0068): a campus administrator reaches their own campus and no other (the default when none is named; another campus is 403, a class arm of another campus 404). The school's
    // administrator is unchanged. An empty campus means "no campus chosen", never a campus.
    const audience = await announcementAudience(
      auth,
      { campusId: body.campusId || undefined, classArmId: body.classArmId || undefined },
      "create",
    );
    if (audience instanceof Response) return audience;
    try {
      const result = await createBroadcast(auth.tenant.tenantId, auth.userId, { ...body, campusId: audience.campusId ?? undefined });
      return ok(result, {}, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Broadcast failed";
      return fail(message, 400);
    }
  }),
  {
    tenant: true,
    roles: [Role.ADMIN, Role.CAMPUS_ADMIN],
  },
);
