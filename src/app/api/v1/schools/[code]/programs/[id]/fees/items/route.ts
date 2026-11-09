import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROLES, respond } from "@/lib/programs/http";
import { createFeeItem, listFeeItems } from "@/lib/programs/fees-service";
import { createFeeItemSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** GET /api/v1/schools/[code]/programs/[id]/fees/items - the program's fees (a school's administrator, a program admin, or - read only - a campus administrator), and whether fees are on. */
export const GET = withAuth(
  async (_req, auth: TenantAuthContext, { params }: Ctx) => respond(await listFeeItems(auth, (await params).id)),
  {
    tenant: true,
    roles: PROGRAM_ROLES,
  },
);

/**
 * POST /api/v1/schools/[code]/programs/[id]/fees/items { name, amount, frequency?, dueDay?, audience?, discountPercent?, billedTo?, exemptIds? }
 * Makes a fee. A school's administrator or a program admin; 409 `FEES_OFF`, `TOO_MANY` (200).
 */
export const POST = withAuth(
  validate({ body: createFeeItemSchema }, async (_req, auth: TenantAuthContext, { params }: Ctx, { body }) =>
    respond(await createFeeItem(auth, (await params).id, body), 201),
  ),
  { tenant: true, roles: PROGRAM_ROLES },
);
