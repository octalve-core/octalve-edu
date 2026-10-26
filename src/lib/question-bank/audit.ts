import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";

// Every question bank change that matters is written to QuestionBankAudit, in the SAME transaction as the change (ADR 0002): who, what, when, and the old and new value. The
// table is append-only (a trigger refuses UPDATE and DELETE; migration 20261101090000). `campusId` null means a school-wide change. An absent old or new value is stored as SQL
// NULL ("nothing before" / "cleared"). A change to a switch records when the person last proved who they are (decision D3): the database refuses a SETTING row without it.

export type BankAuditEntry = {
  tenantId: string;
  campusId?: string | null;
  itemId?: string | null;
  actorUserId?: string | null;
  entity: "ITEM" | "REVIEWER" | "SETTING";
  action: string;
  /// The setting key, or the reviewer row's id, when the entity is not an item.
  ref?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  reason?: string | null;
  stepUpVerifiedAt?: Date | null;
};

export function writeBankAudit(tx: Tx, entry: BankAuditEntry) {
  return tx.questionBankAudit.create({
    data: {
      tenantId: entry.tenantId,
      campusId: entry.campusId ?? null,
      itemId: entry.itemId ?? null,
      actorUserId: entry.actorUserId ?? null,
      entity: entry.entity,
      action: entry.action,
      ref: entry.ref ?? null,
      oldValue: entry.oldValue ?? undefined,
      newValue: entry.newValue ?? undefined,
      reason: entry.reason ?? null,
      stepUpVerifiedAt: entry.stepUpVerifiedAt ?? null,
    },
  });
}
