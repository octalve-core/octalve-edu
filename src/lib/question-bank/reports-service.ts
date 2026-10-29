import { Prisma, QuestionReportOutcome, QuestionReportStatus } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { effectiveSettingsIn } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { staffMaySee, reviewPower } from "@/lib/question-bank/rules";
import { copyFromBankItem, type BankItemToCopy } from "./assessments";
import { MAX_REGRADE_ATTEMPTS, groupChanges, planAttemptRegrade, type AttemptChange } from "./regrade";
import {
  sanitizeReportReason,
  maskReporterForReviewer,
  pupilCellsAtMinimum,
  reportCell,
  reportLimitReached,
  startOfUtcDay,
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

const ALREADY_REPORTED = "You have already reported this question; your report is waiting for a reviewer.";

/// Serialises the reports of one person, so two sent at the same moment are one and cannot slip past the limits: the checks (one open report per question, how many in all) and the filing
/// of a new report are made together, inside the transaction, with this lock held until it ends.
async function lockReporter(tx: Tx, reporter: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${reporter}`}::text))`;
}

/// Refuses a report from a person who has too many waiting or has made too many today (429 `REPORT_LIMIT`). `who` is the filter that picks out their reports.
async function enforceReportLimits(tx: Tx, role: "PUPIL" | "TEACHER", who: Prisma.QuestionReportWhereInput) {
  const [openCount, todayCount] = await Promise.all([
    tx.questionReport.count({ where: { ...who, status: QuestionReportStatus.OPEN } }),
    tx.questionReport.count({ where: { ...who, createdAt: { gte: startOfUtcDay() } } }),
  ]);
  const reached = reportLimitReached(role, openCount, todayCount);
  if (reached === "OPEN") {
    throw new ReportServiceError("You have too many reports waiting for a reviewer. Wait until some are answered.", 429, "REPORT_LIMIT");
  }
  if (reached === "DAY") {
    throw new ReportServiceError("You have made the most reports allowed in a day. Try again tomorrow.", 429, "REPORT_LIMIT");
  }
}

/**
 * Submits a question issue report as a teacher. A person has one open report on a question: another is refused (`ALREADY_REPORTED`) until a reviewer has resolved the first. A teacher may have
 * 20 reports waiting and make 50 a day (`REPORT_LIMIT`, 429).
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

  await lockReporter(tx, `user:${params.userId}`);
  const open = await tx.questionReport.findFirst({
    where: {
      tenantId: params.tenantId,
      bankItemId: item.id,
      reporterUserId: params.userId,
      reporterRole: "TEACHER",
      status: QuestionReportStatus.OPEN,
    },
    select: { id: true },
  });
  if (open) throw new ReportServiceError(ALREADY_REPORTED, 400, "ALREADY_REPORTED");
  await enforceReportLimits(tx, "TEACHER", { tenantId: params.tenantId, reporterUserId: params.userId, reporterRole: "TEACHER" });

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
 * Submits a question issue report as a pupil from practice. One open report on a question per pupil (`ALREADY_REPORTED`); at most 10 waiting and 20 a day (`REPORT_LIMIT`, 429).
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

  await lockReporter(tx, `pupil:${params.studentId}`);
  const open = await tx.questionReport.findFirst({
    where: { tenantId: params.tenantId, bankItemId: item.id, reporterStudentId: params.studentId, status: QuestionReportStatus.OPEN },
    select: { id: true },
  });
  if (open) throw new ReportServiceError(ALREADY_REPORTED, 400, "ALREADY_REPORTED");
  await enforceReportLimits(tx, "PUPIL", { tenantId: params.tenantId, reporterStudentId: params.studentId });

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
 * Lists question reports for reviewers with masked reporter identity (NDPA compliance). The queue is the reviewers': a report is listed only for a person who may review its question
 * (`reviewPower`: the rule that lets them resolve it, and the one the queue of pending questions uses); anyone else gets an empty list. A pupil's report names the pupil's campus only
 * once at least `bank.smallSummary.min` different pupils of it have reported the question (`pupilCellsAtMinimum`), otherwise the reviewer sees "Pupil".
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

  const found = await tx.questionReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      bankItem: {
        select: {
          id: true,
          campusId: true,
          subjectKey: true,
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

  const reports = found.filter((r) => reviewPower(viewer, { campusId: r.bankItem.campusId, subjectKey: r.bankItem.subjectKey }).mayReview);

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

  // How many different pupils of a campus have reported a question counts every pupil report of it, whatever its status and whatever the list was filtered to.
  const pupilReports = itemIds.length
    ? await tx.questionReport.findMany({
        where: { tenantId: params.tenantId, bankItemId: { in: itemIds }, reporterRole: "PUPIL" },
        select: { bankItemId: true, campusId: true, reporterStudentId: true },
      })
    : [];
  const placed = pupilReports.map((r) => ({
    itemId: r.bankItemId,
    reporterSection: r.campusId ?? "-",
    reporterStudentId: r.reporterStudentId,
  }));
  const minimumByCampus = new Map<string | null, number>();
  for (const campusId of new Set(reports.map((r) => r.campusId))) {
    minimumByCampus.set(campusId, (await effectiveSettingsIn(tx, params.tenantId, campusId))["bank.smallSummary.min"]);
  }
  const named = new Map<number, Set<string>>();
  const namedAt = (minimum: number) => {
    if (!named.has(minimum)) named.set(minimum, pupilCellsAtMinimum(placed, minimum));
    return named.get(minimum)!;
  };

  return reports.map((r) => ({
    id: r.id,
    itemId: r.bankItemId,
    item: {
      id: r.bankItem.id,
      prompt: r.bankItem.prompt,
      type: r.bankItem.type,
      subjectLabel: r.bankItem.subjectLabel,
      topic: r.bankItem.topic,
      version: r.bankItem.version,
      status: r.bankItem.status,
    },
    reason: r.reason,
    status: r.status,
    outcome: r.outcome,
    outcomeReason: r.explanation,
    reporter: maskReporterForReviewer({
      reporterRole: r.reporterRole as "TEACHER" | "PUPIL",
      reporterSection: r.campus?.name,
      branchName: r.campus?.name,
      showSection: r.reporterRole !== "PUPIL" || namedAt(minimumByCampus.get(r.campusId)!).has(reportCell(r.bankItemId, r.campusId ?? "-")),
    }),
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    regradeImpact: impactMap.get(r.bankItemId) ?? null,
  }));
}

export interface CorrectionSummary {
  copiesCorrected: number;
  attemptsChecked: number;
  attemptsChanged: number;
  attemptsUnreadable: number;
  skippedArchived: number;
}

/// How many changed attempts the audit row lists one by one (the counts always cover all of them).
const AUDITED_CHANGES = 200;

/**
 * Puts the corrected question into the assessments that copied it, and scores the attempts already made again. An exception to "past papers are immutable", so it is narrow:
 *   - only the copies in the CAMPUS the report came from (a school-wide question may be copied in other campuses; their teachers are not changed under them); a school-wide report, made with
 *     no campus, reaches the whole school's copies;
 *   - only copies that are behind the question's version, and not in archived quizzes (past papers), which are counted and left as they were;
 *   - a copy takes the corrected prompt, type, options and key; its points are the quiz's own and stay, and so does its place in the quiz;
 *   - the finished attempts of the affected quizzes are scored again with the rule a quiz is graded by (`planAttemptRegrade`); attempts whose stored answers cannot be read are left alone;
 *   - more than `MAX_REGRADE_ATTEMPTS` attempts are refused before anything is written (`TOO_MANY_ATTEMPTS`): the correction is all or nothing, and runs in the request's transaction;
 *   - what was done is written to the audit trail with the scores before and after.
 */
async function applyCorrection(
  tx: Tx,
  p: { tenantId: string; reportId: string; campusId: string | null; itemId: string; actorUserId: string },
): Promise<CorrectionSummary> {
  const item = await tx.questionBankItem.findFirstOrThrow({ where: { tenantId: p.tenantId, id: p.itemId } });
  const inCampus = p.campusId ? { campusId: p.campusId } : {};

  const behind = { tenantId: p.tenantId, sourceItemId: item.id, OR: [{ sourceVersion: null }, { sourceVersion: { lt: item.version } }] };
  const [skippedArchived, copies] = await Promise.all([
    tx.quizQuestion.count({ where: { ...behind, quiz: { ...inCampus, archivedAt: { not: null } } } }),
    tx.quizQuestion.findMany({ where: { ...behind, quiz: { ...inCampus, archivedAt: null } }, select: { id: true, quizId: true } }),
  ]);
  if (copies.length === 0) {
    const none: CorrectionSummary = { copiesCorrected: 0, attemptsChecked: 0, attemptsChanged: 0, attemptsUnreadable: 0, skippedArchived };
    await auditCorrection(tx, p, item.version, none, []);
    return none;
  }

  const quizIds = [...new Set(copies.map((c) => c.quizId))];
  const finished = { tenantId: p.tenantId, quizId: { in: quizIds }, completedAt: { not: null } };
  const attemptCount = await tx.quizAttempt.count({ where: finished });
  if (attemptCount > MAX_REGRADE_ATTEMPTS) {
    throw new ReportServiceError(
      `This correction would score ${attemptCount} attempts again; the most one correction does is ${MAX_REGRADE_ATTEMPTS}. Nothing was changed.`,
      400,
      "TOO_MANY_ATTEMPTS",
    );
  }

  const corrected = copyFromBankItem(item as unknown as BankItemToCopy);
  await tx.quizQuestion.updateMany({
    where: { tenantId: p.tenantId, id: { in: copies.map((c) => c.id) } },
    data: {
      prompt: corrected.prompt,
      questionType: corrected.questionType,
      options: corrected.options,
      correctAnswer: corrected.correctAnswer,
      sourceVersion: corrected.sourceVersion,
    },
  });

  // The quizzes are read after the copies are corrected, so the attempts are scored against the questions as they now are.
  const [quizzes, attempts] = await Promise.all([
    tx.quiz.findMany({
      where: { tenantId: p.tenantId, id: { in: quizIds } },
      select: { id: true, passingScore: true, questions: { select: { id: true, questionType: true, correctAnswer: true, points: true } } },
    }),
    tx.quizAttempt.findMany({ where: finished, select: { id: true, quizId: true, answers: true, score: true, isPassed: true } }),
  ]);
  const changes: AttemptChange[] = [];
  let unreadable = 0;
  for (const quiz of quizzes) {
    const plan = planAttemptRegrade(
      quiz.questions,
      quiz.passingScore,
      attempts.filter((a) => a.quizId === quiz.id),
    );
    changes.push(...plan.changes);
    unreadable += plan.unreadable;
  }
  for (const group of groupChanges(changes)) {
    await tx.quizAttempt.updateMany({
      where: { tenantId: p.tenantId, id: { in: group.attemptIds } },
      data: { score: group.score, isPassed: group.isPassed },
    });
  }

  const summary: CorrectionSummary = {
    copiesCorrected: copies.length,
    attemptsChecked: attempts.length,
    attemptsChanged: changes.length,
    attemptsUnreadable: unreadable,
    skippedArchived,
  };
  await auditCorrection(tx, p, item.version, summary, changes);
  return summary;
}

async function auditCorrection(
  tx: Tx,
  p: { tenantId: string; reportId: string; campusId: string | null; itemId: string; actorUserId: string },
  itemVersion: number,
  summary: CorrectionSummary,
  changes: AttemptChange[],
) {
  await writeBankAudit(tx, {
    tenantId: p.tenantId,
    entity: "ITEM",
    action: "REGRADE_APPLIED",
    campusId: p.campusId,
    itemId: p.itemId,
    ref: p.reportId,
    actorUserId: p.actorUserId,
    newValue: {
      itemVersion,
      ...summary,
      changes: changes.slice(0, AUDITED_CHANGES),
      changesTruncated: changes.length > AUDITED_CHANGES,
    } as unknown as Prisma.InputJsonValue,
  });
}

/**
 * Resolves a question report with an outcome, reason, and optional correction of the assessments that copied the question. A report is resolved once: the report is claimed with a
 * conditional update (it must still be open), so reviewers resolving it at the same moment cannot each succeed, write an audit row and apply a re-grade.
 *
 * `applyRegrade` is the explicit exception to "past papers are immutable" (see `applyCorrection`): only for a report resolved as FIXED and a question that is APPROVED; all or nothing.
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

  if (params.applyRegrade && validated.outcome !== QuestionReportOutcome.FIXED) {
    throw new ReportServiceError(
      "A correction can only be applied to assessments when the report is resolved as fixed.",
      400,
      "VALIDATION",
    );
  }

  const [viewer, report] = await Promise.all([
    loadViewer(tx, params.tenantId, params.userId),
    tx.questionReport.findFirst({
      where: { tenantId: params.tenantId, id: params.reportId },
      include: { bankItem: { select: { id: true, campusId: true, subjectKey: true, status: true } } },
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

  if (params.applyRegrade && report.bankItem.status !== "APPROVED") {
    throw new ReportServiceError("Approve the corrected question before applying it to assessments.", 400, "ITEM_NOT_APPROVED");
  }

  let regrade: CorrectionSummary | null = null;

  const claimed = await tx.questionReport.updateMany({
    where: { tenantId: params.tenantId, id: report.id, status: QuestionReportStatus.OPEN },
    data: {
      status: validated.targetStatus,
      outcome: validated.outcome,
      explanation: validated.outcomeReason,
      resolvedById: params.userId,
      resolvedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    throw new ReportServiceError("This report has already been resolved or dismissed.", 400, "ALREADY_RESOLVED");
  }

  // FIXED with the correction asked for: the copies are corrected and the attempts scored again, in this same transaction
  if (params.applyRegrade) {
    regrade = await applyCorrection(tx, {
      tenantId: params.tenantId,
      reportId: report.id,
      campusId: report.campusId,
      itemId: report.bankItemId,
      actorUserId: params.userId,
    });
  }

  const updated = await tx.questionReport.findFirstOrThrow({ where: { tenantId: params.tenantId, id: report.id } });

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
    regradeCount: (regrade as CorrectionSummary | null)?.copiesCorrected ?? 0,
    regrade: regrade as CorrectionSummary | null,
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
