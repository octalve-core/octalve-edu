import { Prisma, AssignmentStatus, QuizStatus, Role, type AssignmentSubmission, type QuizAttempt } from "@prisma/client";
import { forTenant, type Tx } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { determineSubmissionStatus, evaluateQuizAttempt } from "./rules";
import type { LmsFailure, LmsServiceResult } from "./http";
import type {
  createAssignmentSchema,
  updateAssignmentSchema,
  submitAssignmentSchema,
  gradeSubmissionSchema,
  createLearningMaterialSchema,
  createQuizSchema,
  updateQuizSchema,
  submitQuizAttemptSchema,
} from "./validation";
import { z } from "zod";

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type CreateMaterialInput = z.infer<typeof createLearningMaterialSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type SubmitQuizInput = z.infer<typeof submitQuizAttemptSchema>;

/// Who is calling: the person and the role they hold IN THIS SCHOOL.
export type Actor = { userId: string; role: Role };

/// What a caller may see of the LMS. Staff (ADMIN, CAMPUS_ADMIN, TEACHING_STAFF) see everything: drafts, every student's submission, the answer keys. A STUDENT sees PUBLISHED
/// work and their OWN submissions. Anyone else who may read it (a PARENT, NON_TEACHING_STAFF) sees PUBLISHED work and no submissions: a guardian's access to a child's work is
/// not designed yet. Marks and feedback belong to the student they were given to.
const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF];
const isStaff = (viewer: Actor) => STAFF_ROLES.includes(viewer.role);

export async function listAssignments(
  tenantId: string,
  viewer: Actor,
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
    const staff = isStaff(viewer);
    // everyone else is asking about PUBLISHED work, whatever the filter says
    if (!staff && filters.status !== undefined && filters.status !== AssignmentStatus.PUBLISHED) return [];

    const where: Prisma.AssignmentWhereInput = {
      tenantId,
      archivedAt: null,
    };

    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (filters.classGroupId) where.classGroupId = filters.classGroupId;
    if (filters.classArmId) where.classArmId = filters.classArmId;
    if (staff) {
      if (filters.status) where.status = filters.status;
    } else {
      where.status = AssignmentStatus.PUBLISHED;
    }

    // Whose submissions ride along: staff, the student the filter names; a student, their own whatever the filter names; anyone else, none
    let submissionsOf: string | undefined;
    if (staff) {
      submissionsOf = filters.studentId;
    } else if (viewer.role === Role.STUDENT) {
      submissionsOf = (
        await tx.studentRecord.findFirst({ where: { tenantId, userId: viewer.userId, archivedAt: null }, select: { id: true } })
      )?.id;
    }

    return tx.assignment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        classGroup: { select: { id: true, name: true } },
        classArm: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { submissions: true } },
        ...(submissionsOf
          ? {
              submissions: {
                where: { studentId: submissionsOf },
                select: { id: true, status: true, score: true, submittedAt: true, gradedAt: true },
              },
            }
          : {}),
      },
    });
  });
}

export async function getAssignment(tenantId: string, assignmentId: string, viewer: Actor) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const staff = isStaff(viewer);
    const submissionInclude = {
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        grader: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    } satisfies Prisma.Assignment$submissionsArgs;
    return tx.assignment.findFirst({
      where: { tenantId, id: assignmentId, archivedAt: null, ...(staff ? {} : { status: AssignmentStatus.PUBLISHED }) },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        classGroup: { select: { id: true, name: true } },
        classArm: { select: { id: true, name: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        // staff: every submission; a student: their own; anyone else: none
        ...(staff
          ? { submissions: submissionInclude }
          : viewer.role === Role.STUDENT
            ? { submissions: { ...submissionInclude, where: { student: { userId: viewer.userId } } } }
            : {}),
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

/// `null` when this school has no such assignment (the route answers 404). Without the look-up the update itself throws "record not found" for an unknown id, which was a 500.
export async function updateAssignment(tenantId: string, assignmentId: string, data: UpdateAssignmentInput) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const existing = await tx.assignment.findFirst({ where: { tenantId, id: assignmentId }, select: { id: true } });
    if (!existing) return null;

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

/// `null` when this school has no such assignment (the route answers 404).
export async function archiveAssignment(tenantId: string, assignmentId: string) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const existing = await tx.assignment.findFirst({ where: { tenantId, id: assignmentId }, select: { id: true } });
    if (!existing) return null;
    return tx.assignment.update({
      where: { tenantId_id: { tenantId, id: assignmentId } },
      data: { archivedAt: new Date(), status: AssignmentStatus.ARCHIVED },
    });
  });
}

type Submitter = { ok: true; studentId: string } | { ok: false; failure: LmsFailure; detail?: string };

/// Whose work a submission or a quiz attempt is. A STUDENT always acts for their OWN student record: a `studentId` that names anyone else is refused, because it is the
/// way one student would write into another's work. Staff who may submit on a student's behalf (ADMIN, CAMPUS_ADMIN, TEACHING_STAFF) name the student, who must be a live
/// record of this school. A campus administrator's campus is checked by the route (campus-scope `studentScope`), which is where tests/unit/route-role-guard.spec.ts looks for it.
/// Runs before any write, so a refusal leaves nothing behind.
async function resolveSubmitter(tx: Tx, tenantId: string, actor: Actor, named: string | undefined): Promise<Submitter> {
  const own = await tx.studentRecord.findFirst({
    where: { tenantId, userId: actor.userId, archivedAt: null },
    select: { id: true },
  });
  if (actor.role === Role.STUDENT) {
    if (!own) return { ok: false, failure: "NO_STUDENT_RECORD" };
    if (named !== undefined && named !== own.id) return { ok: false, failure: "NOT_YOURS" };
    return { ok: true, studentId: own.id };
  }
  const target = named ?? own?.id;
  if (!target) return { ok: false, failure: "STUDENT_REQUIRED" };
  if (target !== own?.id) {
    const exists = await tx.studentRecord.findFirst({ where: { tenantId, id: target, archivedAt: null }, select: { id: true } });
    if (!exists) return { ok: false, failure: "NOT_FOUND", detail: "No such student." };
  }
  return { ok: true, studentId: target };
}

/// What a STUDENT may hand in: only a PUBLISHED assignment, not once it has closed to late work (`allowLate` off and the due date passed), and never over work that has been
/// marked (GRADED): a resubmission is possible only while the work is not marked, or when the teacher asked for one (RESUBMIT_REQUESTED). Staff who hand work in on a student's
/// behalf are not held to the due date or the marks: they decide what is recorded, and they can see drafts. Every refusal comes before the write.
export async function submitAssignment(
  tenantId: string,
  assignmentId: string,
  actor: Actor,
  data: SubmitAssignmentInput & { studentId?: string },
): Promise<LmsServiceResult<AssignmentSubmission>> {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const submitter = await resolveSubmitter(tx, tenantId, actor, data.studentId);
    if (!submitter.ok) return submitter;

    const asStudent = actor.role === Role.STUDENT;
    const assignment = await tx.assignment.findFirst({
      where: { tenantId, id: assignmentId, archivedAt: null, ...(asStudent ? { status: AssignmentStatus.PUBLISHED } : {}) },
    });
    if (!assignment) return { ok: false, failure: "NOT_FOUND", detail: "No such assignment." };

    const now = new Date();
    if (asStudent) {
      const earlier = await tx.assignmentSubmission.findUnique({
        where: { tenantId_assignmentId_studentId: { tenantId, assignmentId, studentId: submitter.studentId } },
        select: { status: true },
      });
      if (earlier?.status === "GRADED") return { ok: false, failure: "ALREADY_MARKED" };
      if (!assignment.allowLate && assignment.dueDate && now.getTime() > assignment.dueDate.getTime())
        return { ok: false, failure: "CLOSED" };
    }

    const status = determineSubmissionStatus({
      submittedAt: now,
      dueDate: assignment.dueDate,
      allowLate: assignment.allowLate,
    });

    const saved = await tx.assignmentSubmission.upsert({
      where: {
        tenantId_assignmentId_studentId: {
          tenantId,
          assignmentId,
          studentId: submitter.studentId,
        },
      },
      create: {
        tenantId,
        assignmentId,
        studentId: submitter.studentId,
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
    return { ok: true, data: saved };
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

/// `null` when this school has no such material (the route answers 404).
export async function archiveLearningMaterial(tenantId: string, materialId: string) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const existing = await tx.learningMaterial.findFirst({ where: { tenantId, id: materialId }, select: { id: true } });
    if (!existing) return null;
    return tx.learningMaterial.update({
      where: { tenantId_id: { tenantId, id: materialId } },
      data: { archivedAt: new Date() },
    });
  });
}

export async function listQuizzes(tenantId: string, viewer: Actor, filters: { subjectId?: string; status?: QuizStatus } = {}) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const staff = isStaff(viewer);
    // everyone else is asking about PUBLISHED quizzes, whatever the filter says
    if (!staff && filters.status !== undefined && filters.status !== QuizStatus.PUBLISHED) return [];

    const where: Prisma.QuizWhereInput = {
      tenantId,
      archivedAt: null,
    };
    if (filters.subjectId) where.subjectId = filters.subjectId;
    if (staff) {
      if (filters.status) where.status = filters.status;
    } else {
      where.status = QuizStatus.PUBLISHED;
    }

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

import { isTemplateHidden } from "@/lib/question-bank/assessments";

export async function getQuiz(tenantId: string, quizId: string, viewer: Actor) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const staff = isStaff(viewer);
    const quiz = await tx.quiz.findFirstOrThrow({
      where: { tenantId, id: quizId, archivedAt: null, ...(staff ? {} : { status: QuizStatus.PUBLISHED }) },
      include: {
        subject: { select: { id: true, name: true } },
        classGroup: { select: { id: true, name: true } },
        questions: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const staffRecord = staff
      ? await tx.staffRecord.findFirst({
          where: { tenantId, userId: viewer.userId, archivedAt: null },
          select: { id: true },
        })
      : null;

    if (
      staff &&
      isTemplateHidden(quiz, {
        userId: viewer.userId,
        role: viewer.role,
        staffRecordId: staffRecord?.id,
      })
    ) {
      // Exam template secrecy: hide questions from other staff members during the window
      return {
        ...quiz,
        questions: [],
      };
    }

    if (!staff) {
      // Only staff see the answer key; everyone else gets the quiz without it
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

    const quiz = await tx.quiz.create({
      data: {
        tenantId,
        subjectId: data.subjectId,
        classGroupId: data.classGroupId ?? null,
        title: data.title,
        instructions: data.instructions ?? null,
        timeLimitMinutes: data.timeLimitMinutes ?? null,
        passingScore: data.passingScore ?? null,
        status: data.status,
        isExamTemplate: data.isExamTemplate ?? false,
        examWindowStart: data.examWindowStart ?? null,
        examWindowEnd: data.examWindowEnd ?? null,
        createdById: staff?.id ?? null,
      },
    });

    // The questions are written with their own statement, not as a nested create: a question that may name its source in the bank (`sourceItemId`) is tied to the school by a
    // second composite key, and a nested create then refuses `tenantId` ("Unknown argument"), which answered every quiz creation with a 500.
    await tx.quizQuestion.createMany({
      data: data.questions.map((q, idx) => ({
        tenantId,
        quizId: quiz.id,
        prompt: q.prompt,
        questionType: q.questionType,
        options: q.options as unknown as Prisma.InputJsonValue,
        correctAnswer: q.correctAnswer,
        points: q.points ?? 1,
        sortOrder: q.sortOrder ?? idx,
        sourceItemId: q.sourceItemId ?? null,
        sourceVersion: q.sourceVersion ?? null,
        exposedToPractice: q.exposedToPractice ?? false,
      })),
    });

    return tx.quiz.findFirstOrThrow({ where: { tenantId, id: quiz.id }, include: { questions: true } });
  });
}

export async function updateQuiz(tenantId: string, quizId: string, data: UpdateQuizInput) {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const existing = await tx.quiz.findFirst({
      where: { tenantId, id: quizId, archivedAt: null },
      select: { id: true },
    });
    if (!existing) return null;

    return tx.quiz.update({
      where: { tenantId_id: { tenantId, id: quizId } },
      data: {
        title: data.title,
        instructions: data.instructions,
        timeLimitMinutes: data.timeLimitMinutes,
        passingScore: data.passingScore,
        status: data.status,
        isExamTemplate: data.isExamTemplate,
        examWindowStart: data.examWindowStart,
        examWindowEnd: data.examWindowEnd,
      },
      include: {
        questions: true,
      },
    });
  });
}

export async function submitQuizAttempt(
  tenantId: string,
  quizId: string,
  actor: Actor,
  data: SubmitQuizInput & { studentId?: string },
): Promise<LmsServiceResult<QuizAttempt>> {
  const tId = trustedTenantId(tenantId);

  return forTenant(tId).transaction(async (tx) => {
    const submitter = await resolveSubmitter(tx, tenantId, actor, data.studentId);
    if (!submitter.ok) return submitter;

    // a student attempts PUBLISHED quizzes only; staff recording an attempt on a student's behalf can use a draft
    const quiz = await tx.quiz.findFirst({
      where: { tenantId, id: quizId, archivedAt: null, ...(actor.role === Role.STUDENT ? { status: QuizStatus.PUBLISHED } : {}) },
      include: { questions: true },
    });
    if (!quiz) return { ok: false, failure: "NOT_FOUND", detail: "No such quiz." };

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

    const attempt = await tx.quizAttempt.create({
      data: {
        tenantId,
        quizId,
        studentId: submitter.studentId,
        answers: data.answers as unknown as Prisma.InputJsonValue,
        score: evaluation.percentage,
        isPassed: evaluation.isPassed,
        completedAt: new Date(),
      },
    });
    return { ok: true, data: attempt };
  });
}
