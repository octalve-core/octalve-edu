import type { Tx } from "@/lib/tenant/for-tenant";
import { BankQuestionType, FormKind, FormStatus, FormAudienceKind, FormResponseStatus, FormMarkingStatus } from "@prisma/client";
import {
  isFormOpen,
  isFormForPupilCampus,
  isWithinTimeLimit,
  scrubFormQuestionsForPupil,
  isPupilAudienceEligible,
  validatePracticeSetInput,
  withoutAnswerKey,
} from "./practice-sets";
import { resolveMarkingMethod, evaluateSubmissionWithMarking } from "./manual-marking";
import { campusFilter, reachForm } from "./access";
import { lockAttempt } from "./manual-marking-service";

export class FormsServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "FormsServiceError";
  }
}

/**
 * Creates a new Practice Set (ungraded form) with audience and questions.
 */
export async function createPracticeSet(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    userId: string;
    title: string;
    instructions?: string | null;
    opensAt?: string | null;
    closesAt?: string | null;
    maxDurationMinutes?: number | null;
    classGroupIds?: string[];
    questions: Array<{
      sourceItemId?: string | null;
      prompt?: string;
      questionType?: BankQuestionType;
      options?: unknown;
      correctAnswer?: string | null;
      explanation?: string | null;
      points?: number;
      sortOrder?: number;
    }>;
  },
) {
  const validated = validatePracticeSetInput({
    title: params.title,
    instructions: params.instructions,
    opensAt: params.opensAt,
    closesAt: params.closesAt,
    maxDurationMinutes: params.maxDurationMinutes,
  });

  if (!validated.ok) {
    throw new FormsServiceError(validated.message, 400, "VALIDATION");
  }

  if (!params.questions || params.questions.length === 0) {
    throw new FormsServiceError("A practice set must contain at least one question.", 400, "VALIDATION");
  }

  // Pre-load bank items if questions are copied from question bank
  const sourceItemIds = params.questions.map((q) => q.sourceItemId).filter((id): id is string => Boolean(id));

  const bankItems =
    sourceItemIds.length > 0
      ? await tx.questionBankItem.findMany({
          where: { tenantId: params.tenantId, id: { in: sourceItemIds } },
          select: {
            id: true,
            version: true,
            prompt: true,
            type: true,
            options: true,
            correctAnswer: true,
            explanation: true,
            points: true,
          },
        })
      : [];

  const bankItemMap = new Map(bankItems.map((item) => [item.id, item]));

  // Compose question payloads
  const questionsToCreate = params.questions.map((q, index) => {
    let prompt = q.prompt;
    let questionType: BankQuestionType = q.questionType ?? BankQuestionType.SINGLE;
    let options: unknown = q.options ?? [];
    let correctAnswer: string | null = q.correctAnswer ?? null;
    let explanation: string | null = q.explanation ?? null;
    let points: number = q.points !== undefined && q.points >= 0 ? q.points : 1;
    let sourceVersion: number | null = null;

    if (q.sourceItemId && bankItemMap.has(q.sourceItemId)) {
      const src = bankItemMap.get(q.sourceItemId)!;
      sourceVersion = src.version;
      prompt = prompt || src.prompt;
      questionType = q.questionType || src.type;
      options = q.options ?? src.options;
      correctAnswer = correctAnswer || (typeof src.correctAnswer === "string" ? src.correctAnswer : JSON.stringify(src.correctAnswer));
      explanation = explanation || src.explanation;
      points = q.points !== undefined ? q.points : src.points;
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new FormsServiceError(`Question #${index + 1} prompt cannot be empty.`, 400, "VALIDATION");
    }

    const markingMethod = resolveMarkingMethod(questionType);

    return {
      sourceItemId: q.sourceItemId ?? null,
      sourceVersion,
      prompt: prompt.trim(),
      questionType,
      options: options as never,
      correctAnswer,
      explanation,
      points,
      markingMethod,
      sortOrder: q.sortOrder ?? index,
    };
  });

  const form = await tx.form.create({
    data: {
      tenantId: params.tenantId,
      campusId: params.campusId ?? null,
      kind: FormKind.PRACTICE_SET,
      title: params.title.trim(),
      instructions: params.instructions ? params.instructions.trim() : null,
      status: FormStatus.PUBLISHED,
      opensAt: params.opensAt ? new Date(params.opensAt) : null,
      closesAt: params.closesAt ? new Date(params.closesAt) : null,
      maxDurationMinutes: params.maxDurationMinutes ?? null,
      createdById: params.userId,
      audiences: {
        create: {
          kind: FormAudienceKind.MEMBERS,
          roles: ["STUDENT"],
          classGroupIds: params.classGroupIds ?? [],
        },
      },
      questions: {
        create: questionsToCreate,
      },
    },
    include: {
      audiences: true,
      questions: true,
    },
  });

  return {
    ok: true,
    formId: form.id,
    title: form.title,
    status: form.status,
    questionCount: questionsToCreate.length,
  };
}

/**
 * Lists practice sets in a school for staff.
 */
export async function listPracticeSetsForStaff(
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
    kind: FormKind.PRACTICE_SET,
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
      audiences: { select: { classGroupIds: true } },
      _count: { select: { questions: true, responses: true } },
    },
  });

  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    instructions: f.instructions,
    status: f.status,
    opensAt: f.opensAt,
    closesAt: f.closesAt,
    maxDurationMinutes: f.maxDurationMinutes,
    questionCount: f._count.questions,
    responseCount: f._count.responses,
    classGroupIds: f.audiences[0]?.classGroupIds ?? [],
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

/**
 * Gets details of a practice set for staff including answer keys.
 */
export async function getPracticeSetForStaff(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
  },
) {
  if (!(await reachForm(tx, { tenantId: params.tenantId, userId: params.userId, formId: params.formId, access: "view" }))) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }
  // the answer key is for those who manage the form; everyone else who may view it sees the questions without it
  const mayKey =
    (await reachForm(tx, { tenantId: params.tenantId, userId: params.userId, formId: params.formId, access: "manage" })) !== null;
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
      _count: { select: { responses: true } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  return {
    id: form.id,
    tenantId: form.tenantId,
    title: form.title,
    instructions: form.instructions,
    status: form.status,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    maxDurationMinutes: form.maxDurationMinutes,
    audiences: form.audiences,
    questions: mayKey ? form.questions : form.questions.map(withoutAnswerKey),
    responseCount: form._count.responses,
    createdBy: form.createdBy,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

/**
 * Updates a practice set (e.g. title, schedule, publishing).
 */
export async function updatePracticeSet(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
    title?: string;
    instructions?: string | null;
    status?: FormStatus;
    opensAt?: string | null;
    closesAt?: string | null;
    maxDurationMinutes?: number | null;
    classGroupIds?: string[];
  },
) {
  if (!(await reachForm(tx, { tenantId: params.tenantId, userId: params.userId, formId: params.formId, access: "manage" }))) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const data: {
    title?: string;
    instructions?: string | null;
    status?: FormStatus;
    opensAt?: Date | null;
    closesAt?: Date | null;
    maxDurationMinutes?: number | null;
    closedById?: string | null;
    closedAt?: Date | null;
  } = {};

  if (params.title !== undefined) {
    if (params.title.trim().length === 0 || params.title.trim().length > 200) {
      throw new FormsServiceError("Title must be between 1 and 200 characters.", 400, "VALIDATION");
    }
    data.title = params.title.trim();
  }

  if (params.instructions !== undefined) {
    data.instructions = params.instructions ? params.instructions.trim() : null;
  }

  if (params.opensAt !== undefined) {
    data.opensAt = params.opensAt ? new Date(params.opensAt) : null;
  }

  if (params.closesAt !== undefined) {
    data.closesAt = params.closesAt ? new Date(params.closesAt) : null;
  }

  if (params.maxDurationMinutes !== undefined) {
    data.maxDurationMinutes = params.maxDurationMinutes;
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

  if (params.classGroupIds) {
    await tx.formAudience.updateMany({
      where: { tenantId: params.tenantId, formId: form.id },
      data: { classGroupIds: params.classGroupIds },
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
 * Closes a practice set so no further attempts can be submitted.
 */
export async function closePracticeSet(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
  },
) {
  return updatePracticeSet(tx, {
    formId: params.formId,
    tenantId: params.tenantId,
    userId: params.userId,
    status: FormStatus.CLOSED,
  });
}

/// Where the pupil stands now: the class group they are in and the campus they belong to, which a set's audience and campus are matched against.
async function pupilStandingOf(tx: Tx, tenantId: string, studentId: string) {
  const [enrollment, student] = await Promise.all([
    tx.studentEnrollment.findFirst({
      where: { studentId, tenantId, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
      include: { classArm: { select: { classGroupId: true } } },
    }),
    tx.studentRecord.findFirst({ where: { id: studentId, tenantId }, select: { campusId: true } }),
  ]);
  return { classGroupId: enrollment?.classArm?.classGroupId ?? null, campusId: student?.campusId ?? null };
}

/// Serialises the starts of one pupil on one set, so two starts at the same moment find one open attempt, not none each.
async function lockPupilStart(tx: Tx, formId: string, studentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`practice-start:${formId}:${studentId}`}::text))`;
}

/// What a pupil is told when a set is not open (`reason` is what `isFormOpen` gave).
function notOpenError(reason?: string) {
  return new FormsServiceError(
    reason === "NOT_YET_OPEN" ? "This practice set is not open yet." : "This practice set is closed.",
    403,
    reason,
  );
}

/**
 * Lists available open practice sets for a pupil: the sets of their campus and the whole school's, for their class.
 */
export async function listAvailablePracticeSetsForPupil(
  tx: Tx,
  params: {
    studentId: string;
    tenantId: string;
  },
) {
  const pupil = await pupilStandingOf(tx, params.tenantId, params.studentId);
  const pupilClassGroupId = pupil.classGroupId;

  const forms = await tx.form.findMany({
    where: {
      tenantId: params.tenantId,
      kind: FormKind.PRACTICE_SET,
      status: FormStatus.PUBLISHED,
      OR: pupil.campusId ? [{ campusId: pupil.campusId }, { campusId: null }] : [{ campusId: null }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      audiences: true,
      _count: { select: { questions: true } },
      responses: {
        where: { studentId: params.studentId },
        select: { id: true, status: true, score: true, maxScore: true, submittedAt: true },
      },
    },
  });

  const now = new Date();
  const available = forms
    .filter((f) => {
      const openCheck = isFormOpen(f, now);
      if (!openCheck.isOpen) return false;
      const audience = f.audiences[0];
      if (!audience) return true;
      return isPupilAudienceEligible(audience, pupilClassGroupId);
    })
    .map((f) => {
      const existingResponse = f.responses[0] ?? null;
      return {
        id: f.id,
        title: f.title,
        instructions: f.instructions,
        questionCount: f._count.questions,
        maxDurationMinutes: f.maxDurationMinutes,
        opensAt: f.opensAt,
        closesAt: f.closesAt,
        hasSubmitted: existingResponse?.status === FormResponseStatus.COMPLETED,
        submission: existingResponse,
      };
    });

  return available;
}

/**
 * Retrieves a practice set for a pupil with scrubbed questions (no answer keys).
 */
export async function getPracticeSetForPupil(
  tx: Tx,
  params: {
    formId: string;
    studentId: string;
    tenantId: string;
  },
) {
  const pupil = await pupilStandingOf(tx, params.tenantId, params.studentId);
  const pupilClassGroupId = pupil.classGroupId;

  const form = await tx.form.findFirst({
    where: {
      id: params.formId,
      tenantId: params.tenantId,
      kind: FormKind.PRACTICE_SET,
    },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
      responses: {
        where: { studentId: params.studentId },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // A set of another campus is "not found" to this pupil, as a form of another campus is to staff.
  if (!form || !isFormForPupilCampus(form.campusId, pupil.campusId)) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const openCheck = isFormOpen(form);
  if (!openCheck.isOpen) throw notOpenError(openCheck.reason);

  const audience = form.audiences[0];
  if (audience && !isPupilAudienceEligible(audience, pupilClassGroupId)) {
    throw new FormsServiceError("You are not eligible for this practice set.", 403, "FORBIDDEN");
  }

  const scrubbedQuestions = scrubFormQuestionsForPupil(form.questions);
  const existingResponse = form.responses[0] ?? null;

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    maxDurationMinutes: form.maxDurationMinutes,
    questions: scrubbedQuestions,
    activeResponse: existingResponse,
  };
}

/**
 * Starts a response session (an attempt) on a practice set for a pupil, or resumes the one they have open. Only a pupil the set is for may start it (its campus and its audience). The
 * check for an open attempt and the opening of a new one are made under a lock for this pupil and this set, so two starts at the same moment are one attempt. An attempt left open
 * past the set's time limit can no longer be submitted, so it is closed off (ABANDONED) and a fresh one is opened instead of resuming a dead one.
 */
export async function startPracticeSetForPupil(
  tx: Tx,
  params: {
    formId: string;
    studentId: string;
    tenantId: string;
  },
) {
  const pupil = await pupilStandingOf(tx, params.tenantId, params.studentId);

  await lockPupilStart(tx, params.formId, params.studentId);

  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId, kind: FormKind.PRACTICE_SET },
    include: { audiences: true },
  });

  if (!form || !isFormForPupilCampus(form.campusId, pupil.campusId)) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const now = new Date();
  const openCheck = isFormOpen(form, now);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This practice set is not currently open.", 403, openCheck.reason);
  }

  const audience = form.audiences[0];
  if (audience && !isPupilAudienceEligible(audience, pupil.classGroupId)) {
    throw new FormsServiceError("You are not eligible for this practice set.", 403, "FORBIDDEN");
  }

  const open = await tx.formResponse.findMany({
    where: {
      tenantId: params.tenantId,
      formId: form.id,
      studentId: params.studentId,
      status: FormResponseStatus.IN_PROGRESS,
    },
    orderBy: { startedAt: "desc" },
  });
  const inTime = open.filter((r) => isWithinTimeLimit(r.startedAt, form.maxDurationMinutes, now));
  const expired = open.filter((r) => !inTime.includes(r));

  if (expired.length > 0) {
    await tx.formResponse.updateMany({
      where: { tenantId: params.tenantId, id: { in: expired.map((r) => r.id) } },
      data: { status: FormResponseStatus.ABANDONED },
    });
  }

  if (inTime[0]) {
    return {
      responseId: inTime[0].id,
      startedAt: inTime[0].startedAt,
      isResume: true,
    };
  }

  const response = await tx.formResponse.create({
    data: {
      tenantId: params.tenantId,
      campusId: form.campusId ?? null,
      formId: form.id,
      studentId: params.studentId,
      respondentId: params.studentId,
      status: FormResponseStatus.IN_PROGRESS,
      startedAt: now,
    },
  });

  return {
    responseId: response.id,
    startedAt: response.startedAt,
    isResume: false,
  };
}

/**
 * Submits pupil answers, evaluates accuracy, and reveals explanations. An attempt is submitted once: the attempt is read under its lock, inside the transaction, so two submissions at
 * the same moment cannot both find it open. The pupil must still be one the set is for (its campus and audience are checked again, not only at the start). The set must be a practice set that is open now (published, inside its opening and closing times; a teacher who closes a set closes it for an
 * attempt in flight too) and the attempt must be inside the set's time limit; a refusal writes nothing.
 */
export async function submitPracticeSetForPupil(
  tx: Tx,
  params: {
    formId: string;
    responseId: string;
    studentId: string;
    tenantId: string;
    answers: Array<{ formQuestionId: string; value: unknown }>;
  },
) {
  await lockAttempt(tx, params.responseId);

  const [form, response] = await Promise.all([
    tx.form.findFirst({
      where: { id: params.formId, tenantId: params.tenantId, kind: FormKind.PRACTICE_SET },
      include: { audiences: true },
    }),
    tx.formResponse.findFirst({
      where: { id: params.responseId, formId: params.formId, studentId: params.studentId, tenantId: params.tenantId },
    }),
  ]);

  if (!form || !response) {
    throw new FormsServiceError("Active practice set response not found.", 404, "NOT_FOUND");
  }

  if (response.status !== FormResponseStatus.IN_PROGRESS) {
    throw new FormsServiceError("This practice set has already been completed.", 400, "ALREADY_COMPLETED");
  }

  // The pupil must still be one the set is for: a pupil moved to another campus, or to a class the audience no longer names (or an audience narrowed), after the attempt began ends it. (Asked
  // first, so that someone who is not entitled learns nothing about the set's state.)
  const pupil = await pupilStandingOf(tx, params.tenantId, params.studentId);
  if (!isFormForPupilCampus(form.campusId, pupil.campusId)) {
    throw new FormsServiceError("Active practice set response not found.", 404, "NOT_FOUND");
  }
  const audience = form.audiences[0];
  if (audience && !isPupilAudienceEligible(audience, pupil.classGroupId)) {
    throw new FormsServiceError("You are not eligible for this practice set.", 403, "FORBIDDEN");
  }

  const completedAt = new Date();

  const openCheck = isFormOpen(form, completedAt);
  if (!openCheck.isOpen) throw notOpenError(openCheck.reason);

  if (!isWithinTimeLimit(response.startedAt, form.maxDurationMinutes, completedAt)) {
    throw new FormsServiceError("The time for this practice set is up.", 403, "TIME_UP");
  }

  const questions = await tx.formQuestion.findMany({
    where: { formId: params.formId, tenantId: params.tenantId },
    orderBy: { sortOrder: "asc" },
  });

  // Evaluate answers taking manual marking into account
  const evaluation = evaluateSubmissionWithMarking(questions, params.answers);

  // Write answer records
  await tx.formAnswer.createMany({
    data: evaluation.evaluatedAnswers.map((ea) => ({
      tenantId: params.tenantId,
      responseId: response.id,
      formQuestionId: ea.formQuestionId,
      value: ea.value as never,
      isCorrect: ea.isCorrect,
      score: ea.score,
      markingStatus: ea.markingStatus,
      createdAt: completedAt,
    })),
  });

  // Update response status
  await tx.formResponse.update({
    where: { id: response.id },
    data: {
      status: FormResponseStatus.COMPLETED,
      score: evaluation.totalScore,
      maxScore: evaluation.maxScore,
      markingStatus: evaluation.markingStatus,
      submittedAt: completedAt,
    },
  });

  return {
    ok: true,
    responseId: response.id,
    status: FormResponseStatus.COMPLETED,
    markingStatus: evaluation.markingStatus,
    isPendingReview: evaluation.markingStatus === FormMarkingStatus.PENDING,
    totalScore: evaluation.totalScore,
    maxScore: evaluation.maxScore,
    accuracyPercentage: evaluation.accuracyPercentage,
    results: evaluation.evaluatedAnswers,
  };
}

/**
 * Returns responses and performance overview for staff.
 */
export async function getPracticeSetResponsesForStaff(
  tx: Tx,
  params: {
    formId: string;
    tenantId: string;
    userId: string;
  },
) {
  if (!(await reachForm(tx, { tenantId: params.tenantId, userId: params.userId, formId: params.formId, access: "read" }))) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }
  const form = await tx.form.findFirst({
    where: { id: params.formId, tenantId: params.tenantId },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const responses = await tx.formResponse.findMany({
    where: { formId: params.formId, tenantId: params.tenantId },
    orderBy: { submittedAt: "desc" },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
        },
      },
    },
  });

  return responses.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : "Unknown",
    admissionNo: r.student?.admissionNo ?? "N/A",
    status: r.status,
    score: r.score,
    maxScore: r.maxScore,
    startedAt: r.startedAt,
    submittedAt: r.submittedAt,
  }));
}
