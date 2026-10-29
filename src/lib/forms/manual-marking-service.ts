import type { Tx } from "@/lib/tenant/for-tenant";
import { FormMarkingMethod, FormMarkingStatus, FormResponseStatus } from "@prisma/client";
import {
  validateAnswerScore,
  validateTeacherFeedback,
  computeAttemptMarkingSummary,
  canMarkResponse,
  isFullMarks,
  sanitizeResponseForPupil,
} from "./manual-marking";
import { reachForm } from "./access";
import { loadViewer } from "@/lib/question-bank/viewer";
import { mayAccessForm } from "@/lib/question-bank/rules";

export class ManualMarkingError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "ManualMarkingError";
  }
}

/// A response of a form the person may not reach, or one that does not belong to the form named in the URL, is answered as a response that does not exist (the campus rule for
/// forms, task 0024): reading answers is READ, marking is MANAGE.
async function requireResponseAccess(
  tx: Tx,
  p: { tenantId: string; userId: string; urlFormId: string; responseFormId: string; access: "read" | "manage" },
) {
  if (p.responseFormId !== p.urlFormId) throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  if (!(await reachForm(tx, { tenantId: p.tenantId, userId: p.userId, formId: p.responseFormId, access: p.access }))) {
    throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  }
}

/**
 * Lists form responses requiring manual marking in a school/campus.
 */
export async function listPendingMarkingResponses(
  tx: Tx,
  params: {
    tenantId: string;
    userId: string;
    campusId?: string | null;
    formId?: string;
    markingStatus?: FormMarkingStatus;
  },
) {
  // The queue is made of the answers of forms the person may READ; asking for one form they may not read is the same 404 as a form that does not exist.
  if (
    params.formId &&
    !(await reachForm(tx, { tenantId: params.tenantId, userId: params.userId, formId: params.formId, access: "read" }))
  ) {
    throw new ManualMarkingError("Form not found.", 404, "NOT_FOUND");
  }
  const viewer = await loadViewer(tx, params.tenantId, params.userId);
  const where: Record<string, unknown> = {
    tenantId: params.tenantId,
    status: FormResponseStatus.COMPLETED,
  };

  if (params.campusId) {
    where.campusId = params.campusId;
  }

  if (params.formId) {
    where.formId = params.formId;
  }

  if (params.markingStatus) {
    where.markingStatus = params.markingStatus;
  } else {
    // Default to responses needing marking: PENDING or PARTIALLY_MARKED
    where.markingStatus = {
      in: [FormMarkingStatus.PENDING, FormMarkingStatus.PARTIALLY_MARKED],
    };
  }

  const responses = await tx.formResponse.findMany({
    where,
    orderBy: { submittedAt: "asc" },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          kind: true,
          campusId: true,
          createdById: true,
        },
      },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
        },
      },
      answers: {
        select: {
          id: true,
          markingStatus: true,
          score: true,
          formQuestion: {
            select: {
              points: true,
              markingMethod: true,
            },
          },
        },
      },
      markedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return responses
    .filter((r) => mayAccessForm(viewer, r.form, "read"))
    .map((r) => {
      const totalQuestions = r.answers.length;
      const pendingQuestions = r.answers.filter((a) => a.markingStatus === FormMarkingStatus.PENDING).length;
      const markedQuestions = r.answers.filter((a) => a.markingStatus === FormMarkingStatus.MARKED).length;

      return {
        id: r.id,
        formId: r.formId,
        formTitle: r.form.title,
        formKind: r.form.kind,
        studentId: r.studentId,
        studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : "Anonymous",
        admissionNo: r.student?.admissionNo ?? "N/A",
        score: r.score,
        maxScore: r.maxScore,
        markingStatus: r.markingStatus,
        totalQuestions,
        pendingQuestions,
        markedQuestions,
        submittedAt: r.submittedAt,
        markedBy: r.markedBy ? { id: r.markedBy.id, name: r.markedBy.name } : null,
        markedAt: r.markedAt,
      };
    });
}

/**
 * Retrieves a full response with all questions, student answers, and marking status for grading.
 */
export async function getResponseForMarking(
  tx: Tx,
  params: {
    tenantId: string;
    userId: string;
    formId: string;
    responseId: string;
  },
) {
  const response = await tx.formResponse.findFirst({
    where: { id: params.responseId, tenantId: params.tenantId },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          kind: true,
          instructions: true,
          status: true,
        },
      },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
        },
      },
      markedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      answers: {
        orderBy: { formQuestion: { sortOrder: "asc" } },
        include: {
          formQuestion: {
            select: {
              id: true,
              prompt: true,
              questionType: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              points: true,
              markingMethod: true,
              sortOrder: true,
            },
          },
          markedBy: {
            select: {
              id: true,
              name: true,
            },
          },
          audits: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              actor: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      audits: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!response) {
    throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  }
  await requireResponseAccess(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    urlFormId: params.formId,
    responseFormId: response.formId,
    access: "read",
  });

  const check = canMarkResponse(response);
  if (!check.canMark) {
    throw new ManualMarkingError(check.reason ?? "Response cannot be marked.", 400, "CANNOT_MARK");
  }
  // a holder of the "see form results" grant reads the pupil's answers; the answer key is for those who manage the form
  const mayKey =
    (await reachForm(tx, { tenantId: params.tenantId, userId: params.userId, formId: response.formId, access: "manage" })) !== null;

  return {
    id: response.id,
    formId: response.formId,
    formTitle: response.form.title,
    formKind: response.form.kind,
    formInstructions: response.form.instructions,
    studentId: response.studentId,
    studentName: response.student ? `${response.student.firstName} ${response.student.lastName}` : "Anonymous",
    admissionNo: response.student?.admissionNo ?? "N/A",
    status: response.status,
    score: response.score,
    maxScore: response.maxScore,
    markingStatus: response.markingStatus,
    startedAt: response.startedAt,
    submittedAt: response.submittedAt,
    markedAt: response.markedAt,
    markedBy: response.markedBy ? { id: response.markedBy.id, name: response.markedBy.name } : null,
    answers: response.answers.map((a) => ({
      id: a.id,
      formQuestionId: a.formQuestionId,
      prompt: a.formQuestion.prompt,
      questionType: a.formQuestion.questionType,
      options: a.formQuestion.options,
      ...(mayKey ? { correctAnswer: a.formQuestion.correctAnswer, explanation: a.formQuestion.explanation } : {}),
      points: a.formQuestion.points,
      markingMethod: a.formQuestion.markingMethod,
      studentValue: a.value,
      isCorrect: a.isCorrect,
      score: a.score,
      markingStatus: a.markingStatus,
      feedback: a.feedback,
      markedAt: a.markedAt,
      markedBy: a.markedBy ? { id: a.markedBy.id, name: a.markedBy.name } : null,
      audits: a.audits.map((aud) => ({
        id: aud.id,
        scoreAwarded: aud.scoreAwarded,
        maxScore: aud.maxScore,
        feedback: aud.feedback,
        action: aud.action,
        actorName: aud.actor.name,
        createdAt: aud.createdAt,
      })),
    })),
    audits: response.audits.map((aud) => ({
      id: aud.id,
      scoreAwarded: aud.scoreAwarded,
      maxScore: aud.maxScore,
      feedback: aud.feedback,
      action: aud.action,
      actorName: aud.actor.name,
      createdAt: aud.createdAt,
    })),
  };
}

/// Serialises everyone who writes to the same attempt: the teachers marking it and the pupil submitting it. The total of an attempt is the sum of its answers AS THEY ARE when a mark is written, so two marks of one attempt must not be
/// written from the same stale picture, and two submissions of one attempt must not both find it open: the lock is held until the transaction ends, and the attempt is read after it is taken.
export async function lockAttempt(tx: Tx, responseId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mark:${responseId}`}::text))`;
}

const NOT_MANUAL = "Only a question set for hand marking can be marked by hand.";

/**
 * Marks an individual question answer within a form response. Only a person who manages the form marks; only a question set for hand marking is marked by hand, and only in an
 * attempt the pupil has finished; the answer counts as correct only for full marks of a question worth marks; the total is worked out from the answers as they are under the attempt's lock.
 */
export async function markFormAnswer(
  tx: Tx,
  params: {
    tenantId: string;
    responseId: string;
    formId: string;
    answerId: string;
    teacherUserId: string;
    score: number;
    feedback?: string | null;
  },
) {
  const findAnswer = () =>
    tx.formAnswer.findFirst({
      where: {
        id: params.answerId,
        responseId: params.responseId,
        tenantId: params.tenantId,
      },
      include: {
        formQuestion: true,
        response: true,
      },
    });

  const seen = await findAnswer();
  if (!seen) {
    throw new ManualMarkingError("Answer record not found.", 404, "NOT_FOUND");
  }
  await requireResponseAccess(tx, {
    tenantId: params.tenantId,
    userId: params.teacherUserId,
    urlFormId: params.formId,
    responseFormId: seen.response.formId,
    access: "manage",
  });

  // The attempt is read again after its lock is taken, so what follows is the attempt as it is now, not as it was when the request arrived.
  await lockAttempt(tx, params.responseId);
  const answer = await findAnswer();
  if (!answer) {
    throw new ManualMarkingError("Answer record not found.", 404, "NOT_FOUND");
  }

  const markCheck = canMarkResponse(answer.response);
  if (!markCheck.canMark) {
    throw new ManualMarkingError(markCheck.reason ?? "Response cannot be marked.", 400, "CANNOT_MARK");
  }
  if (answer.formQuestion.markingMethod !== FormMarkingMethod.MANUAL) {
    throw new ManualMarkingError(NOT_MANUAL, 400, "NOT_MANUAL");
  }

  const scoreValidation = validateAnswerScore(params.score, answer.formQuestion.points);
  if (!scoreValidation.valid) {
    throw new ManualMarkingError(scoreValidation.reason ?? "Invalid score.", 400, "VALIDATION");
  }

  const feedbackValidation = validateTeacherFeedback(params.feedback);
  if (!feedbackValidation.valid) {
    throw new ManualMarkingError(feedbackValidation.reason ?? "Invalid feedback.", 400, "VALIDATION");
  }

  const now = new Date();
  const trimmedFeedback = params.feedback?.trim() || null;
  const isCorrect = isFullMarks(params.score, answer.formQuestion.points);

  // 1. Update the answer
  await tx.formAnswer.update({
    where: { id: answer.id },
    data: {
      score: params.score,
      isCorrect,
      markingStatus: FormMarkingStatus.MARKED,
      markedById: params.teacherUserId,
      markedAt: now,
      feedback: trimmedFeedback,
    },
  });

  // 2. Audit log for individual answer marking
  await tx.formMarkingAudit.create({
    data: {
      tenantId: params.tenantId,
      responseId: answer.responseId,
      answerId: answer.id,
      formId: answer.response.formId,
      studentId: answer.response.studentId,
      scoreAwarded: params.score,
      maxScore: answer.formQuestion.points,
      feedback: trimmedFeedback,
      action: "ANSWER_MARKED",
      actorUserId: params.teacherUserId,
      createdAt: now,
    },
  });

  // 3. Recompute overall response summary
  const allAnswers = await tx.formAnswer.findMany({
    where: { responseId: answer.responseId, tenantId: params.tenantId },
    include: { formQuestion: { select: { points: true } } },
  });

  const summary = computeAttemptMarkingSummary(
    allAnswers.map((a) => ({
      score: a.score,
      points: a.formQuestion.points,
      markingStatus: a.markingStatus,
    })),
  );

  // 4. Update the response header
  await tx.formResponse.update({
    where: { id: answer.responseId },
    data: {
      score: summary.totalScore,
      maxScore: summary.maxScore,
      markingStatus: summary.markingStatus,
      markedById: summary.markingStatus === FormMarkingStatus.MARKED ? params.teacherUserId : answer.response.markedById,
      markedAt: summary.markingStatus === FormMarkingStatus.MARKED ? now : answer.response.markedAt,
    },
  });

  return {
    ok: true,
    answerId: answer.id,
    responseId: answer.responseId,
    scoreAwarded: params.score,
    maxScore: answer.formQuestion.points,
    markingStatus: FormMarkingStatus.MARKED,
    overallMarkingStatus: summary.markingStatus,
    overallScore: summary.totalScore,
    overallMaxScore: summary.maxScore,
  };
}

/**
 * Marks multiple or all manual answers in an attempt in one batch. The same rules as a single mark, for every answer named; a batch names each answer once, and it is all or nothing.
 */
export async function markFormAttempt(
  tx: Tx,
  params: {
    tenantId: string;
    formId: string;
    responseId: string;
    teacherUserId: string;
    answers: Array<{
      answerId: string;
      score: number;
      feedback?: string | null;
    }>;
  },
) {
  if (new Set(params.answers.map((a) => a.answerId)).size !== params.answers.length) {
    throw new ManualMarkingError("A batch names each answer once.", 400, "DUPLICATE_ANSWER");
  }

  const findResponse = () =>
    tx.formResponse.findFirst({
      where: { id: params.responseId, tenantId: params.tenantId },
      include: {
        answers: {
          include: { formQuestion: true },
        },
      },
    });

  const seen = await findResponse();
  if (!seen) {
    throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  }
  await requireResponseAccess(tx, {
    tenantId: params.tenantId,
    userId: params.teacherUserId,
    urlFormId: params.formId,
    responseFormId: seen.formId,
    access: "manage",
  });

  // The attempt is read again after its lock is taken, so what follows is the attempt as it is now, not as it was when the request arrived.
  await lockAttempt(tx, params.responseId);
  const response = await findResponse();
  if (!response) {
    throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  }

  const check = canMarkResponse(response);
  if (!check.canMark) {
    throw new ManualMarkingError(check.reason ?? "Response cannot be marked.", 400, "CANNOT_MARK");
  }

  const answerMap = new Map(response.answers.map((a) => [a.id, a]));
  const now = new Date();

  // Validate all inputs before making changes
  for (const item of params.answers) {
    const ans = answerMap.get(item.answerId);
    if (!ans) {
      throw new ManualMarkingError(`Answer ID ${item.answerId} not found in this response.`, 404, "NOT_FOUND");
    }
    if (ans.formQuestion.markingMethod !== FormMarkingMethod.MANUAL) {
      throw new ManualMarkingError(NOT_MANUAL, 400, "NOT_MANUAL");
    }
    const scoreVal = validateAnswerScore(item.score, ans.formQuestion.points);
    if (!scoreVal.valid) {
      throw new ManualMarkingError(`Question '${ans.formQuestion.prompt}': ${scoreVal.reason}`, 400, "VALIDATION");
    }
    const fbVal = validateTeacherFeedback(item.feedback);
    if (!fbVal.valid) {
      throw new ManualMarkingError(`Question '${ans.formQuestion.prompt}': ${fbVal.reason}`, 400, "VALIDATION");
    }
  }

  // Update answers and audit logs
  for (const item of params.answers) {
    const ans = answerMap.get(item.answerId)!;
    const isCorrect = isFullMarks(item.score, ans.formQuestion.points);
    const trimmedFb = item.feedback?.trim() || null;

    await tx.formAnswer.update({
      where: { id: item.answerId },
      data: {
        score: item.score,
        isCorrect,
        markingStatus: FormMarkingStatus.MARKED,
        markedById: params.teacherUserId,
        markedAt: now,
        feedback: trimmedFb,
      },
    });

    await tx.formMarkingAudit.create({
      data: {
        tenantId: params.tenantId,
        responseId: response.id,
        answerId: ans.id,
        formId: response.formId,
        studentId: response.studentId,
        scoreAwarded: item.score,
        maxScore: ans.formQuestion.points,
        feedback: trimmedFb,
        action: "BATCH_ANSWER_MARKED",
        actorUserId: params.teacherUserId,
        createdAt: now,
      },
    });
  }

  // Re-read answers and recompute overall summary
  const updatedAnswers = await tx.formAnswer.findMany({
    where: { responseId: response.id, tenantId: params.tenantId },
    include: { formQuestion: { select: { points: true } } },
  });

  const summary = computeAttemptMarkingSummary(
    updatedAnswers.map((a) => ({
      score: a.score,
      points: a.formQuestion.points,
      markingStatus: a.markingStatus,
    })),
  );

  // Update response header
  await tx.formResponse.update({
    where: { id: response.id },
    data: {
      score: summary.totalScore,
      maxScore: summary.maxScore,
      markingStatus: summary.markingStatus,
      markedById: summary.markingStatus === FormMarkingStatus.MARKED ? params.teacherUserId : response.markedById,
      markedAt: summary.markingStatus === FormMarkingStatus.MARKED ? now : response.markedAt,
    },
  });

  // Audit log for attempt-level marking update
  await tx.formMarkingAudit.create({
    data: {
      tenantId: params.tenantId,
      responseId: response.id,
      answerId: null,
      formId: response.formId,
      studentId: response.studentId,
      scoreAwarded: summary.totalScore,
      maxScore: summary.maxScore,
      feedback: `Attempt marked: ${summary.markedCount} marked, ${summary.pendingCount} pending`,
      action: "ATTEMPT_MARKED",
      actorUserId: params.teacherUserId,
      createdAt: now,
    },
  });

  return {
    ok: true,
    responseId: response.id,
    markingStatus: summary.markingStatus,
    totalScore: summary.totalScore,
    maxScore: summary.maxScore,
    accuracyPercentage: summary.accuracyPercentage,
    pendingCount: summary.pendingCount,
    markedCount: summary.markedCount,
  };
}

/**
 * Returns a response with manual marking results for pupil review,
 * properly sanitizing un-marked questions (withholding keys & explanations).
 */
export async function getPupilResponseWithMarking(
  tx: Tx,
  params: {
    tenantId: string;
    responseId: string;
    studentId: string;
  },
) {
  const response = await tx.formResponse.findFirst({
    where: {
      id: params.responseId,
      studentId: params.studentId,
      tenantId: params.tenantId,
    },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          instructions: true,
          kind: true,
        },
      },
      answers: {
        orderBy: { formQuestion: { sortOrder: "asc" } },
        include: {
          formQuestion: {
            select: {
              id: true,
              prompt: true,
              questionType: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              points: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  if (!response) {
    throw new ManualMarkingError("Practice set response not found.", 404, "NOT_FOUND");
  }

  return sanitizeResponseForPupil(
    {
      id: response.id,
      formId: response.formId,
      formTitle: response.form.title,
      formKind: response.form.kind,
      status: response.status,
      score: response.score,
      maxScore: response.maxScore,
      markingStatus: response.markingStatus,
      submittedAt: response.submittedAt,
    } as never,
    response.answers,
  );
}
