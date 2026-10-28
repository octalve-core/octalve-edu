import { Prisma, PracticeFeedbackMode, Role } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { normalizeLabel } from "@/lib/question-bank/labels";
import { effectiveSettingsIn } from "@/lib/question-bank/settings-service";
import {
  scrubQuestionForPupil,
  evaluatePracticeAnswer,
  computeDailyCapRemaining,
  determineSessionSize,
  aggregateGuardianSummary,
  type GuardianPracticeSummary,
} from "./practice";

export class PracticeError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "PRACTICE_ERROR",
  ) {
    super(message);
    this.name = "PracticeError";
  }
}

/**
 * Returns beginning of today in UTC.
 */
function getStartOfTodayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Shuffles an array in place (Fisher-Yates).
 */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Resolves the StudentRecord for a signed-in student user.
 */
export async function resolveStudentForUser(tx: Tx, tenantId: string, userId: string) {
  const student = await tx.studentRecord.findFirst({
    where: { tenantId, userId, archivedAt: null },
    include: {
      campus: { select: { id: true, name: true } },
    },
  });
  return student;
}

/**
 * Retrieves pupil's active class group enrollment.
 */
export async function getStudentClassGroup(tx: Tx, tenantId: string, studentId: string) {
  const enrollment = await tx.studentEnrollment.findFirst({
    where: { tenantId, studentId, status: "ACTIVE" },
    orderBy: { enrolledAt: "desc" },
    include: {
      classArm: {
        select: {
          classGroupId: true,
          classGroup: { select: { id: true, name: true } },
        },
      },
    },
  });

  const classGroupId = enrollment?.classArm?.classGroupId ?? null;
  const classGroupName = enrollment?.classArm?.classGroup?.name ?? null;
  const classKey = classGroupName ? normalizeLabel(classGroupName) : null;

  return { classGroupId, classGroupName, classKey };
}

/**
 * Counts questions attempted by student today in UTC.
 */
async function countTodayAttempts(tx: Tx, tenantId: string, studentId: string, now = new Date()): Promise<number> {
  const todayUtc = getStartOfTodayUtc(now);
  return tx.practiceAttempt.count({
    where: {
      tenantId,
      studentId,
      answeredAt: { gte: todayUtc },
    },
  });
}

/**
 * Returns available practice subjects, topics, and question counts for a student.
 */
export async function getPracticeOptions(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    studentId: string;
    role: Role;
    now?: Date;
  },
) {
  const now = params.now ?? new Date();
  const settings = await effectiveSettingsIn(tx, params.tenantId, params.campusId ?? null);

  if (!settings["bank.access.pupils"]) {
    return { available: false, reason: "Practice is closed for this school." };
  }

  const { classGroupName, classKey } = await getStudentClassGroup(tx, params.tenantId, params.studentId);
  const todayAttempts = await countTodayAttempts(tx, params.tenantId, params.studentId, now);
  const dailyCap = settings["bank.practice.dailyCap"];
  const dailyCapRemaining = computeDailyCapRemaining(todayAttempts, dailyCap);

  // Query pool of active PRACTICE items
  const where: Prisma.QuestionBankItemWhereInput = {
    tenantId: params.tenantId,
    bank: "ASSESSMENT",
    status: "APPROVED",
    OR: params.campusId ? [{ campusId: params.campusId }, { campusId: null }] : [{ campusId: null }],
    AND: [
      {
        OR: [{ visibility: "PRACTICE" }, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: { lte: now } }],
      },
    ],
  };

  if (classKey) {
    (where.AND as Prisma.QuestionBankItemWhereInput[]).push({
      OR: [{ classTags: { none: {} } }, { classTags: { some: { labelKey: classKey } } }],
    });
  }

  const items = await tx.questionBankItem.findMany({
    where,
    select: {
      subjectLabel: true,
      subjectKey: true,
      topic: true,
    },
  });

  const subjectMap = new Map<string, { label: string; count: number; topics: Map<string, number> }>();
  for (const item of items) {
    const subLabel = item.subjectLabel?.trim() || "General";
    const subKey = item.subjectKey || normalizeLabel(subLabel);
    const topic = item.topic?.trim() || "All Topics";

    const cur = subjectMap.get(subKey) ?? { label: subLabel, count: 0, topics: new Map() };
    cur.count++;
    cur.topics.set(topic, (cur.topics.get(topic) ?? 0) + 1);
    subjectMap.set(subKey, cur);
  }

  const minPoolSize = settings["bank.practice.minPoolSize"];
  const availableSubjects: Array<{ subject: string; count: number; topics: Array<{ topic: string; count: number }> }> = [];

  for (const [, val] of subjectMap.entries()) {
    if (val.count >= minPoolSize) {
      availableSubjects.push({
        subject: val.label,
        count: val.count,
        topics: Array.from(val.topics.entries()).map(([topic, count]) => ({ topic, count })),
      });
    }
  }

  return {
    available: true,
    classGroupName,
    dailyCap,
    todayAttempted: todayAttempts,
    dailyCapRemaining,
    minPoolSize,
    defaultQuestions: settings["bank.practice.defaultQuestions"],
    presets: settings["bank.practice.presets"],
    subjects: availableSubjects,
  };
}

/**
 * Starts a new pupil practice session, drawing a randomized question set.
 */
export async function startPracticeSession(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    studentId: string;
    role: Role;
    subjectLabel?: string;
    topic?: string;
    size?: number;
    feedbackMode?: PracticeFeedbackMode;
    now?: Date;
  },
) {
  const now = params.now ?? new Date();
  if (params.role !== Role.STUDENT && params.role !== Role.ADMIN) {
    throw new PracticeError("Your sign-in does not include student practice.", 403, "PORTAL_ACCESS");
  }

  const settings = await effectiveSettingsIn(tx, params.tenantId, params.campusId ?? null);

  if (!settings["bank.access.pupils"]) {
    throw new PracticeError("Practice is currently closed.", 403, "PRACTICE_CLOSED");
  }

  const todayAttempts = await countTodayAttempts(tx, params.tenantId, params.studentId, now);
  const dailyCap = settings["bank.practice.dailyCap"];
  const dailyCapRemaining = computeDailyCapRemaining(todayAttempts, dailyCap);

  if (dailyCapRemaining <= 0) {
    throw new PracticeError("Daily practice limit reached. Try again tomorrow.", 429, "DAILY_CAP_REACHED");
  }

  const { classGroupId, classKey } = await getStudentClassGroup(tx, params.tenantId, params.studentId);

  const where: Prisma.QuestionBankItemWhereInput = {
    tenantId: params.tenantId,
    bank: "ASSESSMENT",
    status: "APPROVED",
    OR: params.campusId ? [{ campusId: params.campusId }, { campusId: null }] : [{ campusId: null }],
    AND: [
      {
        OR: [{ visibility: "PRACTICE" }, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: { lte: now } }],
      },
    ],
  };

  if (classKey) {
    (where.AND as Prisma.QuestionBankItemWhereInput[]).push({
      OR: [{ classTags: { none: {} } }, { classTags: { some: { labelKey: classKey } } }],
    });
  }
  if (params.subjectLabel) {
    where.subjectKey = normalizeLabel(params.subjectLabel);
  }
  if (params.topic) {
    where.topic = params.topic;
  }

  const items = await tx.questionBankItem.findMany({
    where,
    select: {
      id: true,
      bank: true,
      status: true,
      type: true,
      prompt: true,
      explanation: true,
      points: true,
      difficulty: true,
      topic: true,
      options: true,
      correctAnswer: true,
      subjectLabel: true,
      subjectKey: true,
      visibility: true,
      visibleFrom: true,
    },
  });

  const minPoolSize = settings["bank.practice.minPoolSize"];
  if (items.length < minPoolSize) {
    throw new PracticeError("Practice pool is too small for this selection.", 400, "POOL_TOO_SMALL");
  }

  const sessionSize = Math.min(
    determineSessionSize(params.size, items.length, {
      maxQuestions: settings["bank.practice.maxQuestions"],
      defaultQuestions: settings["bank.practice.defaultQuestions"],
      presets: settings["bank.practice.presets"],
    }),
    dailyCapRemaining,
  );

  if (sessionSize <= 0) {
    throw new PracticeError("Cannot start session with 0 questions.", 400, "INVALID_SIZE");
  }

  const shuffled = shuffle(items).slice(0, sessionSize);
  const selectedIds = shuffled.map((i) => i.id);

  const session = await tx.practiceSession.create({
    data: {
      tenantId: params.tenantId,
      campusId: params.campusId ?? null,
      studentId: params.studentId,
      classGroupId,
      subjectLabel: params.subjectLabel?.trim() || "General",
      subjectKey: params.subjectLabel ? normalizeLabel(params.subjectLabel) : "general",
      topic: params.topic?.trim() ?? null,
      size: sessionSize,
      feedbackMode: params.feedbackMode ?? PracticeFeedbackMode.EACH,
      itemIds: selectedIds,
    },
  });

  return {
    session: {
      id: session.id,
      size: session.size,
      feedbackMode: session.feedbackMode,
      startedAt: session.startedAt,
      subjectLabel: session.subjectLabel,
      topic: session.topic,
    },
    questions: shuffled.map(scrubQuestionForPupil),
  };
}

/**
 * Submits an answer for a question in a practice session.
 */
export async function submitPracticeAnswer(
  tx: Tx,
  params: {
    tenantId: string;
    studentId: string;
    role: Role;
    sessionId: string;
    bankItemId: string;
    answer: unknown;
  },
) {
  if (params.role !== Role.STUDENT && params.role !== Role.ADMIN) {
    throw new PracticeError("Your sign-in does not include student practice.", 403, "PORTAL_ACCESS");
  }

  const session = await tx.practiceSession.findFirst({
    where: { tenantId: params.tenantId, id: params.sessionId },
  });

  if (!session || session.studentId !== params.studentId) {
    throw new PracticeError("Practice session not found", 404, "NOT_FOUND");
  }

  if (session.finishedAt) {
    throw new PracticeError("This practice session has already been completed.", 400, "SESSION_FINISHED");
  }

  const itemIds = session.itemIds as string[];
  if (!itemIds.includes(params.bankItemId)) {
    throw new PracticeError("Question is not part of this practice session.", 400, "INVALID_QUESTION");
  }

  const existing = await tx.practiceAttempt.findFirst({
    where: { tenantId: params.tenantId, sessionId: session.id, bankItemId: params.bankItemId },
  });
  if (existing) {
    throw new PracticeError("You have already answered this question in this session.", 400, "ALREADY_ANSWERED");
  }

  const item = await tx.questionBankItem.findFirst({
    where: { tenantId: params.tenantId, id: params.bankItemId },
    select: {
      id: true,
      type: true,
      correctAnswer: true,
      explanation: true,
      version: true,
    },
  });

  if (!item) {
    throw new PracticeError("Question not found", 404, "NOT_FOUND");
  }

  const evaluation = evaluatePracticeAnswer(item, params.answer);

  await tx.practiceAttempt.create({
    data: {
      tenantId: params.tenantId,
      sessionId: session.id,
      studentId: params.studentId,
      bankItemId: item.id,
      version: item.version,
      answer: (params.answer ?? null) as Prisma.InputJsonValue,
      correct: evaluation.correct,
    },
  });

  if (session.feedbackMode === PracticeFeedbackMode.EACH) {
    return {
      ok: true,
      answered: true,
      correct: evaluation.correct,
      correctAnswer: evaluation.correctAnswer,
      explanation: evaluation.explanation,
    };
  }

  // Under END mode: acknowledge answer without revealing answer key or explanation
  return {
    ok: true,
    answered: true,
  };
}

/**
 * Concludes a practice session and returns full session summary.
 */
export async function finishPracticeSession(
  tx: Tx,
  params: {
    tenantId: string;
    studentId: string;
    role: Role;
    sessionId: string;
  },
) {
  if (params.role !== Role.STUDENT && params.role !== Role.ADMIN) {
    throw new PracticeError("Your sign-in does not include student practice.", 403, "PORTAL_ACCESS");
  }

  const session = await tx.practiceSession.findFirst({
    where: { tenantId: params.tenantId, id: params.sessionId },
    include: { attempts: true },
  });

  if (!session || session.studentId !== params.studentId) {
    throw new PracticeError("Practice session not found", 404, "NOT_FOUND");
  }

  const finishedAt = session.finishedAt ?? new Date();
  if (!session.finishedAt) {
    await tx.practiceSession.update({
      where: { id: session.id },
      data: { finishedAt },
    });
  }

  const itemIds = session.itemIds as string[];
  const items = await tx.questionBankItem.findMany({
    where: { tenantId: params.tenantId, id: { in: itemIds } },
    select: {
      id: true,
      prompt: true,
      type: true,
      options: true,
      correctAnswer: true,
      explanation: true,
    },
  });

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const detailedAttempts = session.attempts.map((att) => {
    const q = itemMap.get(att.bankItemId);
    return {
      id: att.id,
      bankItemId: att.bankItemId,
      prompt: q?.prompt ?? "",
      answer: att.answer,
      correct: att.correct,
      correctAnswer: q?.correctAnswer ?? null,
      explanation: q?.explanation ?? null,
      answeredAt: att.answeredAt,
    };
  });

  const totalCorrect = session.attempts.filter((a) => a.correct).length;

  return {
    id: session.id,
    size: session.size,
    feedbackMode: session.feedbackMode,
    startedAt: session.startedAt,
    finishedAt,
    totalAttempted: session.attempts.length,
    totalCorrect,
    overallAccuracy: session.attempts.length > 0 ? Math.round((totalCorrect / session.attempts.length) * 100) : 0,
    attempts: detailedAttempts,
  };
}

/**
 * Retrieves pupil's practice history, conforming to pupil vs guardian privacy levels.
 */
export async function getPracticeHistory(
  tx: Tx,
  params: {
    tenantId: string;
    campusId?: string | null;
    studentId: string;
    role: Role;
    archived?: boolean;
  },
) {
  const settings = await effectiveSettingsIn(tx, params.tenantId, params.campusId ?? null);

  if (params.role === Role.PARENT) {
    const guardianView = settings["bank.parents.view"];
    if (guardianView === "NONE") {
      throw new PracticeError("Practice view is disabled for guardians.", 403, "PORTAL_ACCESS");
    }

    if (guardianView === "SUMMARY") {
      const sessionsCount = await tx.practiceSession.count({
        where: { tenantId: params.tenantId, studentId: params.studentId },
      });

      const attempts = await tx.practiceAttempt.findMany({
        where: {
          tenantId: params.tenantId,
          studentId: params.studentId,
          archivedAt: null,
        },
        include: {
          bankItem: { select: { subjectLabel: true, topic: true } },
        },
      });

      const summary: GuardianPracticeSummary = aggregateGuardianSummary(
        sessionsCount,
        attempts.map((a) => ({
          correct: a.correct,
          subjectLabel: a.bankItem.subjectLabel,
          topic: a.bankItem.topic,
        })),
      );

      return { mode: "SUMMARY" as const, summary };
    }
  }

  // FULL mode: detailed session and attempts list
  const sessions = await tx.practiceSession.findMany({
    where: { tenantId: params.tenantId, studentId: params.studentId },
    orderBy: { startedAt: "desc" },
    include: {
      attempts: {
        where: params.archived ? { archivedAt: { not: null } } : { archivedAt: null },
        include: {
          bankItem: {
            select: { prompt: true, type: true, options: true, correctAnswer: true, explanation: true },
          },
        },
        orderBy: { answeredAt: "asc" },
      },
    },
  });

  return {
    mode: "FULL" as const,
    sessions: sessions.map((s) => ({
      id: s.id,
      size: s.size,
      feedbackMode: s.feedbackMode,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      subjectLabel: s.subjectLabel,
      topic: s.topic,
      totalAttempted: s.attempts.length,
      totalCorrect: s.attempts.filter((a) => a.correct).length,
      attempts: s.attempts.map((a) => ({
        id: a.id,
        bankItemId: a.bankItemId,
        prompt: a.bankItem.prompt,
        answer: a.answer,
        correct: a.correct,
        correctAnswer: a.bankItem.correctAnswer,
        explanation: a.bankItem.explanation,
        answeredAt: a.answeredAt,
        archivedAt: a.archivedAt,
      })),
    })),
  };
}

/**
 * Toggles archival status of a practice attempt.
 */
export async function archivePracticeAttempt(
  tx: Tx,
  params: {
    tenantId: string;
    studentId: string;
    role: Role;
    attemptId: string;
    archived: boolean;
  },
) {
  if (params.role !== Role.STUDENT && params.role !== Role.ADMIN) {
    throw new PracticeError("Your sign-in does not include student practice.", 403, "PORTAL_ACCESS");
  }

  const attempt = await tx.practiceAttempt.findFirst({
    where: { tenantId: params.tenantId, id: params.attemptId },
  });

  if (!attempt || attempt.studentId !== params.studentId) {
    throw new PracticeError("Practice attempt not found", 404, "NOT_FOUND");
  }

  const updated = await tx.practiceAttempt.update({
    where: { id: attempt.id },
    data: {
      archivedAt: params.archived ? new Date() : null,
    },
    select: { id: true, archivedAt: true },
  });

  return { ok: true, id: updated.id, archived: Boolean(updated.archivedAt) };
}
