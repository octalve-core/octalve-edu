import type { Tx } from "@/lib/tenant/for-tenant";
import { FormAudienceKind, FormKind, FormStatus, TurnInStatus } from "@prisma/client";
import {
  PaperWorkInput,
  validatePaperWorkInput,
  determineTurnInStatus,
  canPupilRequestMarking,
  computeRollCallSummary,
  RollCallSummary,
} from "./paper-work";
import { campusFilter, reachForm } from "./access";

export class PaperWorkError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "PaperWorkError";
  }
}

/// Paper work the person may not reach is answered as one that does not exist (the campus rule for forms, task 0024).
async function requirePaperWork(tx: Tx, tenantId: string, userId: string, formId: string, access: "view" | "read" | "manage") {
  if (!(await reachForm(tx, { tenantId, userId, formId, access, kind: FormKind.PAPER_WORK }))) {
    throw new PaperWorkError("Paper work assignment not found.", 404);
  }
}

/**
 * Creates a new paper work assignment and auto-provisions the roll-call roster
 * for all active pupils in the targeted class groups.
 */
export async function createPaperWork(tx: Tx, tenantId: string, campusId: string | null, staffUserId: string, input: PaperWorkInput) {
  const validation = validatePaperWorkInput(input);
  if (!validation.valid) {
    throw new PaperWorkError(validation.errors.join(" "), 400);
  }

  const form = await tx.form.create({
    data: {
      tenantId,
      campusId,
      kind: FormKind.PAPER_WORK,
      title: input.title.trim(),
      instructions: input.instructions?.trim() || null,
      status: FormStatus.PUBLISHED,
      opensAt: input.opensAt ? new Date(input.opensAt) : new Date(),
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      maxDurationMinutes: input.maxDurationMinutes || null,
      createdById: staffUserId,
    },
  });

  await tx.formAudience.create({
    data: {
      tenantId,
      formId: form.id,
      kind: FormAudienceKind.MEMBERS,
      roles: ["STUDENT"] as never,
      classGroupIds: input.classGroupIds as never,
    },
  });

  // Query all active enrolled students in targeted class groups
  const enrollments = await tx.studentEnrollment.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      classArm: {
        classGroupId: { in: input.classGroupIds },
      },
    },
    select: {
      studentId: true,
    },
    distinct: ["studentId"],
  });

  if (enrollments.length > 0) {
    await tx.formTurnIn.createMany({
      data: enrollments.map((e) => ({
        tenantId,
        campusId,
        formId: form.id,
        studentId: e.studentId,
        status: TurnInStatus.PENDING,
      })),
      skipDuplicates: true,
    });

    // Audit initial roster provisioning
    const createdTurnIns = await tx.formTurnIn.findMany({
      where: { tenantId, formId: form.id },
      select: { id: true, studentId: true },
    });

    if (createdTurnIns.length > 0) {
      await tx.formTurnInAudit.createMany({
        data: createdTurnIns.map((t) => ({
          tenantId,
          turnInId: t.id,
          formId: form.id,
          studentId: t.studentId,
          status: TurnInStatus.PENDING,
          action: "PROVISIONED",
          actorUserId: staffUserId,
          note: "Initial roll call roster auto-provisioning",
        })),
      });
    }
  }

  return {
    id: form.id,
    title: form.title,
    status: form.status,
    rosterCount: enrollments.length,
  };
}

/**
 * Lists all paper work forms for a school/campus with roll-call metrics.
 */
export async function listPaperWorkForStaff(tx: Tx, tenantId: string, campusId?: string | null, status?: FormStatus | "ALL") {
  const where: {
    tenantId: string;
    OR?: Array<{ campusId: string | null }>;
    kind: FormKind;
    status?: FormStatus;
  } = {
    tenantId,
    kind: FormKind.PAPER_WORK,
    ...campusFilter(campusId),
  };

  if (status && status !== "ALL") {
    where.status = status;
  }

  const forms = await tx.form.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      turnIns: {
        select: {
          status: true,
          requestedAt: true,
        },
      },
    },
  });

  return forms.map((f) => {
    const summary: RollCallSummary = computeRollCallSummary(f.turnIns);
    return {
      id: f.id,
      title: f.title,
      instructions: f.instructions,
      status: f.status,
      opensAt: f.opensAt,
      closesAt: f.closesAt,
      maxDurationMinutes: f.maxDurationMinutes,
      audience: f.audiences[0] || null,
      summary,
      createdBy: f.createdBy,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    };
  });
}

/**
 * Retrieves full details and live student roll call for a single paper work.
 */
export async function getPaperWorkForStaff(tx: Tx, tenantId: string, userId: string, formId: string) {
  await requirePaperWork(tx, tenantId, userId, formId, "read");
  const form = await tx.form.findFirst({
    where: { id: formId, tenantId, kind: FormKind.PAPER_WORK },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      closedBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      turnIns: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
            },
          },
          markedBy: { select: { id: true, name: true } },
          audits: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { actor: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      },
    },
  });

  if (!form) {
    throw new PaperWorkError("Paper work assignment not found.", 404);
  }

  const summary = computeRollCallSummary(form.turnIns);

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    status: form.status,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    maxDurationMinutes: form.maxDurationMinutes,
    closedAt: form.closedAt,
    createdBy: form.createdBy,
    closedBy: form.closedBy,
    audience: form.audiences[0] || null,
    summary,
    turnIns: form.turnIns.map((t) => ({
      id: t.id,
      studentId: t.studentId,
      studentName: `${t.student.firstName} ${t.student.lastName}`,
      admissionNo: t.student.admissionNo,
      status: t.status,
      markedBy: t.markedBy ? t.markedBy.name : null,
      markedAt: t.markedAt,
      requestedAt: t.requestedAt,
      note: t.note,
      audits: t.audits,
    })),
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

/**
 * Updates an individual student's roll call status with append-only audit.
 */
export async function updateTurnIn(
  tx: Tx,
  tenantId: string,
  staffUserId: string,
  formId: string,
  studentId: string,
  targetStatus: TurnInStatus,
  note?: string | null,
) {
  await requirePaperWork(tx, tenantId, staffUserId, formId, "manage");
  const form = await tx.form.findFirst({
    where: { id: formId, tenantId, kind: FormKind.PAPER_WORK },
    select: { id: true, closesAt: true, status: true },
  });

  if (!form) {
    throw new PaperWorkError("Paper work assignment not found.", 404);
  }

  const turnIn = await tx.formTurnIn.findFirst({
    where: { tenantId, formId, studentId },
  });

  if (!turnIn) {
    throw new PaperWorkError("Student turn-in record not found for this paper work.", 404);
  }

  const effectiveStatus = determineTurnInStatus(form, targetStatus, new Date());
  const markedAt = effectiveStatus === TurnInStatus.PENDING ? null : new Date();
  const markedById = effectiveStatus === TurnInStatus.PENDING ? null : staffUserId;

  const updated = await tx.formTurnIn.update({
    where: { id: turnIn.id },
    data: {
      status: effectiveStatus,
      markedAt,
      markedById,
      note: note !== undefined ? note : turnIn.note,
    },
  });

  // Append-only audit trail
  await tx.formTurnInAudit.create({
    data: {
      tenantId,
      turnInId: turnIn.id,
      formId,
      studentId,
      status: effectiveStatus,
      action: "STATUS_CHANGED",
      actorUserId: staffUserId,
      note: note || `Turn-in status updated from ${turnIn.status} to ${effectiveStatus}`,
    },
  });

  return {
    id: updated.id,
    studentId: updated.studentId,
    status: updated.status,
    markedAt: updated.markedAt,
    note: updated.note,
  };
}

/**
 * Batch updates multiple student roll calls at once (e.g. marking whole class handed in).
 */
export async function batchUpdateTurnIns(
  tx: Tx,
  tenantId: string,
  staffUserId: string,
  formId: string,
  updates: Array<{ studentId: string; status: TurnInStatus; note?: string | null }>,
) {
  await requirePaperWork(tx, tenantId, staffUserId, formId, "manage");
  const form = await tx.form.findFirst({
    where: { id: formId, tenantId, kind: FormKind.PAPER_WORK },
    select: { id: true, closesAt: true },
  });

  if (!form) {
    throw new PaperWorkError("Paper work assignment not found.", 404);
  }

  const now = new Date();
  const results = [];

  for (const update of updates) {
    const turnIn = await tx.formTurnIn.findFirst({
      where: { tenantId, formId, studentId: update.studentId },
    });

    if (turnIn) {
      const effectiveStatus = determineTurnInStatus(form, update.status, now);
      const markedAt = effectiveStatus === TurnInStatus.PENDING ? null : now;
      const markedById = effectiveStatus === TurnInStatus.PENDING ? null : staffUserId;

      const updated = await tx.formTurnIn.update({
        where: { id: turnIn.id },
        data: {
          status: effectiveStatus,
          markedAt,
          markedById,
          note: update.note !== undefined ? update.note : turnIn.note,
        },
      });

      await tx.formTurnInAudit.create({
        data: {
          tenantId,
          turnInId: turnIn.id,
          formId,
          studentId: update.studentId,
          status: effectiveStatus,
          action: "BATCH_STATUS_CHANGED",
          actorUserId: staffUserId,
          note: update.note || `Batch roll-call update to ${effectiveStatus}`,
        },
      });

      results.push({
        id: updated.id,
        studentId: updated.studentId,
        status: updated.status,
      });
    }
  }

  return {
    updatedCount: results.length,
    results,
  };
}

/**
 * Synchronizes roll call roster if new students enrolled into targeted classes after creation.
 */
export async function syncRosterForPaperWork(tx: Tx, tenantId: string, userId: string, formId: string) {
  await requirePaperWork(tx, tenantId, userId, formId, "manage");
  const form = await tx.form.findFirst({
    where: { id: formId, tenantId, kind: FormKind.PAPER_WORK },
    include: { audiences: true },
  });

  if (!form) {
    throw new PaperWorkError("Paper work assignment not found.", 404);
  }

  const audience = form.audiences[0];
  const classGroupIds = (audience?.classGroupIds as string[]) || [];

  if (classGroupIds.length === 0) {
    return { addedCount: 0 };
  }

  const enrollments = await tx.studentEnrollment.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      classArm: { classGroupId: { in: classGroupIds } },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });

  const existingTurnIns = await tx.formTurnIn.findMany({
    where: { tenantId, formId },
    select: { studentId: true },
  });

  const existingStudentIds = new Set(existingTurnIns.map((t) => t.studentId));
  const newStudentIds = enrollments.map((e) => e.studentId).filter((id) => !existingStudentIds.has(id));

  if (newStudentIds.length > 0) {
    await tx.formTurnIn.createMany({
      data: newStudentIds.map((studentId) => ({
        tenantId,
        campusId: form.campusId ?? null,
        formId,
        studentId,
        status: TurnInStatus.PENDING,
      })),
      skipDuplicates: true,
    });

    const addedTurnIns = await tx.formTurnIn.findMany({
      where: { tenantId, formId, studentId: { in: newStudentIds } },
      select: { id: true, studentId: true },
    });

    await tx.formTurnInAudit.createMany({
      data: addedTurnIns.map((t) => ({
        tenantId,
        turnInId: t.id,
        formId,
        studentId: t.studentId,
        status: TurnInStatus.PENDING,
        action: "ROSTER_SYNCED",
        actorUserId: null,
        note: "Late-enrolled student added via roster sync",
      })),
    });
  }

  return {
    addedCount: newStudentIds.length,
    totalCount: existingTurnIns.length + newStudentIds.length,
  };
}

/**
 * Closes paper work assignment.
 */
export async function closePaperWork(tx: Tx, tenantId: string, staffUserId: string, formId: string) {
  await requirePaperWork(tx, tenantId, staffUserId, formId, "manage");
  const form = await tx.form.findFirst({
    where: { id: formId, tenantId, kind: FormKind.PAPER_WORK },
  });

  if (!form) {
    throw new PaperWorkError("Paper work assignment not found.", 404);
  }

  const updated = await tx.form.update({
    where: { id: form.id },
    data: {
      status: FormStatus.CLOSED,
      closedById: staffUserId,
      closedAt: new Date(),
    },
  });

  return {
    id: updated.id,
    status: updated.status,
    closedAt: updated.closedAt,
  };
}

/**
 * Lists active paper work assignments for a pupil.
 */
export async function listAvailablePaperWorkForPupil(tx: Tx, tenantId: string, studentId: string) {
  const enrollment = await tx.studentEnrollment.findFirst({
    where: { tenantId, studentId, status: "ACTIVE" },
    orderBy: { enrolledAt: "desc" },
    include: { classArm: { select: { classGroupId: true } } },
  });

  const classGroupId = enrollment?.classArm?.classGroupId;
  if (!classGroupId) {
    return [];
  }

  const turnIns = await tx.formTurnIn.findMany({
    where: {
      tenantId,
      studentId,
      form: {
        kind: FormKind.PAPER_WORK,
        status: FormStatus.PUBLISHED,
      },
    },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          instructions: true,
          opensAt: true,
          closesAt: true,
          maxDurationMinutes: true,
        },
      },
    },
    orderBy: { form: { opensAt: "desc" } },
  });

  return turnIns.map((t) => ({
    turnInId: t.id,
    formId: t.form.id,
    title: t.form.title,
    instructions: t.form.instructions,
    opensAt: t.form.opensAt,
    closesAt: t.form.closesAt,
    maxDurationMinutes: t.form.maxDurationMinutes,
    status: t.status,
    markedAt: t.markedAt,
    requestedAt: t.requestedAt,
    note: t.note,
  }));
}

/**
 * Gets details of a single paper work for a pupil.
 */
export async function getPaperWorkForPupil(tx: Tx, tenantId: string, formId: string, studentId: string) {
  const turnIn = await tx.formTurnIn.findFirst({
    where: {
      tenantId,
      formId,
      studentId,
      form: { kind: FormKind.PAPER_WORK },
    },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          instructions: true,
          status: true,
          opensAt: true,
          closesAt: true,
          closedAt: true,
          maxDurationMinutes: true,
        },
      },
    },
  });

  if (!turnIn) {
    throw new PaperWorkError("Paper work not found or not assigned to you.", 404);
  }

  const eligibility = canPupilRequestMarking(turnIn, turnIn.form);

  return {
    turnInId: turnIn.id,
    formId: turnIn.form.id,
    title: turnIn.form.title,
    instructions: turnIn.form.instructions,
    opensAt: turnIn.form.opensAt,
    closesAt: turnIn.form.closesAt,
    status: turnIn.status,
    markedAt: turnIn.markedAt,
    requestedAt: turnIn.requestedAt,
    note: turnIn.note,
    canRequestMarking: eligibility.allowed,
    requestMarkingReason: eligibility.reason,
  };
}

/**
 * Allows a pupil to signal that their physical assignment has been submitted.
 */
export async function requestMarkingForPupil(tx: Tx, tenantId: string, formId: string, studentId: string, note?: string | null) {
  const turnIn = await tx.formTurnIn.findFirst({
    where: { tenantId, formId, studentId, form: { kind: FormKind.PAPER_WORK } },
    include: { form: true },
  });

  if (!turnIn) {
    throw new PaperWorkError("Paper work assignment not found.", 404);
  }

  const eligibility = canPupilRequestMarking(turnIn, turnIn.form);
  if (!eligibility.allowed) {
    throw new PaperWorkError(eligibility.reason || "Cannot request marking.", 400);
  }

  const now = new Date();
  const updated = await tx.formTurnIn.update({
    where: { id: turnIn.id },
    data: {
      requestedAt: now,
      note: note || turnIn.note,
    },
  });

  await tx.formTurnInAudit.create({
    data: {
      tenantId,
      turnInId: turnIn.id,
      formId,
      studentId,
      status: turnIn.status,
      action: "MARKING_REQUESTED",
      actorUserId: null,
      note: note || "Pupil signalled submission via student portal",
    },
  });

  return {
    turnInId: updated.id,
    requestedAt: updated.requestedAt,
    status: updated.status,
  };
}
