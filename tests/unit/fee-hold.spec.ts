import "../support/env";
import { test, expect } from "@playwright/test";
import { Prisma, InvoiceStatus } from "@prisma/client";
import { outstandingFees, owedText, withheldMessage, type OwingInvoice } from "@/lib/results/fee-hold";

// What a pupil owes for the payment gate on report cards (task 0037), as tables.

const TODAY = new Date("2026-11-10T15:30:00Z");
const d = (iso: string | null) => (iso === null ? null : new Date(`${iso}T00:00:00Z`));
const inv = (status: InvoiceStatus, total: number, paid: number, due: string | null): OwingInvoice => ({
  status,
  totalAmount: total,
  amountPaid: paid,
  dueDate: d(due),
});
const owed = (invoices: OwingInvoice[]) => outstandingFees(invoices, TODAY).toNumber();

test.describe("outstandingFees", () => {
  test("nothing owed with no invoices, and nothing for paid or waived ones", () => {
    expect(owed([])).toBe(0);
    expect(owed([inv("PAID", 50000, 50000, "2026-09-01"), inv("WAIVED", 50000, 0, "2026-09-01")])).toBe(0);
  });
  test("an unpaid invoice owes its whole total; a part-paid one the rest", () => {
    expect(owed([inv("UNPAID", 50000, 0, "2026-09-01")])).toBe(50000);
    expect(owed([inv("PARTIALLY_PAID", 50000, 20000, "2026-09-01")])).toBe(30000);
  });
  test("invoices add up, and an overpayment on one does not reduce what another owes", () => {
    expect(
      owed([inv("UNPAID", 10000, 0, null), inv("PARTIALLY_PAID", 20000, 5000, "2026-10-01"), inv("UNPAID", 1000.5, 0, "2026-11-10")]),
    ).toBe(26000.5);
    expect(owed([inv("UNPAID", 10000, 0, null), inv("PARTIALLY_PAID", 20000, 25000, "2026-10-01")])).toBe(10000);
  });
  test("an invoice with no due date is due; one due today is due; one due tomorrow or later is not", () => {
    expect(owed([inv("UNPAID", 100, 0, null)])).toBe(100);
    expect(owed([inv("UNPAID", 100, 0, "2026-11-10")])).toBe(100);
    expect(owed([inv("UNPAID", 100, 0, "2026-11-11")])).toBe(0);
    expect(owed([inv("UNPAID", 100, 0, "2027-01-05"), inv("UNPAID", 40, 0, "2026-11-09")])).toBe(40);
  });
  test("the day is the calendar day, whatever the time of day", () => {
    const late = new Date("2026-11-10T23:59:59Z");
    const early = new Date("2026-11-10T00:00:00Z");
    for (const now of [late, early]) {
      expect(outstandingFees([inv("UNPAID", 100, 0, "2026-11-10")], now).toNumber()).toBe(100);
      expect(outstandingFees([inv("UNPAID", 100, 0, "2026-11-11")], now).toNumber()).toBe(0);
    }
  });
  test("it is exact in kobo, not floating point", () => {
    const invoices = Array.from({ length: 10 }, () => inv("UNPAID", 0.1, 0, null));
    expect(outstandingFees(invoices, TODAY).toString()).toBe("1");
    expect(
      outstandingFees(
        [{ status: "UNPAID", totalAmount: new Prisma.Decimal("1234.56"), amountPaid: new Prisma.Decimal("0.01"), dueDate: null }],
        TODAY,
      ).toString(),
    ).toBe("1234.55");
  });
});

test.describe("the words", () => {
  test("a whole amount has no kobo; any other amount has two places", () => {
    expect(owedText(new Prisma.Decimal(5000))).toBe("₦5,000");
    expect(owedText(new Prisma.Decimal("1234.5"))).toBe("₦1,234.50");
    expect(owedText(new Prisma.Decimal("0.05"))).toBe("₦0.05");
  });
  test("the sentence a pupil or parent is given says what is owed and what to do", () => {
    expect(withheldMessage(new Prisma.Decimal(30000))).toBe(
      "This report card is being held until the outstanding school fees of ₦30,000 are paid. Please contact the school office.",
    );
  });
});
