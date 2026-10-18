import { Prisma, AssignmentStatus, QuizStatus } from "@prisma/client";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { determineSubmissionStatus, evaluateQuizAttempt } from "./rules";
import type {
  createAssignmentSchema,
  updateAssignmentSchema,
  submitAssignmentSchema,
  gradeSubmissionSchema,
  createLearningMaterialSchema,
  createQuizSchema,
  submitQuizAttemptSchema,
} from "./validation";
import { z } from "zod";

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type CreateMaterialInput = z.infer<typeof createLearningMaterialSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type SubmitQuizInput = z.infer<typeof submitQuizAttemptSchema>;

export async function listAssignments(
  tenantId: string,
  filters: {
    subjectId?: string;
    classGroupId?: string;
    classArmId?: string;
    status?: AssignmentStatus;
    studentId?: string;
  } = {},
) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const where: Prisma.AssignmentWhereInput = {
      tenantId,
      archivedAt: null,
    };

    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.classGroupId) where.classGroupId = filters.classGroupId;
    if (filters.classArmId) where.classArmId = filters.classArmId;
    if (filters.status) where.status = filters.status;

    return tx.assignment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        classGroup: { select: { id: true, name: true } },
        classArm: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { submissions: true } },
        ...(filters.studentId
          ? {
              submissions: {
                where: { studentId: filters.studentId },
                select: { id: true, status: true, score: true, submittedAt: true, gradedAt: true },
              },
            }
          : {}),
      },
    });
  });
}

export async function getAssignment(tenantId: string, assignmentId: string) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    return tx.assignment.findFirst({
      where: { tenantId, id: assignmentId, archivedAt: null },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        classGroup: { select: { id: true, name: true } },
        classArm: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        submissions: {
          include: {
            student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
            grader: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });
}

export async function createAssignment(tenantId: string, userId: string, data: CreateAssignmentInput) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const staff = await tx.staffRecord.findFirst({
      where: { tenantId, userId, archivedAt: null },
      select: { id: true },
    });

    return tx.assignment.create({
      data: {
        tenantId,
        subjectId: data.subjectId,
        classGroupId: data.classGroupId ?? null,
        classArmId: data.classArmId ?? null,
        title: data.title,
        description: data.description ?? null,
        instructions: data.instructions ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        totalPoints: data.totalPoints ?? 100,
        status: data.status,
        allowLate: data.allowLate ?? true,
        attachments: data.attachments as unknown as Prisma.InputJsonValue,
        createdById: staff?.id ?? null,
      },
      include: {
        subject: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true } },
        classArm: { select: { id: true, name: true } },
      },
    });
  });
}

export async function updateAssignment(tenantId: string, assignmentId: string, data: UpdateAssignmentInput) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const updateData: Prisma.AssignmentUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.subjectId !== undefined) updateData.subject = { connect: { tenantId_id: { tenantId, id: data.subjectId } } };
    if (data.classGroupId !== undefined) {
      updateData.classGroup = data.classGroupId ? { connect: { tenantId_id: { tenantId, id: data.classGroupId } } } : { disconnect: true };
    }
    if (data.classArmId !== undefined) {
      updateData.classArm = data.classArmId ? { connect: { tenantId_id: { tenantId, id: data.classArmId } } } : { disconnect: true };
    }
    if (data.description !== undefined) updateData.description = data.description;
    if (data.instructions !== undefined) updateData.instructions = data.instructions;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.totalPoints !== undefined) updateData.totalPoints = data.totalPoints;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.allowLate !== undefined) updateData.allowLate = data.allowLate;
    if (data.attachments !== undefined) updateData.attachments = data.attachments as unknown as Prisma.InputJsonValue;

    return tx.assignment.update({
      where: { tenantId_id: { tenantId, id: assignmentId } },
      data: updateData,
    });
  });
}

export async function archiveAssignment(tenantId: string, assignmentId: string) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    return tx.assignment.update({
      where: { tenantId_id: { tenantId, id: assignmentId } },
      data: { archivedAt: new Date(), status: AssignmentStatus.ARCHIVED },
    });
  });
}

export async function submitAssignment(
  tenantId: string,
  assignmentId: string,
  userId: string,
  data: SubmitAssignmentInput & { studentId?: string },
) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    let resolvedStudentId = data.studentId;
    if (!resolvedStudentId) {
      const student = await tx.studentRecord.findFirst({
        where: { tenantId, userId, archivedAt: null },
        select: { id: true },
      });
      if (!student) {
        throw new Error("Student profile required for submission");
      }
      resolvedStudentId = student.id;
    }

    const assignment = await tx.assignment.findFirstOrThrow({
      where: { tenantId, id: assignmentId, archivedAt: null },
    });

    const now = new Date();
    const status = determineSubmissionStatus({
      submittedAt: now,
      dueDate: assignment.dueDate,
      allowLate: assignment.allowLate,
    });

    return tx.assignmentSubmission.upsert({
      where: {
        tenantId_assignmentId_studentId: {
          tenantId,
          assignmentId,
          studentId: resolvedStudentId,
        },
      },
      create: {
        tenantId,
        assignmentId,
        studentId: resolvedStudentId,
        content: data.content ?? null,
        attachments: data.attachments as unknown as Prisma.InputJsonValue,
        status,
        submittedAt: now,
      },
      update: {
        content: data.content ?? null,
        attachments: data.attachments as unknown as Prisma.InputJsonValue,
        status,
        submittedAt: now,
      },
    });
  });
}

export async function gradeSubmission(tenantId: string, submissionId: string, userId: string, data: GradeSubmissionInput) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const staff = await tx.staffRecord.findFirst({
      where: { tenantId, userId, archivedAt: null },
      select: { id: true },
    });

    return tx.assignmentSubmission.update({
      where: { tenantId_id: { tenantId, id: submissionId } },
      data: {
        score: data.score,
        feedback: data.feedback ?? null,
        status: data.status,
        gradedById: staff?.id ?? null,
        gradedAt: new Date(),
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      },
    });
  });
}

export async function listLearningMaterials(tenantId: string, filters: { subjectId?: string; classGroupId?: string } = {}) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const where: Prisma.LearningMaterialWhereInput = {
      tenantId,
      archivedAt: null,
    };
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.classGroupId) where.classGroupId = filters.classGroupId;

    return tx.learningMaterial.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        classGroup: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  });
}

export async function createLearningMaterial(tenantId: string, userId: string, data: CreateMaterialInput) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const staff = await tx.staffRecord.findFirst({
      where: { tenantId, userId, archivedAt: null },
      select: { id: true },
    });

    return tx.learningMaterial.create({
      data: {
        tenantId,
        subjectId: data.subjectId,
        classGroupId: data.classGroupId ?? null,
        title: data.title,
        description: data.description ?? null,
        content: data.content ?? null,
        attachments: data.attachments as unknown as Prisma.InputJsonValue,
        createdById: staff?.id ?? null,
      },
      include: {
        subject: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true } },
      },
    });
  });
}

export async function archiveLearningMaterial(tenantId: string, materialId: string) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    return tx.learningMaterial.update({
      where: { tenantId_id: { tenantId, id: materialId } },
      data: { archivedAt: new Date() },
    });
  });
}

export async function listQuizzes(tenantId: string, filters: { subjectId?: string; status?: QuizStatus } = {}) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const where: Prisma.QuizWhereInput = {
      tenantId,
      archivedAt: null,
    };
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.status) where.status = filters.status;

    return tx.quiz.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        classGroup: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    });
  });
}

export async function getQuiz(tenantId: string, quizId: string, isStudent = false) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const quiz = await tx.quiz.findFirstOrThrow({
      where: { tenantId, id: quizId, archivedAt: null },
      include: {
        subject: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true } },
        questions: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (isStudent) {
      // Strip correct answers for students before submission
      return {
        ...quiz,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          questionType: q.questionType,
          options: q.options,
          points: q.points,
          sortOrder: q.sortOrder,
        })),
      };
    }

    return quiz;
  });
}

export async function createQuiz(tenantId: string, userId: string, data: CreateQuizInput) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const staff = await tx.staffRecord.findFirst({
      where: { tenantId, userId, archivedAt: null },
      select: { id: true },
    });

    return tx.quiz.create({
      data: {
        tenantId,
        subjectId: data.subjectId,
        classGroupId: data.classGroupId ?? null,
        title: data.title,
        instructions: data.instructions ?? null,
        timeLimitMinutes: data.timeLimitMinutes ?? null,
        passingScore: data.passingScore ?? null,
        status: data.status,
        createdById: staff?.id ?? null,
        questions: {
          create: data.questions.map((q, idx) => ({
            prompt: q.prompt,
            questionType: q.questionType,
            options: q.options as unknown as Prisma.InputJsonValue,
            correctAnswer: q.correctAnswer,
            points: q.points ?? 1,
            sortOrder: q.sortOrder ?? idx,
          })),
        },
      },
      include: {
        questions: true,
      },
    });
  });
}

export async function submitQuizAttempt(tenantId: string, quizId: string, userId: string, data: SubmitQuizInput & { studentId?: string }) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    let resolvedStudentId = data.studentId;
    if (!resolvedStudentId) {
      const student = await tx.studentRecord.findFirst({
        where: { tenantId, userId, archivedAt: null },
        select: { id: true },
      });
      if (!student) {
        throw new Error("Student profile required to attempt quiz");
      }
      resolvedStudentId = student.id;
    }

    const quiz = await tx.quiz.findFirstOrThrow({
      where: { tenantId, id: quizId, archivedAt: null },
      include: { questions: true },
    });

    const evaluation = evaluateQuizAttempt(
      quiz.questions.map((q) => ({
        id: q.id,
        questionType: q.questionType,
        correctAnswer: q.correctAnswer,
        points: q.points,
      })),
      data.answers,
      quiz.passingScore,
    );

    return tx.quizAttempt.create({
      data: {
        tenantId,
        quizId,
        studentId: resolvedStudentId,
        answers: data.answers as unknown as Prisma.InputJsonValue,
        score: evaluation.percentage,
        isPassed: evaluation.isPassed,
        completedAt: new Date(),
      },
    });
  });
}
