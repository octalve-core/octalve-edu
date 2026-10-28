import crypto from "node:crypto";
import type { Tx } from "@/lib/tenant/for-tenant";
import { prisma } from "@/lib/db";
import { BankQuestionType, FormKind, FormStatus, FormAudienceKind, FormResponseStatus } from "@prisma/client";
import { FormsServiceError } from "./forms-service";
import {
  validateQuestionnaireInput,
  isQuestionnaireOpen,
  isMemberEligibleForQuestionnaire,
  formatQuestionnaireQuestionsForRespondent,
  validateAndNormalizeAnswers,
  aggregateQuestionnaireAnalytics,
} from "./questionnaires";

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
    campusId?: string | null;
    kind: FormKind;
    status?: FormStatus;
  } = {
    tenantId: params.tenantId,
    kind: FormKind.QUESTIONNAIRE,
  };

  if (params.campusId) {
    where.campusId = params.campusId;
  }

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
  },
) {
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
  },
) {
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

  return aggregateQuestionnaireAnalytics({
    formId: form.id,
    title: form.title,
    isAnonymous: form.isAnonymous,
    status: form.status,
    questions: form.questions,
    answers,
  });
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
      participations: {
        where: { respondentId: params.studentId },
        select: { id: true, createdAt: true },
      },
    },
  });

  const now = new Date();
  return forms
    .filter((f) => {
      const openCheck = isQuestionnaireOpen(f, now);
      if (!openCheck.isOpen) return false;
      const audience = f.audiences[0];
      if (!audience) return true;
      return isMemberEligibleForQuestionnaire(audience, "STUDENT", pupilClassGroupId);
    })
    .map((f) => ({
      id: f.id,
      title: f.title,
      instructions: f.instructions,
      isAnonymous: f.isAnonymous,
      questionCount: f._count.questions,
      opensAt: f.opensAt,
      closesAt: f.closesAt,
      hasSubmitted: f.participations.length > 0,
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
      participations: {
        where: { respondentId: params.memberId },
        select: { id: true, createdAt: true },
      },
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

  const hasSubmitted = form.participations.length > 0;
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

  // Deduplication check: verify member has not already submitted
  const alreadyParticipated = await tx.formParticipation.findFirst({
    where: {
      tenantId: params.tenantId,
      formId: form.id,
      respondentId: params.memberId,
    },
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

  // Anonymity: if form.isAnonymous is true, response respondentId & studentId are null
  const respondentId = form.isAnonymous ? null : params.memberId;
  const studentId = form.isAnonymous ? null : params.isStudent ? params.memberId : null;

  // 1. Record participation for deduplication
  await tx.formParticipation.create({
    data: {
      tenantId: params.tenantId,
      formId: form.id,
      respondentId: params.memberId,
      createdAt: submittedAt,
    },
  });

  // 2. Record response session
  const response = await tx.formResponse.create({
    data: {
      tenantId: params.tenantId,
      campusId: form.campusId ?? null,
      formId: form.id,
      respondentId,
      studentId,
      status: FormResponseStatus.COMPLETED,
      startedAt: submittedAt,
      submittedAt,
    },
  });

  // 3. Record answers
  await tx.formAnswer.createMany({
    data: normalizedAnswers.map((na) => ({
      tenantId: params.tenantId,
      responseId: response.id,
      formQuestionId: na.formQuestionId,
      value: na.value as never,
      createdAt: submittedAt,
    })),
  });

  return {
    ok: true,
    formId: form.id,
    isAnonymous: form.isAnonymous,
    submittedAt,
  };
}

/**
 * Retrieves a public questionnaire via shareToken.
 */
export async function getPublicQuestionnaireByToken(token: string) {
  if (!token || token.trim().length === 0) {
    throw new FormsServiceError("Public token is required.", 400, "VALIDATION");
  }

  const form = await prisma.form.findFirst({
    where: {
      shareToken: token,
      kind: FormKind.QUESTIONNAIRE,
      status: FormStatus.PUBLISHED,
    },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found or not publicly available.", 404, "NOT_FOUND");
  }

  const audience = form.audiences[0];
  if (audience && audience.kind !== FormAudienceKind.PUBLIC) {
    throw new FormsServiceError("This questionnaire is restricted to authenticated school members.", 403, "RESTRICTED");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This questionnaire is closed.", 403, openCheck.reason);
  }

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    isAnonymous: form.isAnonymous,
    questions: formatQuestionnaireQuestionsForRespondent(form.questions),
  };
}

/**
 * Submits answers to a public questionnaire via shareToken.
 */
export async function submitPublicQuestionnaire(params: { token: string; answers: Array<{ formQuestionId: string; value: unknown }> }) {
  const form = await prisma.form.findFirst({
    where: {
      shareToken: params.token,
      kind: FormKind.QUESTIONNAIRE,
      status: FormStatus.PUBLISHED,
    },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const audience = form.audiences[0];
  if (audience && audience.kind !== FormAudienceKind.PUBLIC) {
    throw new FormsServiceError("This questionnaire is restricted to authenticated members.", 403, "RESTRICTED");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This questionnaire is closed.", 403, openCheck.reason);
  }

  const validation = validateAndNormalizeAnswers(form.questions, params.answers);
  if (!validation.ok || !validation.normalizedAnswers) {
    throw new FormsServiceError(validation.message ?? "Invalid answer submission.", 400, "VALIDATION");
  }

  const submittedAt = new Date();

  const response = await prisma.formResponse.create({
    data: {
      tenantId: form.tenantId,
      campusId: form.campusId ?? null,
      formId: form.id,
      respondentId: null,
      studentId: null,
      status: FormResponseStatus.COMPLETED,
      startedAt: submittedAt,
      submittedAt,
    },
  });

  await prisma.formAnswer.createMany({
    data: validation.normalizedAnswers.map((na) => ({
      tenantId: form.tenantId,
      responseId: response.id,
      formQuestionId: na.formQuestionId,
      value: na.value as never,
      createdAt: submittedAt,
    })),
  });

  return {
    ok: true,
    formId: form.id,
    responseId: response.id,
    submittedAt,
  };
}
