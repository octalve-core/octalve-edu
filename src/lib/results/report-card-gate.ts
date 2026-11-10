import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { ceilingSwitch } from "@/lib/settings/ceiling-switch";
import { outstandingFees } from "./fee-hold";

// The payment gate on report cards (task 0037). The setting is a ceiling switch read the other way round: ON (nothing stored) means report cards are released whatever is owed, OFF holds them
// for a pupil or parent while school fees are owed. The school's value is the ceiling and a campus can only turn it OFF for itself, so a campus can hold more but never release what the school
// holds. Staff are never held.

export const REPORT_CARDS_OPEN_KEY = "results.reportCardsOpen";
export const reportCardsOpenSwitch = ceilingSwitch({ key: REPORT_CARDS_OPEN_KEY, auditAction: "REPORT_CARD_GATE_CHANGED" });

/// What holds this pupil's card now: the amount owed, or null when the card is not held (the gate is off for the pupil's campus, or nothing is owed). Read in the caller's transaction; a failure
/// to answer is an error, never a card released.
export async function feeHoldFor(
  tx: Tx,
  tenantId: string,
  student: { id: string; campusId: string | null },
  today: Date = new Date(),
): Promise<{ outstanding: Prisma.Decimal } | null> {
  if (await reportCardsOpenSwitch.onFor(tx, tenantId, student.campusId)) return null;
  const invoices = await tx.invoice.findMany({
    where: { tenantId, studentId: student.id, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
    select: { status: true, totalAmount: true, amountPaid: true, dueDate: true },
  });
  const outstanding = outstandingFees(invoices, today);
  return outstanding.gt(0) ? { outstanding } : null;
}
