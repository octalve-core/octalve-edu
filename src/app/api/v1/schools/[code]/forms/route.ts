import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody, validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { BANK_STAFF_ROLES, FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { createPracticeSet, listPracticeSetsForStaff, FormsServiceError } from "@/lib/forms/forms-service";
import { FormStatus, BankQuestionType } from "@prisma/client";

const Query = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED", "ALL"]).optional(),
});
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

const QuestionInput = z.object({
  sourceItemId: z.string().optional(),
  prompt: z.string().optional(),
  questionType: z.enum(["SINGLE", "MULTI", "TRUE_FALSE", "SHORT", "RATING", "TEXT"]).optional(),
  options: z.unknown().optional(),
  correctAnswer: z.string().optional(),
  explanation: z.string().optional(),
  points: z.number().int().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000).optional(),
  opensAt: z.string().optional(),
  closesAt: z.string().optional(),
  maxDurationMinutes: z.number().int().min(1).max(1440).optional(),
  classGroupIds: z.array(z.string()).optional(),
  questions: z.array(QuestionInput).min(1),
});

export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    try {
      const forms = await auth.tenant.run(async (tx) => {
        return listPracticeSetsForStaff(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          status: query.status as FormStatus | "ALL" | undefined,
        });
      });
      return ok({ forms });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  }),
  { tenant: true, roles: BANK_STAFF_ROLES, area: "academics" },
);

export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = CreateBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid form payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return createPracticeSet(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          title: parsed.data.title,
          instructions: parsed.data.instructions,
          opensAt: parsed.data.opensAt,
          closesAt: parsed.data.closesAt,
          maxDurationMinutes: parsed.data.maxDurationMinutes,
          classGroupIds: parsed.data.classGroupIds,
          questions: parsed.data.questions as Array<{
            sourceItemId?: string;
            prompt?: string;
            questionType?: BankQuestionType;
            options?: unknown;
            correctAnswer?: string;
            explanation?: string;
            points?: number;
            sortOrder?: number;
          }>,
        });
      });
      return ok(result, {}, 201);
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      throw err;
    }
  },
  { tenant: true, roles: FORM_STAFF_ROLES },
);
