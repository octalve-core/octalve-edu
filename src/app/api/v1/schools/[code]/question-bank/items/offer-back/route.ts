import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, failure } from "@/lib/question-bank/items-http";
import { offerBackItem } from "@/lib/question-bank/items-service";
import { idSchema } from "@/lib/question-bank/validation";

const OfferBackSchema = z.object({
  quizQuestionId: z.string().min(1),
  campusId: idSchema.optional().nullable(),
  subjectLabel: z.string().trim().max(80).optional(),
  topic: z.string().trim().max(80).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = OfferBackSchema.safeParse(read.json);
    if (!parsed.success) {
      return fail("Invalid offer-back payload.", 400, "VALIDATION");
    }

    const { quizQuestionId, campusId, subjectLabel, topic, difficulty } = parsed.data;
    const targetCampus = campusId === undefined ? auth.tenant.campusId : campusId;

    const result = await offerBackItem(auth.tenant, {
      userId: auth.userId,
      quizQuestionId,
      campusId: targetCampus,
      subjectLabel,
      topic,
      difficulty,
    });

    if (!result.ok) return failure(result);
    return ok({ item: result.item }, {}, 201);
  },
  { tenant: true, roles: BANK_STAFF_ROLES },
);
