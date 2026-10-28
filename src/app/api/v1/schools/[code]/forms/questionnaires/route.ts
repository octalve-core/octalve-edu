import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { readJsonBody, validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type TenantAuthContext } from "@/lib/auth/with-auth";
import { FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { createQuestionnaire, listQuestionnairesForStaff } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";
import { FormStatus, FormAudienceKind, BankQuestionType, Permission } from "@prisma/client";

const Query = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED", "ALL"]).optional(),
});
type QueryParsed = Parsed<undefined, z.infer<typeof Query>>;

const QuestionnaireQuestion = z.object({
  prompt: z.string().trim().min(1).max(20000),
  questionType: z.enum(["SINGLE", "MULTI", "TRUE_FALSE", "SHORT", "RATING", "TEXT"]).optional(),
  options: z.unknown().optional(),
  sortOrder: z.number().int().optional(),
});

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000).optional().nullable(),
  isAnonymous: z.boolean().optional(),
  audienceKind: z.enum(["MEMBERS", "PUBLIC"]).optional(),
  roles: z.array(z.string()).optional(),
  classGroupIds: z.array(z.string()).optional(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  questions: z.array(QuestionnaireQuestion).min(1),
});

export const GET = withAuth(
  validate({ query: Query }, async (_req, auth: TenantAuthContext, _ctx: unknown, { query }: QueryParsed) => {
    try {
      const forms = await auth.tenant.run(async (tx) => {
        return listQuestionnairesForStaff(tx, {
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
  { tenant: true, roles: FORM_STAFF_ROLES, permissions: [Permission.CAN_VIEW_FORM_RESULTS], area: "academics" },
);

export const POST = withAuth(
  async (req, auth: TenantAuthContext) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = CreateBody.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message || "Invalid questionnaire payload", 400, "VALIDATION");
    }

    try {
      const result = await auth.tenant.run(async (tx) => {
        return createQuestionnaire(tx, {
          tenantId: auth.tenant.tenantId,
          campusId: auth.tenant.campusId,
          userId: auth.userId,
          title: parsed.data.title,
          instructions: parsed.data.instructions,
          isAnonymous: parsed.data.isAnonymous,
          audienceKind: parsed.data.audienceKind as FormAudienceKind | undefined,
          roles: parsed.data.roles,
          classGroupIds: parsed.data.classGroupIds,
          opensAt: parsed.data.opensAt,
          closesAt: parsed.data.closesAt,
          questions: parsed.data.questions as Array<{
            prompt: string;
            questionType?: BankQuestionType;
            options?: unknown;
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
