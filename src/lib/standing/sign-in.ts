import { StandingState } from "@prisma/client";
import { forTenant, forUser } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { asDate, today, writeEvent } from "./common";

/// A suspension of a member of staff ends by itself, with no background job (design note 0028, section 4.5): suspending deactivates the membership (which is how every authority
/// check already works), so the lift happens at the one moment a person becomes signed in (`completeSignIn`). For each of the person's memberships still suspended whose end date has
/// passed, the membership is reactivated and the standing cleared (and the staff record's), with a history row written by "system". Returns how many were lifted.
///
/// The school ids come from the person's OWN membership rows, read through the user context (the way `lib/auth/audit.ts` does it), and each lift runs in that school's context.
export async function liftEndedSuspensions(userId: string): Promise<number> {
  const due = await forUser(userId).transaction((tx) =>
    tx.tenantMembership.findMany({
      where: { userId, standing: StandingState.SUSPENDED, standingUntil: { lt: asDate(today()) } },
      select: { id: true, tenantId: true },
    }),
  );
  let lifted = 0;
  for (const { id, tenantId } of due) {
    const did = await forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "TenantMembership" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      if (rows.length === 0) return false;
      const fresh = await tx.tenantMembership.findUniqueOrThrow({ where: { id } });
      // Re-checked under the lock: someone may have lifted, extended or terminated it a moment ago.
      if (fresh.standing !== StandingState.SUSPENDED || !fresh.standingUntil || fresh.standingUntil >= asDate(today())) return false;
      const record = await tx.staffRecord.findFirst({ where: { tenantId, userId, standing: StandingState.SUSPENDED } });
      await tx.tenantMembership.update({
        where: { id },
        data: { deactivatedAt: null, standing: StandingState.ACTIVE, standingUntil: null },
      });
      if (record)
        await tx.staffRecord.update({
          where: { tenantId_id: { tenantId, id: record.id } },
          data: { standing: StandingState.ACTIVE, standingUntil: null },
        });
      await writeEvent(
        tx,
        tenantId,
        {
          subject: "STAFF",
          memberUserId: userId,
          staffRecordId: record?.id ?? null,
          campusId: fresh.campusId,
          action: "LIFT",
          reason: "The suspension's end date has passed.",
          decidedByUserId: "system",
        },
        {
          targetType: "User",
          targetId: userId,
          before: { standing: "SUSPENDED", until: fresh.standingUntil.toISOString().slice(0, 10) },
          after: { standing: "ACTIVE", until: null },
        },
      );
      return true;
    });
    if (did) lifted++;
  }
  return lifted;
}
