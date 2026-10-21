import { Decimal } from "@prisma/client/runtime/library";
import { ResultStatus, Permission, type Prisma } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { gradeFor } from "@/lib/academics/scoring";
import { assignedArmIds } from "@/lib/attendance/access";
import { approverScope, inScopeResultIds, NO_SCOPE } from "./approver-scope";
import { canTransitionResult, validateComponentScores, generateVerificationToken, calculateVerificationHash } from "./rules";
import { calculateCompetitionRanks, evaluatePromotion } from "./ranking";
import type { RecordResultsInput, TransitionStatusInput, ResultFailure } from "./http";
import { triggerResultsPublishedAlerts } from "@/lib/communication/event-triggers";

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; failure: ResultFailure; message?: string };

/// What a member anchored to a campus works with: that campus's students and the school-wide ones (the rule `transitionResultStatuses` has always
/// applied). `undefined` (no restriction) for an ADMIN and for a member of no campus.
function campusOf(role: string, campusId: string | null): Prisma.StudentRecordWhereInput | undefined {
  return role === "ADMIN" || campusId === null ? undefined : { OR: [{ campusId: null }, { campusId }] };
}

const NOT_EDITABLE =
  "Results that have left DRAFT cannot be changed here. Send them back to DRAFT first (an administrator unlocks a LOCKED result, with a reason).";

const NOT_ASSIGNED = "You are not assigned to teach this subject to every student in this request.";

const OUT_OF_SCOPE = "This result is outside the classes you approve results for.";

/// The arms this person is assigned to teach `subjectId` in: a subject assignment, for exactly this subject, on their (live) staff record. A timetable
/// slot does not count here: it says when a class meets, not who answers for its marks.
async function armsTaught(tx: Tx, tenantId: string, userId: string, subjectId: string): Promise<string[]> {
  const rows = await tx.staffSubjectAssignment.findMany({
    where: { tenantId, subjectId, staffRecord: { userId, archivedAt: null } },
    select: { classArmId: true },
  });
  return rows.map((row) => row.classArmId);
}

/**
 * Records or updates score entries for students in a given subject and period. A result is edited only while it is DRAFT (PRD 5): once it has been
 * submitted, a change goes back through the lifecycle, with its reason and its audit row. A teacher records only for the students of an arm they are
 * assigned to teach the subject in. The whole request is accepted or none of it is.
 */
export async function recordStudentResults(
  tx: Tx,
  tenantId: string,
  actorUserId: string,
  input: RecordResultsInput,
  /// Who is recording: the role in this school and the campus the membership is anchored to (null = the whole school).
  caller: { role: string; campusId: string | null },
): Promise<ServiceResult<{ count: number; saved: string[] }>> {
  // Validate period and subject exist
  const [period, subject] = await Promise.all([
    tx.academicPeriod.findFirst({ where: { tenantId, id: input.periodId, archivedAt: null } }),
    tx.subject.findFirst({ where: { tenantId, id: input.subjectId, archivedAt: null } }),
  ]);

  if (!period || !subject) {
    return { ok: false, failure: "NOT_FOUND", message: "Academic period or subject not found." };
  }

  // Fetch tenant default grade scale if one exists
  const defaultScale = await tx.gradeScale.findFirst({
    where: { tenantId, isDefault: true, archivedAt: null },
    include: { bands: true },
  });

  // Every refusal is decided before the first write: `forTenant().transaction` commits when this function RETURNS and rolls back only when it THROWS,
  // so a refusal returned after a write would keep that write (ADR 0002).
  const studentIds = input.results.map((entry) => entry.studentId);
  const known = await tx.studentRecord.count({ where: { tenantId, id: { in: studentIds }, ...campusOf(caller.role, caller.campusId) } });
  if (known !== studentIds.length) {
    return { ok: false, failure: "NOT_FOUND", message: "A student in this request was not found." };
  }

  // A teacher records a subject only for the students on the roll of an arm they are assigned to teach it in (an ACTIVE enrolment in this period's
  // session); one student outside that refuses the whole request. An ADMIN is not held to it.
  if (caller.role === "TEACHING_STAFF") {
    const arms = await armsTaught(tx, tenantId, actorUserId, input.subjectId);
    const rolled =
      arms.length === 0
        ? []
        : await tx.studentEnrollment.findMany({
            where: { tenantId, sessionId: period.sessionId, status: "ACTIVE", studentId: { in: studentIds }, classArmId: { in: arms } },
            select: { studentId: true },
          });
    const covered = new Set(rolled.map((row) => row.studentId));
    if (studentIds.some((id) => !covered.has(id))) {
      return { ok: false, failure: "NOT_ASSIGNED", message: NOT_ASSIGNED };
    }
  }

  const entries: Array<{
    studentId: string;
    finalScore: number;
    maxScore: number;
    components: (typeof input.results)[number]["components"];
    gradeLetter: string | null;
    gradeRemark: string | null;
  }> = [];

  for (const entry of input.results) {
    let finalScore = entry.score ?? 0;
    const maxScore = entry.maxScore ?? 100;

    if (entry.components && entry.components.length > 0) {
      const compValidation = validateComponentScores(entry.components, entry.score);
      if (!compValidation.ok) {
        return { ok: false, failure: "SCHEME_VALIDATION_FAILED", message: compValidation.error };
      }
      finalScore = compValidation.totalScore;
    }

    if (finalScore < 0 || finalScore > maxScore) {
      return { ok: false, failure: "SCORE_OUT_OF_BOUNDS", message: `Score ${finalScore} exceeds max ${maxScore}.` };
    }

    // Determine letter grade and remark if scale available
    let gradeLetter: string | null = null;
    let gradeRemark: string | null = null;
    if (defaultScale && defaultScale.bands.length > 0) {
      const percentage = maxScore > 0 ? (finalScore / maxScore) * 100 : finalScore;
      const matched = gradeFor(
        defaultScale.bands.map((b) => ({ min: Number(b.minScore), max: Number(b.maxScore), letter: b.letter, remark: b.remark })),
        percentage,
      );
      if (matched) {
        gradeLetter = matched.letter;
        gradeRemark = matched.remark;
      }
    }

    entries.push({ studentId: entry.studentId, finalScore, maxScore, components: entry.components, gradeLetter, gradeRemark });
  }

  // The rows are locked while they are read: a request moving one of them out of DRAFT waits for this one to finish, and one that has already done so
  // is seen here, so "still DRAFT" holds until this request commits. (In id order, so two overlapping requests cannot wait on each other.)
  const held = await tx.$queryRaw<{ id: string; studentId: string; status: ResultStatus; score: Prisma.Decimal }[]>`
    SELECT id, "studentId", status, score FROM "Result"
    WHERE "tenantId" = ${tenantId} AND "subjectId" = ${input.subjectId} AND "periodId" = ${input.periodId} AND "studentId" = ANY(${studentIds}::text[])
    ORDER BY id
    FOR UPDATE`;
  if (held.some((row) => row.status !== ResultStatus.DRAFT)) {
    return { ok: false, failure: "NOT_EDITABLE", message: NOT_EDITABLE };
  }
  const existing = new Map(held.map((row) => [row.studentId, row]));

  const savedIds: string[] = [];

  for (const entry of entries) {
    const before = existing.get(entry.studentId);
    const content = {
      score: new Decimal(entry.finalScore),
      maxScore: new Decimal(entry.maxScore),
      componentScores: entry.components ? JSON.parse(JSON.stringify(entry.components)) : undefined,
      gradeLetter: entry.gradeLetter,
      gradeRemark: entry.gradeRemark,
    };

    const upserted = await tx.result.upsert({
      where: {
        tenantId_studentId_subjectId_periodId: {
          tenantId,
          studentId: entry.studentId,
          subjectId: input.subjectId,
          periodId: input.periodId,
        },
      },
      update: { ...content, updatedAt: new Date() },
      create: {
        tenantId,
        studentId: entry.studentId,
        subjectId: input.subjectId,
        periodId: input.periodId,
        ...content,
        status: ResultStatus.DRAFT,
        enteredByStaffId: actorUserId,
        verificationToken: generateVerificationToken(),
      },
    });

    // Record audit row if updated
    if (before && Number(before.score) !== entry.finalScore) {
      await tx.resultAudit.create({
        data: {
          tenantId,
          resultId: upserted.id,
          actorUserId,
          fromStatus: before.status,
          toStatus: before.status,
          fromScore: before.score,
          toScore: new Decimal(entry.finalScore),
          reason: "Score update",
        },
      });
    }

    savedIds.push(upserted.id);
  }

  return { ok: true, data: { count: savedIds.length, saved: savedIds } };
}

/**
 * Transitions the lifecycle status of one or more results with audit tracking.
 */
export async function transitionResultStatuses(
  tx: Tx,
  tenantId: string,
  actorUserId: string,
  actorRole: string,
  permissions: readonly (Permission | string)[],
  input: TransitionStatusInput,
  /// The campus the caller's membership is anchored to (null = whole school). A non-admin only sees results of students of their own campus
  /// or of no campus; an ADMIN sees all. A result the caller cannot see is "not found", and a batch containing one moves nothing.
  campusId: string | null = null,
): Promise<ServiceResult<{ updatedCount: number; toStatus: ResultStatus }>> {
  const isAdmin = actorRole === "ADMIN";
  const holdsApprove = permissions.includes("CAN_APPROVE_RESULTS");

  const requested = [...new Set(input.resultIds)];
  const visible = campusOf(actorRole, campusId);
  const results = await tx.result.findMany({
    where: {
      tenantId,
      id: { in: requested },
      ...(visible ? { student: visible } : {}),
    },
    include: {
      student: true,
      subject: true,
      period: { include: { session: true } },
      tenant: true,
    },
  });

  // All or nothing: an id that does not exist, belongs to another school, or is out of the caller's campus makes the whole batch "not found".
  if (results.length === 0 || results.length !== requested.length) {
    return { ok: false, failure: "NOT_FOUND", message: "No matching results found." };
  }

  // Where this person approves (ADR 0018): an approver acts only on the results their scope covers; an ADMIN is held to no scope. The scope matters only to the
  // transitions that need approval authority, so the author's own submit (DRAFT to SUBMITTED) is not touched by it.
  const scoped = holdsApprove && !isAdmin;
  const covered = scoped
    ? await inScopeResultIds(
        tx,
        tenantId,
        await approverScope(tx, tenantId, actorUserId),
        results.map((res) => ({ id: res.id, studentId: res.studentId, sessionId: res.period.sessionId })),
      )
    : new Set<string>();

  // Pre-validate transitions for all target records
  for (const res of results) {
    const check = canTransitionResult(res.status, input.toStatus, {
      isAdmin,
      hasApprovePermission: scoped ? covered.has(res.id) : holdsApprove,
      isAuthor: res.enteredByStaffId === actorUserId,
      reason: input.reason,
    });

    if (!check.allowed) {
      // An approver whose scope does not reach this result is told that, not that they lack the permission they hold.
      const outOfScope = check.code === "UNAUTHORIZED" && scoped && !covered.has(res.id);
      return {
        ok: false,
        failure: check.code,
        message: outOfScope && /requires CAN_APPROVE_RESULTS/.test(check.error) ? OUT_OF_SCOPE : check.error,
      };
    }
  }

  const now = new Date();

  for (const res of results) {
    const updateData: {
      status: ResultStatus;
      approvedByStaffId?: string;
      publishedAt?: Date;
      lockedAt?: Date;
      verificationHash?: string;
    } = {
      status: input.toStatus,
    };

    if (input.toStatus === ResultStatus.APPROVED) {
      updateData.approvedByStaffId = actorUserId;
    } else if (input.toStatus === ResultStatus.PUBLISHED) {
      updateData.publishedAt = now;
      updateData.verificationHash = calculateVerificationHash({
        tenantCode: res.tenant.code,
        admissionNo: res.student.admissionNo,
        periodLabel: res.period.label,
        sessionLabel: res.period.session.label,
        subjectCodeOrName: res.subject.code ?? res.subject.name,
        score: Number(res.score),
        maxScore: Number(res.maxScore),
        gradeLetter: res.gradeLetter,
        issuedAt: now.toISOString(),
      });
    } else if (input.toStatus === ResultStatus.LOCKED) {
      updateData.lockedAt = now;
    }

    await tx.result.update({
      where: { tenantId_id: { tenantId, id: res.id } },
      data: updateData,
    });

    // Write append-only ResultAudit row
    await tx.resultAudit.create({
      data: {
        tenantId,
        resultId: res.id,
        actorUserId,
        fromStatus: res.status,
        toStatus: input.toStatus,
        fromScore: res.score,
        toScore: res.score,
        reason: input.reason ?? null,
      },
    });
  }

  // Automated communication trigger for published results
  if (input.toStatus === ResultStatus.PUBLISHED) {
    await triggerResultsPublishedAlerts(tx, {
      tenantId,
      resultIds: requested,
      actorUserId,
    });
  }

  return { ok: true, data: { updatedCount: results.length, toStatus: input.toStatus } };
}

/**
 * Queries results with optional filters. A teacher sees the results of the students on the roll of the arms they are assigned to (the rule the student's
 * attendance history and report card apply), plus - when they hold CAN_APPROVE_RESULTS - those of the classes their approver scope covers (ADR 0018). An approver
 * with a GENERAL scope is held to the campus rule alone.
 */
export async function queryResults(
  tx: Tx,
  tenantId: string,
  filter: {
    periodId?: string;
    subjectId?: string;
    classArmId?: string;
    status?: ResultStatus;
  },
  /// Who is asking: the role in this school, the campus the membership is anchored to (null = the whole school), who they are and what they may do here.
  caller: { role: string; campusId: string | null; userId: string; permissions: readonly (Permission | string)[] },
) {
  let enrolled: Prisma.StudentEnrollmentWhereInput | undefined = filter.classArmId
    ? { classArmId: filter.classArmId, status: "ACTIVE" }
    : undefined;
  // A teacher works with the arms they are assigned to, plus - when they hold CAN_APPROVE_RESULTS - the arms of their approver scope (ADR 0018); a GENERAL approver
  // is held to the campus rule alone.
  const scope =
    caller.role === "TEACHING_STAFF" && caller.permissions.includes("CAN_APPROVE_RESULTS")
      ? await approverScope(tx, tenantId, caller.userId)
      : NO_SCOPE;
  if (caller.role === "TEACHING_STAFF" && !scope.general) {
    // On the roll, in the active session, of such an arm; a teacher with none (or a school with no active session) sees none.
    const arms = new Set([...(await assignedArmIds(tx, tenantId, caller.userId)), ...scope.armIds]);
    const active = await tx.academicSession.findFirst({ where: { tenantId, status: "ACTIVE", archivedAt: null }, select: { id: true } });
    const mine = filter.classArmId ? [...arms].filter((id) => id === filter.classArmId) : [...arms];
    if (!active || mine.length === 0) return [];
    enrolled = { sessionId: active.id, status: "ACTIVE", classArmId: { in: mine } };
  }
  const student: Prisma.StudentRecordWhereInput = {
    ...campusOf(caller.role, caller.campusId),
    ...(enrolled ? { enrollments: { some: enrolled } } : {}),
  };
  return tx.result.findMany({
    where: {
      tenantId,
      periodId: filter.periodId,
      subjectId: filter.subjectId,
      status: filter.status,
      student: Object.keys(student).length > 0 ? student : undefined,
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      subject: { select: { id: true, name: true, code: true } },
      period: { select: { id: true, label: true, kind: true } },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });
}

/**
 * Retrieves the compiled term report card for an individual student.
 * Gated by strict IDOR boundaries: students/parents can only see PUBLISHED results for their own child.
 */
export async function getStudentReportCard(
  tx: Tx,
  tenantId: string,
  studentId: string,
  periodId: string,
  viewerRole: string,
  viewerUserId: string,
) {
  // IDOR Verification
  if (viewerRole === "STUDENT") {
    const student = await tx.studentRecord.findFirst({
      where: { tenantId, id: studentId, userId: viewerUserId, archivedAt: null },
    });
    if (!student) {
      return { ok: false, failure: "FORBIDDEN_STUDENT_ACCESS" as const };
    }
  } else if (viewerRole === "PARENT") {
    const guardianLink = await tx.guardianLink.findFirst({
      where: {
        tenantId,
        studentId,
        status: "APPROVED",
        guardian: { userId: viewerUserId },
      },
    });
    if (!guardianLink) {
      return { ok: false, failure: "FORBIDDEN_STUDENT_ACCESS" as const };
    }
  }

  const isPublicViewer = viewerRole === "STUDENT" || viewerRole === "PARENT";

  const [student, period] = await Promise.all([
    tx.studentRecord.findFirst({
      where: { tenantId, id: studentId },
      include: {
        campus: true,
        enrollments: {
          where: { status: "ACTIVE" },
          include: { classArm: { include: { classGroup: true } }, session: true },
        },
      },
    }),
    tx.academicPeriod.findFirst({
      where: { tenantId, id: periodId },
      include: { session: true },
    }),
  ]);

  if (!student || !period) {
    return { ok: false, failure: "NOT_FOUND" as const };
  }

  const results = await tx.result.findMany({
    where: {
      tenantId,
      studentId,
      periodId,
      status: isPublicViewer ? ResultStatus.PUBLISHED : undefined,
    },
    include: { subject: true },
  });

  const activeEnrollment = student.enrollments[0];
  const classArmId = activeEnrollment?.classArmId;

  // Retrieve peer results for competition ranking if class arm is known
  let classRank: number | null = null;
  let classSize: number = 0;

  if (classArmId) {
    const peerEnrollments = await tx.studentEnrollment.findMany({
      where: { tenantId, classArmId, status: "ACTIVE" },
      select: { studentId: true },
    });
    classSize = peerEnrollments.length;

    const peerStudentIds = peerEnrollments.map((e) => e.studentId);
    const peerResults = await tx.result.findMany({
      where: {
        tenantId,
        periodId,
        studentId: { in: peerStudentIds },
        status: isPublicViewer ? ResultStatus.PUBLISHED : undefined,
      },
    });

    const peerTotals: Record<string, number> = {};
    for (const sid of peerStudentIds) peerTotals[sid] = 0;
    for (const pr of peerResults) {
      peerTotals[pr.studentId] = (peerTotals[pr.studentId] ?? 0) + Number(pr.score);
    }

    const rankingData = Object.entries(peerTotals).map(([sid, total]) => ({ id: sid, total }));
    const { ranked } = calculateCompetitionRanks(rankingData, (r) => r.total);
    const myRank = ranked.find((r) => r.item.id === studentId);
    if (myRank) {
      classRank = myRank.rank;
    }
  }

  // Calculate student subject summaries
  let totalScore = 0;
  let totalMax = 0;
  const subjectsData = results.map((r) => {
    const sc = Number(r.score);
    const mx = Number(r.maxScore);
    totalScore += sc;
    totalMax += mx;
    return {
      subjectId: r.subjectId,
      subjectName: r.subject.name,
      subjectCode: r.subject.code,
      score: sc,
      maxScore: mx,
      gradeLetter: r.gradeLetter,
      gradeRemark: r.gradeRemark,
      status: r.status,
      verificationToken: r.verificationToken,
      verificationHash: r.verificationHash,
    };
  });

  const cumulativePercentage = totalMax > 0 ? Number(((totalScore / totalMax) * 100).toFixed(2)) : 0;
  const promotion = evaluatePromotion(
    subjectsData.map((s) => ({ score: s.score, maxScore: s.maxScore, passed: s.score >= s.maxScore * 0.5 })),
  );

  return {
    ok: true as const,
    data: {
      student: {
        id: student.id,
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        classGroup: activeEnrollment?.classArm.classGroup.name,
        classArm: activeEnrollment?.classArm.name,
      },
      period: {
        id: period.id,
        label: period.label,
        sessionLabel: period.session.label,
      },
      summary: {
        totalScore,
        totalMax,
        percentage: cumulativePercentage,
        classRank,
        classSize,
        promotionOutcome: promotion.outcome,
      },
      subjects: subjectsData,
    },
  };
}

/**
 * Public lookup of a published credential token (referencing VerifyCertificateForm pattern).
 * Returns what a verifier needs and no more: the school, the student's name IN FULL (the maintainer's decision, ISS-0008, 2026-10-11), the
 * session, period, subject and grade. The admission number is an internal identifier and is NOT public.
 */
export async function verifyPublicCredential(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return null;
  }

  const { forVerification, setTenantContext } = await import("@/lib/tenant/for-tenant");
  const { trustedTenantId } = await import("@/lib/tenant/verified-tenant");

  return forVerification(token).transaction(async (tx) => {
    // 1. Locate Result row permitted by app_verification_token() policy
    const probe = await tx.result.findFirst({
      where: {
        verificationToken: token,
        status: { in: [ResultStatus.PUBLISHED, ResultStatus.LOCKED] },
      },
      select: { id: true, tenantId: true },
    });

    if (!probe) {
      return null;
    }

    // 2. Promote context to discovered tenant so relation models can be joined
    await setTenantContext(tx, trustedTenantId(probe.tenantId));

    const result = await tx.result.findFirst({
      where: { id: probe.id },
      include: {
        tenant: { select: { name: true, code: true } },
        student: { select: { firstName: true, middleName: true, lastName: true } },
        subject: { select: { name: true, code: true } },
        period: { select: { label: true, session: { select: { label: true } } } },
      },
    });

    if (!result) {
      return null;
    }

    const studentName = [result.student.firstName, result.student.middleName, result.student.lastName].filter(Boolean).join(" ");

    return {
      verified: true,
      institution: result.tenant.name,
      studentName,
      academicSession: result.period.session.label,
      academicPeriod: result.period.label,
      subject: result.subject.name,
      gradeLetter: result.gradeLetter,
      publishedAt: result.publishedAt,
      verificationHash: result.verificationHash,
    };
  });
}
