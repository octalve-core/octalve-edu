import { Prisma, InvoiceStatus, ProgramPaymentSource, PaymentStatus } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { checkPart } from "@/lib/finance/part-payment";
import { loadEffectivePolicy } from "@/lib/finance/part-payment-service";
import { change, done, refuse, writeAudit, type Result } from "./common";
import { fromCents, statusOf, toCents } from "./fees-rules";
import { mayTouchInvoice, nextNumber } from "./fees-service";

// Programs, slice P4: taking payments on a program's invoices (task 0027; AlEemaan's task 0043, section 11.4). The same locked path as the school's money (task 0029): the invoice row is
// locked, the part-payment rule of the invoice's campus applies, "pay in full only" can tighten it. Receipts are numbered from the school's own program sequence (PRC-2026-0001).
//
// Not built: paying through the payment gateway (starting a payment and the webhook that completes it). Staff record a payment taken outside (cash, a transfer, a card machine).

const INVOICE_NOT_FOUND = "That invoice was not found.";

function reference(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `prg_man_${Date.now()}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/// What a payment may be, checked on a locked invoice: the invoice is open, the amount is positive and not above the balance, and the part-payment rule allows it.
async function checkPayable(
  tx: Tx,
  tenantId: string,
  invoice: { campusId: string | null; status: InvoiceStatus; totalAmount: Prisma.Decimal; amountPaid: Prisma.Decimal; payInFull: boolean },
  amount: number,
) {
  if (invoice.status === "PAID") return refuse(409, "ALREADY_PAID", "That invoice is already fully paid.");
  if (invoice.status !== "UNPAID" && invoice.status !== "PARTIALLY_PAID")
    return refuse(409, "NOT_OPEN", `That invoice is ${invoice.status.toLowerCase()}.`);
  const balance = toCents(Number(invoice.totalAmount)) - toCents(Number(invoice.amountPaid));
  if (toCents(amount) <= 0)
    return refuse(400, "VALIDATION", "The amount must be more than zero.", [
      { path: "body.amount", message: "The amount must be more than zero." },
    ]);
  if (toCents(amount) > balance)
    return refuse(409, "EXCEEDS_BALANCE", "The amount can't be more than what is owed.", [
      { path: "body.amount", message: "The amount can't be more than what is owed." },
    ]);
  const policy = await loadEffectivePolicy(tx, tenantId, invoice.campusId);
  const check = checkPart({ total: invoice.totalAmount, paid: invoice.amountPaid, amount, policy, payInFull: invoice.payInFull });
  return check.ok ? null : refuse(409, check.code, check.message, [{ path: "body.amount", message: check.message }]);
}

export type PaymentInput = { amount: number; channel: string; reference?: string; notes?: string };

/// Records a payment that was taken outside. The school's administrator, a program admin, or the administrator of the invoice's campus. Accepted even when fees have been switched off for the
/// program since: an invoice that exists can still be paid, and money offered is not turned away.
export async function recordProgramPayment(
  auth: TenantAuthContext,
  programId: string,
  invoiceId: string,
  input: PaymentInput,
): Promise<Result<{ paymentId: string; receiptNo: string; balance: number; status: InvoiceStatus }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(
    auth,
    programId,
    "people",
    async ({ tx, viewer }) => {
      await tx.$queryRaw`SELECT "id" FROM "ProgramInvoice" WHERE "tenantId" = ${tenantId} AND "id" = ${invoiceId} AND "programId" = ${programId} FOR UPDATE`;
      const invoice = await tx.programInvoice.findFirst({ where: { tenantId, id: invoiceId, programId } });
      if (!invoice || !mayTouchInvoice(viewer, invoice.campusId)) return refuse(404, "NOT_FOUND", INVOICE_NOT_FOUND);
      const refused = await checkPayable(tx, tenantId, invoice, input.amount);
      if (refused) return refused;
      const ref = input.reference ?? reference();
      if (
        await tx.programPayment.findFirst({
          where: { tenantId, source: ProgramPaymentSource.MANUAL, providerRef: ref },
          select: { id: true },
        })
      )
        return refuse(409, "DUPLICATE_REFERENCE", "A payment with that reference has already been recorded.", [
          { path: "body.reference", message: "A payment with that reference has already been recorded." },
        ]);
      const year = new Date().getFullYear();
      const receiptNo = `PRC-${year}-${String(await nextNumber(tx, tenantId, "receipt", year)).padStart(4, "0")}`;
      const payment = await tx.programPayment.create({
        data: {
          tenantId,
          programId,
          campusId: invoice.campusId,
          invoiceId,
          amount: input.amount,
          source: ProgramPaymentSource.MANUAL,
          providerRef: ref,
          status: PaymentStatus.SUCCESS,
          verifiedServerSide: true,
          channel: input.channel,
          paidAt: new Date(),
          receiptNo,
          recordedByUserId: actorUserId,
          metadata: input.notes ? { notes: input.notes } : undefined,
        },
      });
      const paid = toCents(Number(invoice.amountPaid)) + toCents(input.amount);
      const total = toCents(Number(invoice.totalAmount));
      const status = statusOf(total, paid) as InvoiceStatus;
      await tx.programInvoice.update({ where: { id: invoiceId }, data: { amountPaid: fromCents(paid), status } });
      await writeAudit(tx, tenantId, {
        programId,
        actorUserId,
        action: "PAYMENT_RECORDED",
        targetType: "Invoice",
        targetId: invoiceId,
        after: { amount: input.amount, channel: input.channel, receiptNo },
      });
      return done({ paymentId: payment.id, receiptNo, balance: fromCents(total - paid), status });
    },
    { allowArchived: true },
  );
}
