import { BankQuestionType, FormAudienceKind, FormStatus } from "@prisma/client";

export interface QuestionnaireInput {
  title: string;
  instructions?: string | null;
  isAnonymous?: boolean;
  audienceKind?: FormAudienceKind;
  roles?: string[];
  classGroupIds?: string[];
  opensAt?: string | null;
  closesAt?: string | null;
  questions: Array<{
    prompt: string;
    questionType?: BankQuestionType;
    options?: Array<{ id: string; text: string }>;
    sortOrder?: number;
  }>;
}

export interface FormQuestionItem {
  id: string;
  prompt: string;
  questionType: BankQuestionType;
  options: unknown;
  sortOrder: number;
}

export interface FormSubmissionAnswer {
  formQuestionId: string;
  value: unknown;
}

export interface OptionDistribution {
  optionId: string;
  label: string;
  count: number;
  percentage: number;
}

export interface QuestionAnalyticsItem {
  formQuestionId: string;
  prompt: string;
  questionType: BankQuestionType;
  totalAnswers: number;
  optionCounts?: OptionDistribution[];
  textResponses?: string[];
}

export interface QuestionnaireAnalytics {
  formId: string;
  title: string;
  totalResponses: number;
  isAnonymous: boolean;
  status: FormStatus;
  questions: QuestionAnalyticsItem[];
  /// True when the breakdown was held back because too few people answered an anonymous questionnaire (see `withholdSmallSample`).
  suppressed?: boolean;
  /// With `suppressed`: how many answers it takes before a breakdown is shown.
  minimumResponses?: number;
}

/**
 * Validates questionnaire creation or update input.
 */
export function validateQuestionnaireInput(input: QuestionnaireInput): {
  ok: boolean;
  message?: string;
} {
  const title = input.title?.trim();
  if (!title || title.length === 0) {
    return { ok: false, message: "Questionnaire title is required." };
  }
  if (title.length > 200) {
    return { ok: false, message: "Title cannot exceed 200 characters." };
  }

  if (input.instructions && input.instructions.trim().length > 5000) {
    return { ok: false, message: "Instructions cannot exceed 5000 characters." };
  }

  if (input.opensAt && input.closesAt) {
    const openDate = new Date(input.opensAt);
    const closeDate = new Date(input.closesAt);
    if (isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) {
      return { ok: false, message: "Invalid date format for schedule window." };
    }
    if (openDate >= closeDate) {
      return { ok: false, message: "Opening time must be earlier than closing time." };
    }
  }

  if (!input.questions || !Array.isArray(input.questions) || input.questions.length === 0) {
    return { ok: false, message: "A questionnaire must have at least one question." };
  }

  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i]!;
    const prompt = q.prompt?.trim();
    if (!prompt || prompt.length === 0) {
      return { ok: false, message: `Question #${i + 1} prompt cannot be empty.` };
    }
    if (prompt.length > 20000) {
      return { ok: false, message: `Question #${i + 1} prompt exceeds maximum length.` };
    }

    const type = q.questionType ?? BankQuestionType.SINGLE;
    if (type === BankQuestionType.SINGLE || type === BankQuestionType.MULTI) {
      if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
        return {
          ok: false,
          message: `Question #${i + 1} (${type}) must provide at least two choice options.`,
        };
      }
      for (const opt of q.options) {
        if (!opt.id || !opt.text || opt.text.trim().length === 0) {
          return {
            ok: false,
            message: `Question #${i + 1} contains an option with missing id or empty text.`,
          };
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Checks whether a questionnaire is currently active and open for submissions.
 */
export function isQuestionnaireOpen(
  form: {
    status: FormStatus;
    opensAt?: Date | null;
    closesAt?: Date | null;
  },
  now: Date = new Date(),
): { isOpen: boolean; reason?: "NOT_PUBLISHED" | "NOT_YET_OPEN" | "CLOSED" } {
  if (form.status !== FormStatus.PUBLISHED) {
    return { isOpen: false, reason: "NOT_PUBLISHED" };
  }

  if (form.opensAt && now < form.opensAt) {
    return { isOpen: false, reason: "NOT_YET_OPEN" };
  }

  if (form.closesAt && now > form.closesAt) {
    return { isOpen: false, reason: "CLOSED" };
  }

  return { isOpen: true };
}

/**
 * Checks whether a user/member is eligible to access and respond to the questionnaire.
 */
export function isMemberEligibleForQuestionnaire(
  audience: {
    kind: FormAudienceKind;
    roles?: unknown;
    classGroupIds?: unknown;
  },
  memberRole?: string | null,
  classGroupId?: string | null,
): boolean {
  if (audience.kind === FormAudienceKind.PUBLIC) {
    return true;
  }

  const allowedRoles = Array.isArray(audience.roles) ? (audience.roles as string[]) : [];
  if (allowedRoles.length > 0) {
    if (!memberRole || !allowedRoles.includes(memberRole)) {
      return false;
    }
  }

  // If student and specific class groups are targeted
  if (memberRole === "STUDENT") {
    const targetedClassGroups = Array.isArray(audience.classGroupIds) ? (audience.classGroupIds as string[]) : [];
    if (targetedClassGroups.length > 0) {
      if (!classGroupId || !targetedClassGroups.includes(classGroupId)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Formats questionnaire questions for respondents.
 */
export function formatQuestionnaireQuestionsForRespondent(
  questions: Array<{
    id: string;
    prompt: string;
    questionType: BankQuestionType;
    options: unknown;
    sortOrder: number;
  }>,
) {
  return [...questions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q) => ({
      id: q.id,
      prompt: q.prompt,
      questionType: q.questionType,
      options: q.options,
      sortOrder: q.sortOrder,
    }));
}

/**
 * Evaluates and normalizes submitted questionnaire answers.
 */
export function validateAndNormalizeAnswers(
  questions: FormQuestionItem[],
  submittedAnswers: FormSubmissionAnswer[],
): {
  ok: boolean;
  message?: string;
  normalizedAnswers?: Array<{ formQuestionId: string; value: unknown }>;
} {
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const normalized: Array<{ formQuestionId: string; value: unknown }> = [];

  for (const ans of submittedAnswers) {
    const question = questionMap.get(ans.formQuestionId);
    if (!question) continue;

    let value = ans.value;
    if (question.questionType === BankQuestionType.SINGLE) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return { ok: false, message: `Answer for single choice question '${question.prompt}' must be a string.` };
      }
      value = value.trim();
    } else if (question.questionType === BankQuestionType.MULTI) {
      if (!Array.isArray(value)) {
        return { ok: false, message: `Answer for multiple choice question '${question.prompt}' must be an array.` };
      }
      value = value.map((v) => String(v).trim()).filter(Boolean);
    } else if (question.questionType === BankQuestionType.TRUE_FALSE) {
      if (typeof value === "boolean") {
        value = value ? "true" : "false";
      } else if (typeof value === "string") {
        const lower = value.trim().toLowerCase();
        value = lower === "true" || lower === "yes" || lower === "1" ? "true" : "false";
      } else {
        return { ok: false, message: `Answer for question '${question.prompt}' must be boolean.` };
      }
    } else if (question.questionType === BankQuestionType.SHORT) {
      if (typeof value === "string") {
        value = value.trim().slice(0, 5000);
      } else if (value === null || value === undefined) {
        value = "";
      } else {
        value = String(value).trim().slice(0, 5000);
      }
    }

    normalized.push({
      formQuestionId: question.id,
      value,
    });
  }

  return { ok: true, normalizedAnswers: normalized };
}

/**
 * Aggregates questionnaire responses for analytical overview.
 */
export function aggregateQuestionnaireAnalytics(params: {
  formId: string;
  title: string;
  isAnonymous: boolean;
  status: FormStatus;
  questions: FormQuestionItem[];
  answers: Array<{
    formQuestionId: string;
    value: unknown;
  }>;
}): QuestionnaireAnalytics {
  const { formId, title, isAnonymous, status, questions, answers } = params;

  // Group answers by formQuestionId
  const answersByQuestion = new Map<string, unknown[]>();
  for (const q of questions) {
    answersByQuestion.set(q.id, []);
  }
  for (const ans of answers) {
    const list = answersByQuestion.get(ans.formQuestionId);
    if (list) {
      list.push(ans.value);
    }
  }

  // Count total distinct submissions if any answers present
  const totalSubmissions = Math.max(...Array.from(answersByQuestion.values()).map((list) => list.length), 0);

  const questionAnalytics: QuestionAnalyticsItem[] = questions
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q) => {
      const qAnswers = answersByQuestion.get(q.id) ?? [];
      const totalAnswers = qAnswers.length;

      if (
        q.questionType === BankQuestionType.SINGLE ||
        q.questionType === BankQuestionType.TRUE_FALSE ||
        q.questionType === BankQuestionType.MULTI
      ) {
        // Collect defined options
        let optionsList: Array<{ id: string; text: string }> = [];
        if (q.questionType === BankQuestionType.TRUE_FALSE) {
          optionsList = [
            { id: "true", text: "True" },
            { id: "false", text: "False" },
          ];
        } else if (Array.isArray(q.options)) {
          optionsList = q.options as Array<{ id: string; text: string }>;
        }

        const counts = new Map<string, number>();
        for (const opt of optionsList) {
          counts.set(opt.id, 0);
        }

        // Tally votes
        for (const val of qAnswers) {
          if (Array.isArray(val)) {
            for (const item of val) {
              const str = String(item);
              counts.set(str, (counts.get(str) ?? 0) + 1);
            }
          } else if (val !== null && val !== undefined) {
            const str = String(val);
            counts.set(str, (counts.get(str) ?? 0) + 1);
          }
        }

        const optionCounts: OptionDistribution[] = optionsList.map((opt) => {
          const count = counts.get(opt.id) ?? 0;
          const percentage = totalAnswers > 0 ? Math.round((count / totalAnswers) * 1000) / 10 : 0;
          return {
            optionId: opt.id,
            label: opt.text,
            count,
            percentage,
          };
        });

        return {
          formQuestionId: q.id,
          prompt: q.prompt,
          questionType: q.questionType,
          totalAnswers,
          optionCounts,
        };
      }

      // Free text questions
      const textResponses = qAnswers
        .map((val) => (typeof val === "string" ? val.trim() : String(val).trim()))
        .filter((val) => val.length > 0);

      return {
        formQuestionId: q.id,
        prompt: q.prompt,
        questionType: q.questionType,
        totalAnswers,
        textResponses,
      };
    });

  return {
    formId,
    title,
    isAnonymous,
    status,
    totalResponses: totalSubmissions,
    questions: questionAnalytics,
  };
}

/// The results of an ANONYMOUS questionnaire with fewer answers than `minimum` (the switch bank.smallSummary.min, never below 3) say too much: with two answers in a class of thirty,
/// "one said yes and one said no" tells each of them what the other answered. Below the minimum every question keeps its text and nothing else; at or above it the analytics are
/// returned as they are. A questionnaire that is not anonymous is never withheld.
export function withholdSmallSample(analytics: QuestionnaireAnalytics, minimum: number): QuestionnaireAnalytics {
  if (!analytics.isAnonymous || analytics.totalResponses >= minimum) return analytics;
  return {
    ...analytics,
    suppressed: true,
    minimumResponses: minimum,
    questions: analytics.questions.map((q) => ({
      formQuestionId: q.formQuestionId,
      prompt: q.prompt,
      questionType: q.questionType,
      totalAnswers: 0,
    })),
  };
}
