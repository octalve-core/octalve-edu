import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { isPlausibleId } from "@/lib/academics/http";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { requireFreshProof } from "@/lib/question-bank/http";
import { callerOf, promotionCall } from "@/lib/promotion/http";
import { undoPromotion } from "@/lib/promotion/undo";
import { undoPromotionSchema } from "@/lib/promotion/validation";

type Ctx = { params: Promise<{ code: string; id: string }> };

// POST /api/v1/schools/[code]/academics/promotion/batches/[id]/undo { reason, stepUp }                                                                      (task 0040)
// Takes back a roll that was a mistake, as a new recorded fact (the roll itself is never edited): every pupil's place in the source session goes back to ACTIVE and the new place a promotion or a
// repeat made becomes CANCELLED. The school's administrator only, with a fresh re-authentication (`stepUp`) and a reason of 1 to 500 characters. WHOLE ROLL OR NOTHING: 409 `UNDO_BLOCKED` with a
// line for each pupil whose place has been changed or used since (marks, a remark on a card, an invoice, attendance in the target session) and nothing is changed; 409 `ALREADY_UNDONE` for a roll
// that was undone before; 404 for a roll that is not there or is another school's. State-changing, so it declares no support `area`.
export const POST = withAuth(
  validate({ body: undoPromotionSchema }, async (_req, auth: TenantAuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return fail("That roll was not found.", 404, "NOT_FOUND");
    const proof = await requireFreshProof(auth, body.stepUp);
    if (!proof.ok) return proof.response;
    return promotionCall(async () =>
      ok({ reversal: await auth.tenant.run((tx) => undoPromotion(tx, auth.tenant.tenantId, callerOf(auth), id, body.reason)) }),
    );
  }),
  { tenant: true, roles: ["ADMIN"] },
);
