import { EnrollmentStatus } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import type { ErrorDetail } from "@/lib/api/envelope";
import { PromotionError, type Caller } from "./service";
import { SOURCE_STATUS_AFTER, hasNewPlace, undoProblems, type Activity } from "./undo-rules";

// Undoing a roll (task 0040). A roll that was a mistake is taken back as a NEW recorded fact: the batch and its records are append-only and are never edited, so the undo is a row of its own
// (`PromotionReversal`, one per roll) and the places move back: every pupil's place in the source session returns to ACTIVE, and the new place a promotion or a repeat made in the target session
// becomes CANCELLED (it cannot be deleted: a promotion record points at it with a restricting key).
//
// WHOLE ROLL OR NOTHING. If any pupil's place has changed since, or the new place has been used (marks, a remark on a card, an invoice, attendance in the target session), the undo is refused
// with a line for each such pupil and changes nothing: half an undone class is a worse state than either. Every check is made under a row lock on the roll's enrolments (in id order, the order
// `executePromotion` locks in, so the two cannot wait on each other) and BEFORE the first write; `forTenant().transaction` commits when the function returns and rolls back only when it throws,
// and every refusal here is thrown.

export type Reversal = { batchId: string; restored: number; cancelled: number; reason: string; createdAt: string };

/// How many pupils are named in a refusal's list: a roll can hold hundreds, and the sentence says how many more there are.
const LISTED = 100;

export async function undoPromotion(tx: Tx, tenantId: string, caller: Caller, batchId: string, reason: string): Promise<Reversal> {
  // The school's administrator only (the route says so too): the roll of a class is an administrator's act, and undoing it is the most consequential edit of pupils' places in the product.
  if (caller.role !== "ADMIN") throw new PromotionError("Only a school administrator can undo a roll.", 403);

  const batch = await tx.promotionBatch.findFirst({ where: { tenantId, id: batchId } });
  if (!batch) throw new PromotionError("That roll was not found.", 404);

  // Two undos of one roll at once take turns: the second sees the first one's reversal. (A roll and an undo of it serialise on the enrolment locks below.)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`promotion-undo:${tenantId}:${batchId}`}))`;
  if (await tx.promotionReversal.findFirst({ where: { tenantId, batchId }, select: { id: true } }))
    throw new PromotionError("This roll has already been undone.", 409, "ALREADY_UNDONE");

  const records = await tx.promotionRecord.findMany({ where: { tenantId, batchId }, orderBy: { id: "asc" } });
  const sourceIds = records.map((r) => r.sourceEnrollmentId);
  const targetIds = records.flatMap((r) => (r.targetEnrollmentId ? [r.targetEnrollmentId] : []));
  const lockIds = [...new Set([...sourceIds, ...targetIds])].sort();

  // Lock the roll's enrolments, then read their status under the lock.
  const held = lockIds.length
    ? await tx.$queryRaw<{ id: string; status: EnrollmentStatus }[]>`
        SELECT id, status FROM "StudentEnrollment"
        WHERE "tenantId" = ${tenantId} AND id = ANY(${lockIds}::text[])
        ORDER BY id
        FOR UPDATE`
    : [];
  const statusOf = new Map(held.map((row) => [row.id, row.status]));

  const [sessions, periods, students] = await Promise.all([
    tx.academicSession.findMany({
      where: { tenantId, id: { in: [batch.sourceSessionId, batch.targetSessionId] } },
      select: { id: true, label: true, startDate: true, endDate: true },
    }),
    tx.academicPeriod.findMany({ where: { tenantId, sessionId: batch.targetSessionId }, select: { id: true } }),
    tx.studentRecord.findMany({
      where: { tenantId, id: { in: records.map((r) => r.studentId) } },
      select: { id: true, admissionNo: true, firstName: true, lastName: true },
    }),
  ]);
  const sourceSession = sessions.find((s) => s.id === batch.sourceSessionId);
  const targetSession = sessions.find((s) => s.id === batch.targetSessionId);
  const sourceLabel = sourceSession?.label ?? "the source session";
  const targetLabel = targetSession?.label ?? "the target session";
  const periodIds = periods.map((p) => p.id);

  // What the pupils who got a new place have in the target session: anything that an undo would leave pointing at a place that no longer exists.
  const placed = records.filter((r) => hasNewPlace(r.decision)).map((r) => r.studentId);
  const among = (rows: { studentId: string }[]) => new Set(rows.map((r) => r.studentId));
  const [results, remarks, invoices, attendance] =
    placed.length === 0
      ? [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()]
      : await Promise.all([
          periodIds.length
            ? tx.result
                .findMany({ where: { tenantId, studentId: { in: placed }, periodId: { in: periodIds } }, select: { studentId: true } })
                .then(among)
            : new Set<string>(),
          periodIds.length
            ? tx.reportRemark
                .findMany({ where: { tenantId, studentId: { in: placed }, periodId: { in: periodIds } }, select: { studentId: true } })
                .then(among)
            : new Set<string>(),
          periodIds.length
            ? tx.invoice
                .findMany({ where: { tenantId, studentId: { in: placed }, periodId: { in: periodIds } }, select: { studentId: true } })
                .then(among)
            : new Set<string>(),
          targetSession
            ? tx.attendanceRecord
                .findMany({
                  where: { tenantId, studentId: { in: placed }, date: { gte: targetSession.startDate, lte: targetSession.endDate } },
                  select: { studentId: true },
                })
                .then(among)
            : new Set<string>(),
        ]);

  // Every pupil that stops the undo, with why.
  const who = new Map(students.map((s) => [s.id, s]));
  const blocked: ErrorDetail[] = [];
  for (const r of records) {
    const activity: Activity = {
      results: results.has(r.studentId),
      remarks: remarks.has(r.studentId),
      invoice: invoices.has(r.studentId),
      attendance: attendance.has(r.studentId),
    };
    const problems = undoProblems({
      decision: r.decision,
      sourceStatus: statusOf.get(r.sourceEnrollmentId) ?? null,
      targetStatus: r.targetEnrollmentId ? (statusOf.get(r.targetEnrollmentId) ?? null) : null,
      activity,
      sourceSession: sourceLabel,
      targetSession: targetLabel,
    });
    if (problems.length > 0) {
      const s = who.get(r.studentId);
      blocked.push({
        path: `students.${r.studentId}`,
        message: `${s ? `${s.firstName} ${s.lastName} (${s.admissionNo})` : "A pupil"}: ${problems.join(" ")}`,
      });
    }
  }
  if (blocked.length > 0)
    throw new PromotionError(
      `This roll cannot be undone: ${blocked.length} ${blocked.length === 1 ? "pupil's place has" : "pupils' places have"} been changed or used since. Nothing was changed.${blocked.length > LISTED ? ` The first ${LISTED} are listed.` : ""}`,
      409,
      "UNDO_BLOCKED",
      blocked.slice(0, LISTED),
    );

  // Every check passed under the lock. The writes: each is a compare-and-set on the status read above, and one that finds nothing to change throws, so the whole undo rolls back.
  let cancelled = 0;
  for (const r of records) {
    const back = await tx.studentEnrollment.updateMany({
      where: { tenantId, id: r.sourceEnrollmentId, status: SOURCE_STATUS_AFTER[r.decision] },
      data: { status: EnrollmentStatus.ACTIVE },
    });
    if (back.count !== 1)
      throw new PromotionError("A pupil's place changed while the roll was being undone. Nothing was changed; try again.", 409);
    if (r.targetEnrollmentId) {
      const gone = await tx.studentEnrollment.updateMany({
        where: { tenantId, id: r.targetEnrollmentId, status: EnrollmentStatus.ACTIVE },
        data: { status: EnrollmentStatus.CANCELLED },
      });
      if (gone.count !== 1)
        throw new PromotionError("A pupil's place changed while the roll was being undone. Nothing was changed; try again.", 409);
      cancelled++;
    }
  }

  const row = await tx.promotionReversal.create({
    data: { tenantId, batchId, reversedByUserId: caller.userId, reason, restored: records.length, cancelled },
  });
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: caller.userId,
      action: "PROMOTION_REVERSED",
      targetType: "PromotionBatch",
      targetId: batchId,
      afterValue: {
        reason,
        restored: records.length,
        cancelled,
        sourceSessionId: batch.sourceSessionId,
        targetSessionId: batch.targetSessionId,
        sourceClassGroupId: batch.sourceClassGroupId,
      },
    },
  });
  return { batchId, restored: records.length, cancelled, reason, createdAt: row.createdAt.toISOString() };
}
