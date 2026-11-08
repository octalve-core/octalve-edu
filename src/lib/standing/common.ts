import { Prisma, StandingEventAction, StandingSubject } from "@prisma/client";
import type { ErrorDetail } from "@/lib/api/envelope";
import { dayOf, type StandingAction } from "./rules";

// Shared by the standing services: the result type, the history write, and the day.

export type Failure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string; details?: ErrorDetail[] };
export type Result<T> = { ok: true; data: T } | Failure;
export const refuse = (status: Failure["status"], code: string, message: string, details?: ErrorDetail[]): Failure => ({
  ok: false,
  status,
  code,
  message,
  details,
});
export const done = <T>(data: T): Result<T> => ({ ok: true, data });

/// A calendar day as a Date at UTC midnight (what a `@db.Date` column holds).
export const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
export const today = (): string => dayOf(new Date());

const EVENT_ACTION: Record<StandingAction, StandingEventAction> = {
  SUSPEND: StandingEventAction.SUSPENDED,
  LIFT: StandingEventAction.LIFTED,
  EXPEL: StandingEventAction.EXPELLED,
  TERMINATE: StandingEventAction.TERMINATED,
  REINSTATE: StandingEventAction.REINSTATED,
};

export type EventInput = {
  subject: StandingSubject;
  studentId?: string | null;
  staffRecordId?: string | null;
  /// The person's account, for a member of staff who has one.
  memberUserId?: string | null;
  /// The record's campus (null: the school).
  campusId: string | null;
  action: StandingAction;
  reason: string;
  endsOn?: string | null;
  decidedByUserId: string;
};

/// The only place a StandingEvent is written (the database refuses every update and delete of one). Also writes the AuditLog row, in the same transaction, as the other people services do.
export async function writeEvent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  event: EventInput,
  audit: { targetType: string; targetId: string; before: Prisma.InputJsonValue; after: Prisma.InputJsonValue },
) {
  const start = today();
  await tx.standingEvent.create({
    data: {
      tenantId,
      subject: event.subject,
      studentId: event.studentId ?? null,
      staffRecordId: event.staffRecordId ?? null,
      memberUserId: event.memberUserId ?? null,
      campusId: event.campusId,
      action: EVENT_ACTION[event.action],
      reason: event.reason,
      startsOn: asDate(start),
      endsOn: event.endsOn ? asDate(event.endsOn) : null,
      decidedByUserId: event.decidedByUserId,
    },
  });
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: event.decidedByUserId,
      action: `${event.subject}_${EVENT_ACTION[event.action]}`,
      targetType: audit.targetType,
      targetId: audit.targetId,
      beforeValue: audit.before,
      afterValue: audit.after,
      reason: event.reason,
    },
  });
}

export type HistoryEntry = {
  id: string;
  action: StandingEventAction;
  reason: string;
  startsOn: string;
  endsOn: string | null;
  decidedBy: string;
  at: string;
};

/// The names of the people who decided, read through the school's own memberships (the `User` table has no school column, so it is never queried on its own).
export async function namesOf(
  tx: Pick<Prisma.TransactionClient, "tenantMembership">,
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const rows = await tx.tenantMembership.findMany({
    where: { tenantId, userId: { in: [...new Set(ids)] } },
    select: { userId: true, user: { select: { name: true, email: true } } },
  });
  return new Map(rows.map((row) => [row.userId, row.user.name ?? row.user.email ?? "Someone"]));
}
