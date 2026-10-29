import crypto from "node:crypto";
import { forShareToken, setTenantContext, type Tx } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { MfaUnavailableError } from "@/lib/auth/mfa/secret-box";
import { effectiveSettingsIn } from "@/lib/question-bank/settings-service";
import { BankQuestionType, FormKind, FormStatus, FormAudienceKind, FormResponseStatus, Prisma } from "@prisma/client";
import { campusFilter, reachForm } from "./access";
import { FormsServiceError } from "./forms-service";
import { participationCode, recordedAt } from "./participation";
import {
  validateQuestionnaireInput,
  isQuestionnaireOpen,
  isMemberEligibleForQuestionnaire,
  formatQuestionnaireQuestionsForRespondent,
  validateAndNormalizeAnswers,
  aggregateQuestionnaireAnalytics,
  withholdSmallSample,
} from "./questionnaires";

/// An anonymous questionnaire needs the school's key to make its participation codes (see participation.ts); without it nothing is stored rather than an identity.
function codeFor(form: { id: string; isAnonymous: boolean }, memberId: string): string {
  try {
    return participationCode(form, memberId);
  } catch (err) {
    if (err instanceof MfaUnavailableError) {
      throw new FormsServiceError("Anonymous questionnaires are unavailable until the school's encryption key is set.", 503, "UNAVAILABLE");
    }
    throw err;
  }
}

/// Which of `forms` the member has already answered: their participation record is under the form's code for them.
async function submittedFormIds(
  tx: Tx,
  tenantId: string,
  forms: Array<{ id: string; isAnonymous: boolean }>,
  memberId: string,
): Promise<Set<string>> {
  if (forms.length === 0) return new Set();
  const rows = await tx.formParticipation.findMany({
    where: { tenantId, OR: forms.map((f) => ({ formId: f.id, respondentId: codeFor(f, memberId) })) },
    select: { formId: true },
  });
  return new Set(rows.map((r) => r.formId));
}

/**
 * Creates a new questionnaire form.
 */
export async function createQuestionnaire(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    userId: string;
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
      options?: unknown;
      sortOrder?: number;
    }>;
  },
) {
  const validated = validateQuestionnaireInput({
    title: params.title,
    instructions: params.instructions,
    isAnonymous: params.isAnonymous,
    audienceKind: params.audienceKind,
    roles: params.roles,
    classGroupIds: params.classGroupIds,
    opensAt: params.opensAt,
    closesAt: params.closesAt,
    questions: params.questions as never,
  });

  if (!validated.ok) {
    throw new FormsServiceError(validated.message ?? "Invalid questionnaire input", 400, "VALIDATION");
  }

  const opensAt = params.opensAt ? new Date(params.opensAt) : null;
  const closesAt = params.closesAt ? new Date(params.closesAt) : null;
  const isAnonymous = params.isAnonymous ?? false;
  const audienceKind = params.audienceKind ?? FormAudienceKind.MEMBERS;
  const shareToken = crypto.randomBytes(16).toString("hex");

  const form = await tx.form.create({
    data: {
      tenantId: params.tenantId,
      campusId: params.campusId ?? null,
      kind: FormKind.QUESTIONNAIRE,
      title: params.title.trim(),
      instructions: params.instructions?.trim() ?? null,
      status: FormStatus.DRAFT,
      isAnonymous,
      shareToken,
      opensAt,
      closesAt,
      createdById: params.userId,
    },
  });

  await tx.formAudience.create({
    data: {
      tenantId: params.tenantId,
      formId: form.id,
      kind: audienceKind,
      roles: (params.roles ?? []) as never,
      classGroupIds: (params.classGroupIds ?? []) as never,
    },
  });

  await tx.formQuestion.createMany({
    data: params.questions.map((q, idx) => ({
      tenantId: params.tenantId,
      formId: form.id,
      prompt: q.prompt.trim(),
      questionType: q.questionType ?? BankQuestionType.SINGLE,
      options: (q.options ?? []) as never,
      points: 0,
      sortOrder: q.sortOrder ?? idx,
    })),
  });

  return {
    ok: true,
    formId: form.id,
    shareToken,
    title: form.title,
    isAnonymous: form.isAnonymous,
    status: form.status,
    questionCount: params.questions.length,
  };
}

/**
 * Lists questionnaires for staff members.
 */
export async function listQuestionnairesForStaff(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    status?: FormStatus | "ALL";
  },
) {
  const where: {
    tenantId: string;
    OR?: Array<{ campusId: string | null }>;
    kind: FormKind;
    status?: FormStatus;
  } = {
    tenantId: params.tenantId,
    kind: FormKind.QUESTIONNAIRE,
    ...campusFilter(params.campusId),
  };

  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }

  const forms = await tx.form.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      _count: { select: { questions: true, responses: true } },
    },
  });

  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    instructions: f.instructions,
    status: f.status,
    isAnonymous: f.isAnonymous,
    shareToken: f.shareToken,
    opensAt: f.opensAt,
    closesAt: f.closesAt,
    audience: f.audiences[0] ?? null,
    questionCount: f._count.questions,
    responseCount: f._count.responses,
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

/**
 * Gets details of a questionnaire for staff members.
 */
export async function getQuestionnaireForStaff(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
  },
) {
  if (
    !(await reachForm(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      formId: params.formId,
      access: "view",
      kind: FormKind.QUESTIONNAIRE,
    }))
  ) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId, kind: FormKind.QUESTIONNAIRE },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
      _count: { select: { responses: true } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    status: form.status,
    isAnonymous: form.isAnonymous,
    shareToken: form.shareToken,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    audience: form.audiences[0] ?? null,
    questions: form.questions,
    responseCount: form._count.responses,
    createdBy: form.createdBy,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

/**
 * Updates a questionnaire (title, audience, questions, status).
 */
export async function updateQuestionnaire(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
    title?: string;
    instructions?: string | null;
    status?: FormStatus;
    isAnonymous?: boolean;
    audienceKind?: FormAudienceKind;
    roles?: string[];
    classGroupIds?: string[];
    opensAt?: string | null;
    closesAt?: string | null;
  },
) {
  if (
    !(await reachForm(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      formId: params.formId,
      access: "manage",
      kind: FormKind.QUESTIONNAIRE,
    }))
  ) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId, kind: FormKind.QUESTIONNAIRE },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const data: {
    title?: string;
    instructions?: string | null;
    status?: FormStatus;
    isAnonymous?: boolean;
    opensAt?: Date | null;
    closesAt?: Date | null;
    closedById?: string | null;
    closedAt?: Date | null;
  } = {};

  if (params.title !== undefined) {
    const t = params.title.trim();
    if (t.length === 0 || t.length > 200) {
      throw new FormsServiceError("Title must be between 1 and 200 characters.", 400, "VALIDATION");
    }
    data.title = t;
  }

  if (params.instructions !== undefined) {
    data.instructions = params.instructions ? params.instructions.trim() : null;
  }

  if (params.isAnonymous !== undefined) {
    data.isAnonymous = params.isAnonymous;
  }

  if (params.opensAt !== undefined) {
    data.opensAt = params.opensAt ? new Date(params.opensAt) : null;
  }

  if (params.closesAt !== undefined) {
    data.closesAt = params.closesAt ? new Date(params.closesAt) : null;
  }

  if (params.status) {
    data.status = params.status;
    if (params.status === FormStatus.CLOSED) {
      data.closedById = params.userId;
      data.closedAt = new Date();
    }
  }

  const updatedForm = await tx.form.update({
    where: { id: form.id },
    data,
  });

  if (params.audienceKind || params.roles || params.classGroupIds) {
    const audienceData: {
      kind?: FormAudienceKind;
      roles?: never;
      classGroupIds?: never;
    } = {};
    if (params.audienceKind) audienceData.kind = params.audienceKind;
    if (params.roles) audienceData.roles = params.roles as never;
    if (params.classGroupIds) audienceData.classGroupIds = params.classGroupIds as never;

    await tx.formAudience.updateMany({
      where: { tenantId: params.tenantId, formId: form.id },
      data: audienceData,
    });
  }

  return {
    ok: true,
    formId: updatedForm.id,
    title: updatedForm.title,
    status: updatedForm.status,
  };
}

/**
 * Closes a questionnaire.
 */
export async function closeQuestionnaire(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
  },
) {
  return updateQuestionnaire(tx, {
    formId: params.formId,
    tenantId: params.tenantId,
    userId: params.userId,
    status: FormStatus.CLOSED,
  });
}

/**
 * Computes live aggregated analytics for questionnaire responses.
 */
export async function getQuestionnaireAnalytics(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
  },
) {
  if (
    !(await reachForm(tx, {
      tenantId: params.tenantId,
      userId: params.userId,
      formId: params.formId,
      access: "read",
      kind: FormKind.QUESTIONNAIRE,
    }))
  ) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId, kind: FormKind.QUESTIONNAIRE },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const answers = await tx.formAnswer.findMany({
    where: { tenantId: params.tenantId, response: { formId: form.id } },
    select: {
      formQuestionId: true,
      value: true,
    },
  });
  // The number of people who answered, not the most answers any one question has: a pupil may leave questions blank, and the threshold below is about people.
  const responses = await tx.formResponse.count({
    where: { tenantId: params.tenantId, formId: form.id, status: FormResponseStatus.COMPLETED },
  });
  const settings = await effectiveSettingsIn(tx, params.tenantId, form.campusId ?? null);

  const analytics = aggregateQuestionnaireAnalytics({
    formId: form.id,
    title: form.title,
    isAnonymous: form.isAnonymous,
    status: form.status,
    questions: form.questions,
    answers,
  });
  return withholdSmallSample({ ...analytics, totalResponses: responses }, settings["bank.smallSummary.min"]);
}

/**
 * Lists available questionnaires for a pupil.
 */
export async function listAvailableQuestionnairesForPupil(
  tx: Tx,
  params: {
    studentId: string;
    tenantId: string;
  },
) {
  const enrollment = await tx.studentEnrollment.findFirst({
    where: { studentId: params.studentId, tenantId: params.tenantId, status: "ACTIVE" },
    orderBy: { enrolledAt: "desc" },
    include: { classArm: { select: { classGroupId: true } } },
  });

  const pupilClassGroupId = enrollment?.classArm?.classGroupId ?? null;

  const forms = await tx.form.findMany({
    where: {
      tenantId: params.tenantId,
      kind: FormKind.QUESTIONNAIRE,
      status: FormStatus.PUBLISHED,
    },
    orderBy: { createdAt: "desc" },
    include: {
      audiences: true,
      _count: { select: { questions: true } },
    },
  });

  const now = new Date();
  const open = forms.filter((f) => {
    const openCheck = isQuestionnaireOpen(f, now);
    if (!openCheck.isOpen) return false;
    const audience = f.audiences[0];
    if (!audience) return true;
    return isMemberEligibleForQuestionnaire(audience, "STUDENT", pupilClassGroupId);
  });
  const answered = await submittedFormIds(tx, params.tenantId, open, params.studentId);
  return open.map((f) => ({
    id: f.id,
    title: f.title,
    instructions: f.instructions,
    isAnonymous: f.isAnonymous,
    questionCount: f._count.questions,
    opensAt: f.opensAt,
    closesAt: f.closesAt,
    hasSubmitted: answered.has(f.id),
  }));
}

/**
 * Retrieves a questionnaire for a respondent.
 */
export async function getQuestionnaireForMember(
  tx: Tx,
  params: {
    formId: string;
    memberId: string;
    memberRole?: string | null;
    classGroupId?: string | null;
    tenantId: string;
  },
) {
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId, kind: FormKind.QUESTIONNAIRE },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError(
      openCheck.reason === "NOT_YET_OPEN" ? "This questionnaire is not open yet." : "This questionnaire is closed.",
      403,
      openCheck.reason,
    );
  }

  const audience = form.audiences[0];
  if (audience && !isMemberEligibleForQuestionnaire(audience, params.memberRole, params.classGroupId)) {
    throw new FormsServiceError("You are not eligible for this questionnaire.", 403, "FORBIDDEN");
  }

  const hasSubmitted = (await submittedFormIds(tx, params.tenantId, [form], params.memberId)).has(form.id);
  const formattedQuestions = formatQuestionnaireQuestionsForRespondent(form.questions);

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    isAnonymous: form.isAnonymous,
    hasSubmitted,
    questions: formattedQuestions,
  };
}

/**
 * Submits member responses to a questionnaire. Enforces one response per member.
 */
export async function submitQuestionnaireForMember(
  tx: Tx,
  params: {
    formId: string;
    memberId: string;
    isStudent?: boolean;
    memberRole?: string | null;
    classGroupId?: string | null;
    tenantId: string;
    answers: Array<{ formQuestionId: string; value: unknown }>;
  },
) {
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId, kind: FormKind.QUESTIONNAIRE },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This questionnaire is closed.", 403, openCheck.reason);
  }

  let classGroupId = params.classGroupId;
  if (!classGroupId && params.memberRole === "STUDENT") {
    const enrollment = await tx.studentEnrollment.findFirst({
      where: { studentId: params.memberId, tenantId: params.tenantId, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
      include: { classArm: { select: { classGroupId: true } } },
    });
    classGroupId = enrollment?.classArm?.classGroupId ?? null;
  }

  const audience = form.audiences[0];
  if (audience && !isMemberEligibleForQuestionnaire(audience, params.memberRole, classGroupId)) {
    throw new FormsServiceError("You are not eligible for this questionnaire.", 403, "FORBIDDEN");
  }

  // What the participation record holds in place of the member: their own id, or on an anonymous questionnaire a code that cannot be turned back into them (participation.ts).
  const code = codeFor(form, params.memberId);
  const alreadyParticipated = await tx.formParticipation.findFirst({
    where: { tenantId: params.tenantId, formId: form.id, respondentId: code },
  });
  if (alreadyParticipated) {
    throw new FormsServiceError("You have already submitted this questionnaire.", 400, "ALREADY_SUBMITTED");
  }

  // Validate answers
  const validation = validateAndNormalizeAnswers(form.questions, params.answers);
  if (!validation.ok || !validation.normalizedAnswers) {
    throw new FormsServiceError(validation.message ?? "Invalid answer submission.", 400, "VALIDATION");
  }

  const normalizedAnswers = validation.normalizedAnswers;
  const submittedAt = new Date();
  // Anonymity: on an anonymous questionnaire the three records carry the day only, so none can be matched to another by the instant.
  const at = recordedAt(form, submittedAt);

  // Anonymity: if form.isAnonymous is true, response respondentId & studentId are null
  const respondentId = form.isAnonymous ? null : params.memberId;
  const studentId = form.isAnonymous ? null : params.isStudent ? params.memberId : null;

  // 1. Record participation for deduplication. The unique index (school, form, respondent) is the real guard: two answers sent together both pass the check above, and the second
  //    one's insert waits for the first and then fails; that is "already submitted" (a 400), not a server error.
  try {
    await tx.formParticipation.create({
      data: { tenantId: params.tenantId, formId: form.id, respondentId: code, createdAt: at },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new FormsServiceError("You have already submitted this questionnaire.", 400, "ALREADY_SUBMITTED");
    }
    throw err;
  }

  // 2. Record response session
  const response = await tx.formResponse.create({
    data: {
      tenantId: params.tenantId,
      campusId: form.campusId ?? null,
      formId: form.id,
      respondentId,
      studentId,
      status: FormResponseStatus.COMPLETED,
      startedAt: at,
      submittedAt: at,
    },
  });

  // 3. Record answers
  await tx.formAnswer.createMany({
    data: normalizedAnswers.map((na) => ({
      tenantId: params.tenantId,
      responseId: response.id,
      formQuestionId: na.formQuestionId,
      value: na.value as never,
      createdAt: at,
    })),
  });

  return {
    ok: true,
    formId: form.id,
    isAnonymous: form.isAnonymous,
    submittedAt,
  };
}

const SHARE_TOKEN = /^[0-9a-f]{32}$/;
const PUBLIC_NOT_FOUND = () => new FormsServiceError("Questionnaire not found or not publicly available.", 404, "NOT_FOUND");

/**
 * Runs `fn` for the public questionnaire a link names, in the SCHOOL's context.
 *
 * A link carries no session, so there is no school until the token has been looked up. The lookup runs in the share context (it can read exactly the one published questionnaire
 * whose token the caller holds, nothing else); from the row it found the school context is set, like an accepted invitation, and the questions and the answer are read and written
 * under the ordinary school policies. The school in the address (`code`) must be the school that owns the survey, and a suspended school has no public surveys: both are the same
 * "not found" as an unknown token, so a link says nothing about what it is not.
 */
async function withPublicQuestionnaire<T>(
  code: string,
  token: string,
  fn: (tx: Tx, form: Prisma.FormGetPayload<{ include: { audiences: true; questions: true } }>) => Promise<T>,
): Promise<T> {
  if (!SHARE_TOKEN.test(token)) throw PUBLIC_NOT_FOUND();
  return forShareToken(token).transaction(async (tx) => {
    const found = await tx.form.findUnique({ where: { shareToken: token }, select: { id: true, tenantId: true } });
    if (!found) throw PUBLIC_NOT_FOUND();

    // From here the school is the one the survey names (the token is a 128-bit secret that only its owner shared).
    await setTenantContext(tx, trustedTenantId(found.tenantId));
    const school = await tx.tenant.findUnique({ where: { id: found.tenantId }, select: { code: true, suspendedAt: true } });
    if (!school || school.suspendedAt || school.code !== code) throw PUBLIC_NOT_FOUND();

    const form = await tx.form.findFirst({
      where: { id: found.id, tenantId: found.tenantId, kind: FormKind.QUESTIONNAIRE, status: FormStatus.PUBLISHED },
      include: { audiences: true, questions: { orderBy: { sortOrder: "asc" } } },
    });
    if (!form) throw PUBLIC_NOT_FOUND();

    const audience = form.audiences[0];
    if (audience && audience.kind !== FormAudienceKind.PUBLIC) {
      throw new FormsServiceError("This questionnaire is restricted to authenticated school members.", 403, "RESTRICTED");
    }
    const openCheck = isQuestionnaireOpen(form);
    if (!openCheck.isOpen) {
      throw new FormsServiceError("This questionnaire is closed.", 403, openCheck.reason);
    }
    return fn(tx, form);
  });
}

/**
 * Retrieves a public questionnaire via shareToken.
 */
export async function getPublicQuestionnaireByToken(code: string, token: string) {
  return withPublicQuestionnaire(code, token, async (_tx, form) => ({
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    isAnonymous: form.isAnonymous,
    questions: formatQuestionnaireQuestionsForRespondent(form.questions),
  }));
}

/**
 * Submits answers to a public questionnaire via shareToken.
 */
export async function submitPublicQuestionnaire(params: {
  code: string;
  token: string;
  answers: Array<{ formQuestionId: string; value: unknown }>;
}) {
  return withPublicQuestionnaire(params.code, params.token, async (tx, form) => {
    const validation = validateAndNormalizeAnswers(form.questions, params.answers);
    if (!validation.ok || !validation.normalizedAnswers) {
      throw new FormsServiceError(validation.message ?? "Invalid answer submission.", 400, "VALIDATION");
    }

    const submittedAt = new Date();
    const at = recordedAt(form, submittedAt);

    const response = await tx.formResponse.create({
      data: {
        tenantId: form.tenantId,
        campusId: form.campusId ?? null,
        formId: form.id,
        respondentId: null,
        studentId: null,
        status: FormResponseStatus.COMPLETED,
        startedAt: at,
        submittedAt: at,
      },
    });

    await tx.formAnswer.createMany({
      data: validation.normalizedAnswers.map((na) => ({
        tenantId: form.tenantId,
        responseId: response.id,
        formQuestionId: na.formQuestionId,
        value: na.value as never,
        createdAt: at,
      })),
    });

    return {
      ok: true,
      formId: form.id,
      responseId: response.id,
      submittedAt,
    };
  });
}
