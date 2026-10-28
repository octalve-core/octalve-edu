import { Prisma, QuestionReportOutcome, QuestionReportStatus } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { effectiveSettingsIn } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { staffMaySee, reviewPower } from "@/lib/question-bank/rules";
import {
  sanitizeReportReason,
  maskReporterForReviewer,
  computeRegradeImpact,
  validateReportOutcome,
  type RegradeImpactSummary,
} from "./reports";

export class ReportServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "REPORT_ERROR",
  ) {
    super(message);
    this.name = "ReportServiceError";
  }
}

/**
 * Submits a question issue report as a teacher.
 */
export async function reportQuestionAsTeacher(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    userId: string;
    itemId: string;
    reason: string;
  },
) {
  const settings = await effectiveSettingsIn(tx, params.tenantId, params.campusId ?? null);
  if (!settings["bank.reports.teachers"]) {
    throw new ReportServiceError("Question reporting by teachers is currently disabled.", 403, "REPORTS_DISABLED");
  }

  const sanitized = sanitizeReportReason(params.reason);
  if (!sanitized.ok) {
    throw new ReportServiceError(sanitized.message, 400, "VALIDATION");
  }

  const viewer = await loadViewer(tx, params.tenantId, params.userId);
  const item = await tx.questionBankItem.findFirst({
    where: { tenantId: params.tenantId, id: params.itemId },
    select: {
      id: true,
      campusId: true,
      subjectKey: true,
      status: true,
      visibility: true,
      visibleFrom: true,
      submittedById: true,
      version: true,
    },
  });

  if (!item) {
    throw new ReportServiceError("Question not found.", 404, "NOT_FOUND");
  }

  if (!staffMaySee(viewer, item, new Date())) {
    throw new ReportServiceError("You are not authorized to view or report this question.", 403, "FORBIDDEN");
  }

  const campus = params.campusId
    ? await tx.campus.findFirst({ where: { tenantId: params.tenantId, id: params.campusId }, select: { name: true } })
    : null;
  const sectionName = campus?.name ?? "General";

  const created = await tx.questionReport.create({
    data: {
      tenantId: params.tenantId,
      campusId: item.campusId ?? params.campusId ?? null,
      bankItemId: item.id,
      reporterRole: "TEACHER",
      reporterUserId: params.userId,
      reason: sanitized.cleanText,
      status: QuestionReportStatus.OPEN,
    },
  });

  await writeBankAudit(tx, {
    tenantId: params.tenantId,
    entity: "ITEM",
    action: "REPORT_FILED",
    campusId: item.campusId ?? params.campusId ?? null,
    itemId: item.id,
    ref: created.id,
    actorUserId: params.userId,
    newValue: {
      reportId: created.id,
      role: "TEACHER",
      section: sectionName,
    },
  });

  return { ok: true, reportId: created.id };
}

/**
 * Submits a question issue report as a pupil from practice.
 */
export async function reportQuestionAsPupil(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    userId: string;
    studentId: string;
    itemId: string;
    reason: string;
  },
) {
  const settings = await effectiveSettingsIn(tx, params.tenantId, params.campusId ?? null);
  if (!settings["bank.reports.pupils"]) {
    throw new ReportServiceError("Question reporting by pupils is currently disabled.", 403, "REPORTS_DISABLED");
  }

  const sanitized = sanitizeReportReason(params.reason);
  if (!sanitized.ok) {
    throw new ReportServiceError(sanitized.message, 400, "VALIDATION");
  }

  // Invariant: Pupils can only report questions they have practised
  const [attempt, item, student] = await Promise.all([
    tx.practiceAttempt.findFirst({
      where: {
        tenantId: params.tenantId,
        studentId: params.studentId,
        bankItemId: params.itemId,
      },
      select: { id: true, version: true },
    }),
    tx.questionBankItem.findFirst({
      where: { tenantId: params.tenantId, id: params.itemId },
      select: { id: true, campusId: true, version: true },
    }),
    tx.studentRecord.findFirst({
      where: { tenantId: params.tenantId, id: params.studentId },
      include: { campus: { select: { name: true } } },
    }),
  ]);

  if (!item) {
    throw new ReportServiceError("Question not found.", 404, "NOT_FOUND");
  }

  if (!attempt) {
    throw new ReportServiceError("Pupils can only report questions they have practised.", 400, "NOT_PRACTISED");
  }

  const sectionName = student?.campus?.name ?? "General";

  const created = await tx.questionReport.create({
    data: {
      tenantId: params.tenantId,
      campusId: item.campusId ?? params.campusId ?? null,
      bankItemId: item.id,
      reporterRole: "PUPIL",
      reporterUserId: params.userId,
      reporterStudentId: params.studentId,
      reason: sanitized.cleanText,
      status: QuestionReportStatus.OPEN,
    },
  });

  await writeBankAudit(tx, {
    tenantId: params.tenantId,
    entity: "ITEM",
    action: "REPORT_FILED",
    campusId: item.campusId ?? params.campusId ?? null,
    itemId: item.id,
    ref: created.id,
    actorUserId: params.userId,
    newValue: {
      reportId: created.id,
      role: "PUPIL",
      section: sectionName,
    },
  });

  return { ok: true, reportId: created.id };
}

/**
 * Lists question reports for reviewers with masked reporter identity (NDPA compliance).
 */
export async function listReportsForReviewer(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    userId: string;
    status?: QuestionReportStatus | "ALL";
    itemId?: string;
  },
) {
  const viewer = await loadViewer(tx, params.tenantId, params.userId);
  const where: Prisma.QuestionReportWhereInput = {
    tenantId: params.tenantId,
  };

  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  } else if (!params.status) {
    where.status = QuestionReportStatus.OPEN;
  }

  if (params.itemId) {
    where.bankItemId = params.itemId;
  }

  if (params.campusId) {
    where.OR = [{ campusId: params.campusId }, { campusId: null }];
  } else if (!viewer.isSchoolAdmin) {
    const campusIds = viewer.memberships.map((m) => m.campusId).filter((c): c is string => c !== null);
    where.OR = [{ campusId: { in: campusIds } }, { campusId: null }];
  }

  const reports = await tx.questionReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      bankItem: {
        select: {
          id: true,
          prompt: true,
          type: true,
          subjectLabel: true,
          topic: true,
          version: true,
          status: true,
        },
      },
      campus: { select: { name: true } },
    },
  });

  // Calculate re-grade impact for items that have reports
  const itemIds = [...new Set(reports.map((r) => r.bankItemId))];
  const copiedQuestions = await tx.quizQuestion.findMany({
    where: { tenantId: params.tenantId, sourceItemId: { in: itemIds } },
    select: {
      sourceItemId: true,
      id: true,
      quizId: true,
      quiz: { select: { title: true, _count: { select: { attempts: true } } } },
    },
  });

  const impactMap = new Map<string, RegradeImpactSummary>();
  for (const itemId of itemIds) {
    const matches = copiedQuestions
      .filter((q) => q.sourceItemId === itemId)
      .map((q) => ({
        quizId: q.quizId,
        quizTitle: q.quiz.title,
        questionId: q.id,
        attemptsCount: q.quiz._count.attempts,
      }));
    impactMap.set(itemId, computeRegradeImpact(matches));
  }

  return reports.map((r) => ({
    id: r.id,
    itemId: r.bankItemId,
    item: r.bankItem,
    reason: r.reason,
    status: r.status,
    outcome: r.outcome,
    outcomeReason: r.explanation,
    reporter: maskReporterForReviewer({
      reporterRole: r.reporterRole as "TEACHER" | "PUPIL",
      reporterSection: r.campus?.name,
      branchName: r.campus?.name,
    }),
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    regradeImpact: impactMap.get(r.bankItemId) ?? null,
  }));
}

/**
 * Resolves a question report with an outcome, reason, and optional assessment re-grade offer.
 */
export async function resolveQuestionReport(
  tx: Tx,
  params: {
    tenantId: string;
    userId: string;
    reportId: string;
    outcome: QuestionReportOutcome;
    outcomeReason: string;
    applyRegrade?: boolean;
  },
) {
  const validated = validateReportOutcome(params.outcome, params.outcomeReason);
  if (!validated.ok) {
    throw new ReportServiceError(validated.message, 400, "VALIDATION");
  }

  const [viewer, report] = await Promise.all([
    loadViewer(tx, params.tenantId, params.userId),
    tx.questionReport.findFirst({
      where: { tenantId: params.tenantId, id: params.reportId },
      include: { bankItem: { select: { id: true, campusId: true, subjectKey: true } } },
    }),
  ]);

  if (!report) {
    throw new ReportServiceError("Report not found.", 404, "NOT_FOUND");
  }

  if (report.status !== QuestionReportStatus.OPEN) {
    throw new ReportServiceError("This report has already been resolved or dismissed.", 400, "ALREADY_RESOLVED");
  }

  const power = reviewPower(viewer, report.bankItem);
  if (!power.mayReview) {
    throw new ReportServiceError("You are not authorized to resolve reports for this question.", 403, "FORBIDDEN");
  }

  let regradeCount = 0;

  // If FIXED and applyRegrade requested, update linked quiz questions
  if (params.applyRegrade && validated.outcome === QuestionReportOutcome.FIXED) {
    const updatedQuestions = await tx.quizQuestion.updateMany({
      where: { tenantId: params.tenantId, sourceItemId: report.bankItemId },
      data: { exposedToPractice: true },
    });
    regradeCount = updatedQuestions.count;
  }

  const updated = await tx.questionReport.update({
    where: { id: report.id },
    data: {
      status: validated.targetStatus,
      outcome: validated.outcome,
      explanation: validated.outcomeReason,
      resolvedById: params.userId,
      resolvedAt: new Date(),
    },
  });

  await writeBankAudit(tx, {
    tenantId: params.tenantId,
    entity: "ITEM",
    action: "REPORT_RESOLVED",
    campusId: report.campusId,
    itemId: report.bankItemId,
    ref: report.id,
    actorUserId: params.userId,
    oldValue: { status: report.status },
    newValue: {
      status: validated.targetStatus,
      outcome: validated.outcome,
      outcomeReason: validated.outcomeReason,
      regradeApplied: Boolean(params.applyRegrade),
    },
  });

  return {
    ok: true,
    reportId: updated.id,
    status: updated.status,
    outcome: updated.outcome,
    outcomeReason: updated.explanation,
    regradeCount,
  };
}

/**
 * Returns reports filed by a pupil with outcomes visible to the student.
 */
export async function getPupilReportHistory(
  tx: Tx,
  params: {
    tenantId: string;
    studentId: string;
  },
) {
  const reports = await tx.questionReport.findMany({
    where: { tenantId: params.tenantId, reporterStudentId: params.studentId },
    orderBy: { createdAt: "desc" },
    include: {
      bankItem: {
        select: {
          prompt: true,
          subjectLabel: true,
          topic: true,
        },
      },
    },
  });

  return reports.map((r) => ({
    id: r.id,
    questionPrompt: r.bankItem.prompt,
    subjectLabel: r.bankItem.subjectLabel,
    topic: r.bankItem.topic,
    reason: r.reason,
    status: r.status,
    outcome: r.outcome,
    outcomeReason: r.explanation,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
  }));
}
