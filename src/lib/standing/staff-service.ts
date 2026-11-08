import { Role, StandingState } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { hasAnotherActiveAdmin } from "@/lib/members/service";
import type { Tx } from "@/lib/tenant/for-tenant";
import { asDate, done, namesOf, refuse, today, writeEvent, type HistoryEntry, type Result } from "./common";
import { dayOf, effectiveStanding, mayAct, standingAfter, suspensionEndProblem, type StandingAction } from "./rules";
import { maySuspendSwitch } from "./settings";

// Standing of a member of staff (task 0028, section 4.3): suspended (until a date, or until lifted) or terminated. The authority itself already lives in
// `TenantMembership.deactivatedAt` (every authority check reads it), so a suspension and a termination deactivate the membership and say WHY in `standing`; the staff record carries
// the same standing, and a terminated record is archived (the live filters already drop an archived one). A person has ONE membership per school, so there is no school-wide scope: the
// membership is the school's.

type TenantCtx = TenantAuthContext["tenant"];

export type StaffAction = Extract<StandingAction, "SUSPEND" | "LIFT" | "TERMINATE" | "REINSTATE">;
export type StaffTarget = { memberUserId: string } | { staffRecordId: string };
export type StaffChange = { reason: string; until?: string | null };

const MEMBERSHIP = {
  id: true,
  userId: true,
  campusId: true,
  role: true,
  standing: true,
  standingUntil: true,
  deactivatedAt: true,
} as const;
const RECORD = { id: true, userId: true, campusId: true, standing: true, standingUntil: true, archivedAt: true } as const;
type MembershipRow = {
  id: string;
  userId: string;
  campusId: string | null;
  role: Role;
  standing: StandingState;
  standingUntil: Date | null;
  deactivatedAt: Date | null;
};
type RecordRow = {
  id: string;
  userId: string | null;
  campusId: string | null;
  standing: StandingState;
  standingUntil: Date | null;
  archivedAt: Date | null;
};
type Unit = { campusId: string | null; membership: MembershipRow | null; record: RecordRow | null };

/// The one unit (a membership and/or a staff record of the school) a target names.
async function unitOf(tx: Tx, tenantId: string, target: StaffTarget): Promise<Unit | null> {
  if ("memberUserId" in target) {
    const membership = await tx.tenantMembership.findFirst({ where: { tenantId, userId: target.memberUserId }, select: MEMBERSHIP });
    if (!membership) return null;
    const record = await tx.staffRecord.findFirst({
      where: { tenantId, userId: membership.userId },
      select: RECORD,
      orderBy: { createdAt: "desc" },
    });
    return { campusId: membership.campusId ?? record?.campusId ?? null, membership, record };
  }
  const record = await tx.staffRecord.findFirst({ where: { tenantId, id: target.staffRecordId }, select: RECORD });
  if (!record) return null;
  const membership = record.userId
    ? await tx.tenantMembership.findFirst({ where: { tenantId, userId: record.userId }, select: MEMBERSHIP })
    : null;
  return { campusId: membership?.campusId ?? record.campusId, membership, record };
}

const storedOf = (unit: Unit) => {
  const until = unit.membership?.standingUntil ?? unit.record?.standingUntil ?? null;
  return {
    standing: (unit.membership?.standing ?? unit.record?.standing ?? StandingState.ACTIVE) as StandingState,
    until: until ? dayOf(until) : null,
  };
};

/// The state an action leads to for this unit, or null when it does not apply to it.
function nextFor(unit: Unit, action: StaffAction): StandingState | null {
  const stored = storedOf(unit);
  // Lifting works on what is stored (a suspension whose end date has passed can still be cleared); everything else on what applies today.
  const current = action === "LIFT" ? stored.standing : effectiveStanding(stored.standing, stored.until, today());
  // Someone who was only deactivated (not suspended) is reactivated on the Users page, not suspended.
  if (action === "SUSPEND" && unit.membership?.deactivatedAt && stored.standing === StandingState.ACTIVE) return null;
  return standingAfter(action, "STAFF", current) as StandingState | null;
}

/// A campus administrator reaches the staff of their own campus only (a person with no campus is the school's: not theirs, and not even known to them).
const outOfReach = (tenant: TenantCtx, unit: Unit): boolean =>
  tenant.role !== "ADMIN" && (unit.campusId === null || unit.campusId !== tenant.campusId);

export async function changeStaffStanding(
  tenant: TenantCtx,
  actorUserId: string,
  target: StaffTarget,
  action: StaffAction,
  input: StaffChange,
): Promise<Result<{ standing: string }>> {
  const { tenantId } = tenant;
  const isAdmin = tenant.role === "ADMIN";
  if (!isAdmin && tenant.role !== "CAMPUS_ADMIN") return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
  const until = action === "SUSPEND" ? (input.until ?? null) : null;
  if (action === "SUSPEND") {
    const problem = suspensionEndProblem(until, today());
    if (problem) return refuse(400, "VALIDATION", problem, [{ path: "body.until", message: problem }]);
  }

  return tenant.run(async (tx): Promise<Result<{ standing: string }>> => {
    const first = await unitOf(tx, tenantId, target);
    if (!first || outOfReach(tenant, first)) return refuse(404, "NOT_FOUND", "That member of staff was not found.");
    const userId = first.membership?.userId ?? first.record?.userId ?? null;

    // One change to a person's standing at a time: their membership (or their record, for one with no sign-in) is locked for the rest of the transaction.
    if (userId) await tx.$queryRaw`SELECT "id" FROM "TenantMembership" WHERE "tenantId" = ${tenantId} AND "userId" = ${userId} FOR UPDATE`;
    else if (first.record)
      await tx.$queryRaw`SELECT "id" FROM "StaffRecord" WHERE "tenantId" = ${tenantId} AND "id" = ${first.record.id} FOR UPDATE`;
    const unit = (await unitOf(tx, tenantId, target)) ?? first;

    const refusal = mayAct(
      action,
      { userId: actorUserId, isAdmin, adminOfCampus: !isAdmin },
      {
        campusAdminMaySuspend: await maySuspendSwitch.onFor(tx, tenantId, unit.campusId),
        targetUserId: userId,
        targetIsAdmin: unit.membership?.role === Role.ADMIN,
      },
    );
    if (refusal === "SELF") return refuse(409, "SELF", "You can't change your own standing. Ask another administrator.");
    if (refusal) return refuse(403, "FORBIDDEN", "You don't have permission to do that.");

    const next = nextFor(unit, action);
    if (!next) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: nothing is in the state this needs.");

    // Taking the membership away from the school's last active administrator would leave it with none: the same guard as deactivating one.
    const deactivating = action === "SUSPEND" || action === "TERMINATE";
    if (
      deactivating &&
      unit.membership &&
      !unit.membership.deactivatedAt &&
      unit.membership.role === Role.ADMIN &&
      !(await hasAnotherActiveAdmin(tx, tenantId))
    )
      return refuse(409, "LAST_ADMIN", "This is the school's last administrator. Make someone else an administrator first.");

    const now = new Date();
    const standingUntil = next === StandingState.SUSPENDED && until ? asDate(until) : null;
    const before = storedOf(unit);
    if (unit.membership) {
      const deactivatedAt = next === StandingState.ACTIVE ? null : (unit.membership.deactivatedAt ?? now);
      await tx.tenantMembership.update({ where: { id: unit.membership.id }, data: { standing: next, standingUntil, deactivatedAt } });
    }
    if (unit.record) {
      const archivedAt =
        next === StandingState.TERMINATED ? (unit.record.archivedAt ?? now) : action === "REINSTATE" ? null : unit.record.archivedAt;
      await tx.staffRecord.update({
        where: { tenantId_id: { tenantId, id: unit.record.id } },
        data: { standing: next, standingUntil, archivedAt },
      });
    }
    await writeEvent(
      tx,
      tenantId,
      {
        subject: "STAFF",
        staffRecordId: unit.record?.id ?? null,
        memberUserId: userId,
        campusId: unit.campusId,
        action,
        reason: input.reason,
        endsOn: until,
        decidedByUserId: actorUserId,
      },
      {
        targetType: unit.membership ? "User" : "StaffRecord",
        targetId: (unit.membership?.userId ?? unit.record?.id)!,
        before,
        after: { standing: next, until },
      },
    );
    return done({ standing: next });
  });
}

export async function staffStandingHistory(
  tenant: TenantCtx,
  target: StaffTarget,
): Promise<Result<{ standing: string; until: string | null; events: HistoryEntry[] }>> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const unit = await unitOf(tx, tenantId, target);
    if (!unit || outOfReach(tenant, unit)) return refuse(404, "NOT_FOUND", "That member of staff was not found.");
    const ids = [
      unit.membership ? { memberUserId: unit.membership.userId } : null,
      unit.record ? { staffRecordId: unit.record.id } : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null);
    const rows =
      ids.length === 0
        ? []
        : await tx.standingEvent.findMany({ where: { tenantId, OR: ids }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
    const names = await namesOf(
      tx,
      tenantId,
      rows.map((row) => row.decidedByUserId),
    );
    const stored = storedOf(unit);
    return done({
      standing: stored.standing,
      until: stored.until,
      events: rows.map((row) => ({
        id: row.id,
        action: row.action,
        reason: row.reason,
        startsOn: dayOf(row.startsOn),
        endsOn: row.endsOn ? dayOf(row.endsOn) : null,
        decidedBy:
          row.decidedByUserId === "system"
            ? "The school's records (the end date passed)"
            : (names.get(row.decidedByUserId) ?? "A person who has left"),
        at: row.createdAt.toISOString(),
      })),
    });
  });
}
