import type { Tx } from "@/lib/tenant/for-tenant";
import { PrintTargetKind, Role } from "@prisma/client";
import { effectiveSettingsIn } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { mayReachCampus, staffMaySee, mayAccessForm } from "@/lib/question-bank/rules";
import {
  canPrintTarget,
  canPupilPrintAttempt,
  generateWatermarkText,
  generateExamPdf,
  type PrintableDocument,
  type PrintableQuestion,
} from "./printing";

export class PrintingServiceError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = "PrintingServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Checks whether a user holds active Exam Approver credentials for a school/campus.
 */
export async function isUserExamApprover(tx: Tx, tenantId: string, userId: string, campusId?: string | null): Promise<boolean> {
  const membership = await tx.tenantMembership.findFirst({
    where: { tenantId, userId, deactivatedAt: null },
    select: { role: true },
  });
  if (membership?.role === Role.ADMIN || membership?.role === Role.CAMPUS_ADMIN) {
    return true;
  }

  const reviewer = await tx.questionBankReviewer.findFirst({
    where: {
      tenantId,
      userId,
      isExamApprover: true,
      OR: campusId ? [{ campusId }, { campusId: null }] : [{ campusId: null }],
    },
  });

  return Boolean(reviewer);
}

/**
 * Loads the effective near-exam days configuration for a school/campus (default 7).
 */
export async function getNearExamDays(tx: Tx, tenantId: string, campusId?: string | null): Promise<number> {
  const settings = await effectiveSettingsIn(tx, tenantId, campusId ?? null);
  return settings["bank.print.nearExamDays"] ?? 7;
}

/**
 * Extracts clean string array of options from JSON options column.
 */
function extractOptions(optionsJson: unknown): string[] {
  if (!Array.isArray(optionsJson)) return [];
  return optionsJson.map((opt: unknown) => {
    if (typeof opt === "string") return opt;
    if (typeof opt === "object" && opt !== null && "text" in opt) {
      return String((opt as { text: unknown }).text);
    }
    return String(opt);
  });
}

export interface PrintTargetParams {
  tenantId: string;
  campusId?: string | null;
  userId: string;
  targetKind: PrintTargetKind;
  targetId: string;
  includeAnswerKey?: boolean;
  recipientStudentId?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Core print engine: validates security window, constructs watermark,
 * generates standard PDF-1.4 binary, and records immutable audit log.
 */
export async function printTarget(
  tx: Tx,
  params: PrintTargetParams,
): Promise<{
  pdfBuffer: Buffer;
  filename: string;
  title: string;
  watermark: string;
  pageCount: number;
  printLogId: string;
}> {
  const user = await tx.user.findUnique({
    where: { id: params.userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    throw new PrintingServiceError("User account not found.", 401, "UNAUTHORIZED");
  }

  const membership = await tx.tenantMembership.findFirst({
    where: { tenantId: params.tenantId, userId: params.userId, deactivatedAt: null },
    select: { role: true },
  });
  const userRole = membership?.role ?? Role.TEACHING_STAFF;

  // Printing hands out the question text and, when asked, the answer key, so what a person may print is what they may READ: the same rules as the bank itself, decided in this
  // transaction. Anything they may not read is "not found", never "forbidden" (a refusal must not confirm that it exists).
  const viewer = await loadViewer(tx, params.tenantId, params.userId);

  const [isApprover, nearExamDays] = await Promise.all([
    isUserExamApprover(tx, params.tenantId, params.userId, params.campusId),
    getNearExamDays(tx, params.tenantId, params.campusId),
  ]);

  const campus = params.campusId
    ? await tx.campus.findFirst({ where: { tenantId: params.tenantId, id: params.campusId }, select: { name: true } })
    : null;
  const schoolName = campus?.name ?? "Octalve Edu";

  let recipientStudent: { name: string; admissionNo: string } | undefined;
  if (params.recipientStudentId) {
    const student = await tx.studentRecord.findFirst({
      where: { id: params.recipientStudentId, tenantId: params.tenantId },
      select: { firstName: true, lastName: true, admissionNo: true },
    });
    if (student) {
      recipientStudent = {
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
      };
    }
  }

  let docTitle = "";
  let docInstructions: string | null = null;
  let docClassGroupName: string | null = null;
  let docKindLabel = "QUESTION PAPER";
  let totalPoints = 0;
  const printableQuestions: PrintableQuestion[] = [];

  const now = new Date();

  switch (params.targetKind) {
    case PrintTargetKind.QUESTION_BANK_ITEM: {
      const item = await tx.questionBankItem.findFirst({
        where: { id: params.targetId, tenantId: params.tenantId },
      });
      if (
        !item ||
        !staffMaySee(
          viewer,
          {
            campusId: item.campusId,
            subjectKey: item.subjectKey,
            status: item.status,
            visibility: item.visibility,
            visibleFrom: item.visibleFrom,
            submittedById: item.submittedById,
          },
          now,
        )
      ) {
        throw new PrintingServiceError("Question bank item not found.", 404, "NOT_FOUND");
      }

      const access = canPrintTarget(
        {
          visibility: item.visibility,
          authorUserId: item.submittedById,
        },
        {
          userId: user.id,
          role: userRole,
          isSuperAdmin: userRole === Role.ADMIN,
          isExamApprover: isApprover,
        },
        nearExamDays,
        now,
      );
      if (!access.allowed) {
        throw new PrintingServiceError(access.reason || "Access denied.", 403, "EXAM_WINDOW_RESTRICTION");
      }

      docTitle = item.subjectLabel ? `${item.subjectLabel} - Question` : "Question Bank Item";
      docKindLabel = "QUESTION BANK ITEM";
      totalPoints = item.points;

      printableQuestions.push({
        prompt: item.prompt,
        questionType: item.type,
        points: item.points,
        options: extractOptions(item.options),
        correctAnswer:
          params.includeAnswerKey && item.correctAnswer
            ? typeof item.correctAnswer === "string"
              ? item.correctAnswer
              : JSON.stringify(item.correctAnswer)
            : null,
        explanation: params.includeAnswerKey ? item.explanation : null,
      });
      break;
    }

    case PrintTargetKind.FORM: {
      const form = await tx.form.findFirst({
        where: { id: params.targetId, tenantId: params.tenantId },
        include: {
          questions: { orderBy: { sortOrder: "asc" } },
        },
      });
      // a blank copy is for anyone who may view the form (and may print at all); a copy with the answer key is the managers'
      if (!form || !mayAccessForm(viewer, form, params.includeAnswerKey ? "manage" : "view")) {
        throw new PrintingServiceError("Form not found.", 404, "NOT_FOUND");
      }

      docTitle = form.title;
      docInstructions = form.instructions;
      docKindLabel =
        form.kind === "PAPER_WORK" ? "PAPER WORK ASSIGNMENT" : form.kind === "QUESTIONNAIRE" ? "QUESTIONNAIRE" : "PRACTICE SET";

      for (const q of form.questions) {
        totalPoints += q.points;
        printableQuestions.push({
          prompt: q.prompt,
          questionType: q.questionType,
          points: q.points,
          options: extractOptions(q.options),
          correctAnswer: params.includeAnswerKey ? q.correctAnswer : null,
          explanation: params.includeAnswerKey ? q.explanation : null,
        });
      }
      break;
    }

    case PrintTargetKind.QUIZ: {
      const quiz = await tx.quiz.findFirst({
        where: { id: params.targetId, tenantId: params.tenantId },
        include: {
          classGroup: { select: { name: true } },
          questions: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!quiz || !mayReachCampus(viewer, quiz.campusId)) {
        throw new PrintingServiceError("Quiz not found.", 404, "NOT_FOUND");
      }

      const access = canPrintTarget(
        {
          isExam: quiz.isExamTemplate || Boolean(quiz.examWindowStart),
          isExamTemplate: quiz.isExamTemplate,
          examWindowStart: quiz.examWindowStart,
          examWindowEnd: quiz.examWindowEnd,
          authorUserId: quiz.createdById,
        },
        {
          userId: user.id,
          role: userRole,
          isSuperAdmin: userRole === Role.ADMIN,
          isExamApprover: isApprover,
        },
        nearExamDays,
        now,
      );
      if (!access.allowed) {
        throw new PrintingServiceError(access.reason || "Access denied.", 403, "EXAM_WINDOW_RESTRICTION");
      }

      docTitle = quiz.title;
      docInstructions = quiz.instructions;
      docClassGroupName = quiz.classGroup?.name ?? null;
      docKindLabel = quiz.isExamTemplate ? "EXAMINATION PAPER" : "ASSESSMENT PAPER";

      for (const q of quiz.questions) {
        totalPoints += q.points;
        printableQuestions.push({
          prompt: q.prompt,
          questionType: q.questionType,
          points: q.points,
          options: extractOptions(q.options),
          correctAnswer: params.includeAnswerKey ? q.correctAnswer : null,
          explanation: null,
        });
      }
      break;
    }

    default:
      throw new PrintingServiceError(`Target kind ${params.targetKind} is not printable via staff print engine.`, 400);
  }

  const watermarkText = generateWatermarkText({
    actorName: user.name || user.email || "Staff Member",
    actorIdentifier: user.email || user.id,
    branchName: schoolName,
    targetTitle: docTitle,
    timestamp: now,
    recipientStudentName: recipientStudent?.name,
    recipientStudentAdmissionNo: recipientStudent?.admissionNo,
  });

  const printableDoc: PrintableDocument = {
    title: docTitle,
    branchName: schoolName,
    watermark: watermarkText,
    date: now.toISOString().split("T")[0],
    instructions: docInstructions,
    totalPoints: totalPoints > 0 ? totalPoints : undefined,
    classGroupName: docClassGroupName,
    kindLabel: docKindLabel,
    questions: printableQuestions,
  };

  const pdfBuffer = generateExamPdf(printableDoc);
  const estimatedPageCount = Math.max(1, Math.ceil(printableQuestions.length / 3));

  const printLog = await tx.questionBankPrintLog.create({
    data: {
      tenantId: params.tenantId,
      campusId: params.campusId ?? null,
      targetKind: params.targetKind,
      targetId: params.targetId,
      title: docTitle,
      watermark: watermarkText,
      pageCount: estimatedPageCount,
      reason: params.reason || null,
      recipientStudentId: params.recipientStudentId || null,
      printedById: user.id,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      printedAt: now,
    },
  });

  const sanitizedFilename = docTitle
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 40);

  return {
    pdfBuffer,
    filename: `${sanitizedFilename}_${now.getTime()}.pdf`,
    title: docTitle,
    watermark: watermarkText,
    pageCount: estimatedPageCount,
    printLogId: printLog.id,
  };
}

export interface ListPrintLogsParams {
  tenantId: string;
  campusId?: string | null;
  targetKind?: PrintTargetKind;
  targetId?: string;
  limit?: number;
}

/**
 * Lists append-only immutable print logs for examination audit trails.
 */
export async function listPrintLogs(tx: Tx, params: ListPrintLogsParams) {
  const where: {
    tenantId: string;
    campusId?: string | null;
    targetKind?: PrintTargetKind;
    targetId?: string;
  } = {
    tenantId: params.tenantId,
  };

  if (params.campusId) {
    where.campusId = params.campusId;
  }
  if (params.targetKind) {
    where.targetKind = params.targetKind;
  }
  if (params.targetId) {
    where.targetId = params.targetId;
  }

  const logs = await tx.questionBankPrintLog.findMany({
    where,
    orderBy: { printedAt: "desc" },
    take: params.limit || 50,
    include: {
      printedBy: { select: { id: true, name: true, email: true } },
      recipientStudent: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    targetKind: log.targetKind,
    targetId: log.targetId,
    title: log.title,
    watermark: log.watermark,
    pageCount: log.pageCount,
    reason: log.reason,
    printedAt: log.printedAt,
    printedBy: log.printedBy ? { id: log.printedBy.id, name: log.printedBy.name, email: log.printedBy.email } : null,
    recipientStudent: log.recipientStudent
      ? {
          id: log.recipientStudent.id,
          name: `${log.recipientStudent.firstName} ${log.recipientStudent.lastName}`,
          admissionNo: log.recipientStudent.admissionNo,
        }
      : null,
  }));
}

/**
 * Allows a pupil to print their finished practice session with evaluated answers.
 */
export async function printPupilPracticeSession(
  tx: Tx,
  params: {
    tenantId: string;
    studentId: string;
    sessionId: string;
    ipAddress?: string;
    userAgent?: string;
  },
) {
  const [student, session] = await Promise.all([
    tx.studentRecord.findFirst({
      where: { id: params.studentId, tenantId: params.tenantId },
      include: { campus: { select: { name: true } } },
    }),
    tx.practiceSession.findFirst({
      where: { id: params.sessionId, studentId: params.studentId, tenantId: params.tenantId },
      include: {
        attempts: {
          orderBy: { answeredAt: "asc" },
          include: {
            bankItem: {
              select: {
                prompt: true,
                type: true,
                options: true,
                correctAnswer: true,
                explanation: true,
                points: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!student) {
    throw new PrintingServiceError("Student record not found.", 404, "NOT_FOUND");
  }
  if (!session) {
    throw new PrintingServiceError("Practice session not found.", 404, "NOT_FOUND");
  }

  const access = canPupilPrintAttempt({ finishedAt: session.finishedAt });
  if (!access.allowed) {
    throw new PrintingServiceError(access.reason || "Cannot print session.", 403, "SESSION_NOT_FINISHED");
  }

  const schoolName = student.campus?.name ?? "Octalve Edu";
  const now = new Date();
  const studentName = `${student.firstName} ${student.lastName}`;

  const watermarkText = generateWatermarkText({
    actorName: studentName,
    actorIdentifier: student.admissionNo,
    branchName: schoolName,
    targetTitle: `Practice: ${session.subjectLabel || "General"}`,
    timestamp: now,
  });

  const printableQuestions: PrintableQuestion[] = session.attempts.map((att) => {
    let studentAnsStr: string | null = null;
    if (att.answer !== null && att.answer !== undefined) {
      studentAnsStr = typeof att.answer === "string" ? att.answer : JSON.stringify(att.answer);
    }

    let correctAnsStr: string | null = null;
    if (att.bankItem.correctAnswer !== null && att.bankItem.correctAnswer !== undefined) {
      correctAnsStr =
        typeof att.bankItem.correctAnswer === "string" ? att.bankItem.correctAnswer : JSON.stringify(att.bankItem.correctAnswer);
    }

    return {
      prompt: att.bankItem.prompt,
      questionType: att.bankItem.type,
      points: att.bankItem.points,
      options: extractOptions(att.bankItem.options),
      studentAnswer: studentAnsStr,
      correctAnswer: correctAnsStr,
      explanation: att.bankItem.explanation,
      isCorrect: att.correct,
      awardedScore: att.correct ? att.bankItem.points : 0,
    };
  });

  const totalPoints = printableQuestions.reduce((sum, q) => sum + (q.points || 0), 0);
  const totalScore = printableQuestions.reduce((sum, q) => sum + (q.awardedScore || 0), 0);

  const docTitle = `Practice Session - ${session.subjectLabel || "General"} (${totalScore}/${totalPoints})`;

  const printableDoc: PrintableDocument = {
    title: docTitle,
    branchName: schoolName,
    watermark: watermarkText,
    date: (session.finishedAt || now).toISOString().split("T")[0],
    instructions: `Student: ${studentName} (${student.admissionNo}) | Score: ${totalScore} / ${totalPoints}`,
    totalPoints,
    kindLabel: "PUPIL PRACTICE REVIEW",
    questions: printableQuestions,
  };

  const pdfBuffer = generateExamPdf(printableDoc);
  const estimatedPages = Math.max(1, Math.ceil(printableQuestions.length / 3));

  if (student.userId) {
    await tx.questionBankPrintLog.create({
      data: {
        tenantId: params.tenantId,
        campusId: session.campusId ?? null,
        targetKind: PrintTargetKind.PRACTICE_SESSION,
        targetId: session.id,
        title: docTitle,
        watermark: watermarkText,
        pageCount: estimatedPages,
        recipientStudentId: student.id,
        printedById: student.userId,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        printedAt: now,
      },
    });
  }

  return {
    pdfBuffer,
    filename: `practice_${session.id.substring(0, 8)}.pdf`,
    title: docTitle,
  };
}

/**
 * Allows a pupil to print their completed practice set response.
 */
export async function printPupilFormResponse(
  tx: Tx,
  params: {
    tenantId: string;
    studentId: string;
    responseId: string;
    ipAddress?: string;
    userAgent?: string;
  },
) {
  const [student, response] = await Promise.all([
    tx.studentRecord.findFirst({
      where: { id: params.studentId, tenantId: params.tenantId },
      include: { campus: { select: { name: true } } },
    }),
    tx.formResponse.findFirst({
      where: { id: params.responseId, studentId: params.studentId, tenantId: params.tenantId },
      include: {
        form: { select: { id: true, title: true, instructions: true, kind: true } },
        answers: {
          orderBy: { formQuestion: { sortOrder: "asc" } },
          include: {
            formQuestion: {
              select: {
                prompt: true,
                questionType: true,
                options: true,
                correctAnswer: true,
                explanation: true,
                points: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!student) {
    throw new PrintingServiceError("Student record not found.", 404, "NOT_FOUND");
  }
  if (!response) {
    throw new PrintingServiceError("Practice set response not found.", 404, "NOT_FOUND");
  }

  const access = canPupilPrintAttempt({ status: response.status });
  if (!access.allowed) {
    throw new PrintingServiceError(access.reason || "Cannot print submission.", 403, "SUBMISSION_NOT_COMPLETED");
  }

  const schoolName = student.campus?.name ?? "Octalve Edu";
  const now = new Date();
  const studentName = `${student.firstName} ${student.lastName}`;

  const watermarkText = generateWatermarkText({
    actorName: studentName,
    actorIdentifier: student.admissionNo,
    branchName: schoolName,
    targetTitle: response.form.title,
    timestamp: now,
  });

  const isPendingReview = response.markingStatus === "PENDING" || response.markingStatus === "PARTIALLY_MARKED";

  const printableQuestions: PrintableQuestion[] = response.answers.map((ans) => {
    let studentAnsStr: string | null = null;
    if (ans.value !== null && ans.value !== undefined) {
      studentAnsStr = typeof ans.value === "string" ? ans.value : JSON.stringify(ans.value);
    }

    const showDetails = !isPendingReview || ans.markingStatus !== "PENDING";

    return {
      prompt: ans.formQuestion.prompt,
      questionType: ans.formQuestion.questionType,
      points: ans.formQuestion.points,
      options: extractOptions(ans.formQuestion.options),
      studentAnswer: studentAnsStr,
      correctAnswer: showDetails ? ans.formQuestion.correctAnswer : "[Pending Teacher Review]",
      explanation: showDetails ? ans.formQuestion.explanation : null,
      isCorrect: ans.isCorrect,
      awardedScore: showDetails ? ans.score : null,
      feedback: ans.feedback,
    };
  });

  const docTitle = `${response.form.title} - Submission Review`;

  const printableDoc: PrintableDocument = {
    title: docTitle,
    branchName: schoolName,
    watermark: watermarkText,
    date: (response.submittedAt || now).toISOString().split("T")[0],
    instructions: `Student: ${studentName} (${student.admissionNo}) | Score: ${response.score ?? 0} / ${response.maxScore ?? 0}`,
    totalPoints: response.maxScore ? Math.round(response.maxScore) : undefined,
    kindLabel: "PUPIL SUBMISSION REVIEW",
    questions: printableQuestions,
  };

  const pdfBuffer = generateExamPdf(printableDoc);
  const estimatedPages = Math.max(1, Math.ceil(printableQuestions.length / 3));

  if (student.userId) {
    await tx.questionBankPrintLog.create({
      data: {
        tenantId: params.tenantId,
        campusId: response.campusId ?? null,
        targetKind: PrintTargetKind.FORM_RESPONSE,
        targetId: response.id,
        title: docTitle,
        watermark: watermarkText,
        pageCount: estimatedPages,
        recipientStudentId: student.id,
        printedById: student.userId,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        printedAt: now,
      },
    });
  }

  return {
    pdfBuffer,
    filename: `response_${response.id.substring(0, 8)}.pdf`,
    title: docTitle,
  };
}
