import { InvoiceStatus, Prisma } from "@prisma/client";
import { formatNaira } from "@/lib/finance/format";

// What a pupil owes, for the payment gate on report cards (task 0037), pure: no database, no clock of its own. The service reads the invoices and the date and asks.

export type OwingInvoice = {
  status: InvoiceStatus;
  totalAmount: Prisma.Decimal | number | string;
  amountPaid: Prisma.Decimal | number | string;
  dueDate: Date | null;
};

const OWING: readonly InvoiceStatus[] = [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID];

/// The calendar day of `today` as the date column holds it (UTC midnight). An invoice due today is due.
const dayOf = (today: Date) => Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

/// What is owed on school fees: for every invoice that is UNPAID or PARTIALLY_PAID and DUE (no due date, or the due date is today or past), the total (already net of discounts) less what was paid.
/// A PAID or WAIVED invoice owes nothing, and neither does one issued in advance that is not yet due; an overpayment on one invoice does not reduce what another owes.
export function outstandingFees(invoices: readonly OwingInvoice[], today: Date): Prisma.Decimal {
  let owed = new Prisma.Decimal(0);
  for (const invoice of invoices) {
    if (!OWING.includes(invoice.status)) continue;
    if (invoice.dueDate !== null && invoice.dueDate.getTime() > dayOf(today)) continue;
    const balance = new Prisma.Decimal(invoice.totalAmount).sub(invoice.amountPaid);
    if (balance.gt(0)) owed = owed.add(balance);
  }
  return owed;
}

/// An amount as the refusal writes it: ₦5,000 for a whole amount, ₦1,234.50 otherwise (never a ".00" nobody typed).
export const owedText = (amount: Prisma.Decimal): string =>
  amount.isInteger() ? formatNaira(amount).replace(/\.00$/, "") : formatNaira(amount);

/// The sentence a pupil or parent is given.
export const withheldMessage = (amount: Prisma.Decimal): string =>
  `This report card is being held until the outstanding school fees of ${owedText(amount)} are paid. Please contact the school office.`;
