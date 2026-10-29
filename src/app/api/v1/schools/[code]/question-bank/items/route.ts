import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody, validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, failure } from "@/lib/question-bank/items-http";
import { createItem, listItems, LIST_MAX } from "@/lib/question-bank/items-service";
import { idSchema } from "@/lib/question-bank/validation";

// The question bank's questions (task 0024 slice C). Who may call is decided in the services by `rules.ts`; the route only checks the shape of the request. NO `area`: a
// platform administrator's support view reaches none of it (parity note section 5).

const Query = z.object({
  campusId: idSchema.optional(),
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "RETIRED"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  subjectKey: z.string().trim().min(1).max(80).optional(),
  classTagKey: z.string().trim().min(1).max(40).optional(),
  mine: z.enum(["1", "true"]).optional(),
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX).optional(),
});
type ListParsed = Parsed<undefined, z.infer<typeof Query>>;

/// GET /api/v1/schools/[code]/question-bank/items?campusId=&status=&q=&subjectKey=&classTagKey=&mine=1&cursor=&limit=
/// A page of the questions the caller may see, newest first. Every row has passed `staffMaySee`; a draft is its writer's alone.
export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: ListParsed) => {
    const { mine, ...rest } = query;
    const page = await listItems(auth.tenant, { userId: auth.userId, query: { ...rest, mine: mine !== undefined } });
    return ok({ items: page.items }, { nextCursor: page.nextCursor });
  }),
  { tenant: true, roles: BANK_STAFF_ROLES },
);

/// POST /api/v1/schools/[code]/question-bank/items  { campusId?, type, prompt, ... }  A new question, saved as a DRAFT only its writer sees. `campusId` defaults to the campus the
/// caller belongs to (none for a school-wide membership). The rest of the body is `parseItem`'s.
export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const { campusId, ...item } = (read.json && typeof read.json === "object" && !Array.isArray(read.json) ? read.json : {}) as Record<string, unknown>;
    let where: string | null;
    if (campusId === undefined) where = auth.tenant.campusId;
    else if (campusId === null) where = null;
    else {
      const parsed = idSchema.safeParse(campusId);
      if (!parsed.success) return fail("Choose the campus the question is for.", 400, "VALIDATION");
      where = parsed.data;
    }
    const result = await createItem(auth.tenant, { userId: auth.userId, campusId: where, body: item });
    if (!result.ok) return failure(result);
    return ok({ item: result.item }, {}, 201);
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
