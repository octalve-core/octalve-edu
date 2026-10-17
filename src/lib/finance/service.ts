import { Prisma, InvoiceStatus, PaymentProvider, PaymentStatus, DiscountWorkflowMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forTenant, type Tx } from "@/lib/tenant/for-tenant";
import { trustedTenantId, type VerifiedTenantId } from "@/lib/tenant/verified-tenant";
import {
  toDecimal,
  toKobo,
  resolveInvoiceStatus,
  generateInvoiceNumber,
  generateReceiptNumber,
  generatePaymentReference,
  type DecimalLike,
} from "./rules";
import { verifyPaystackSignature, computePayloadHash } from "./crypto";
import { getPaystackClient, MockPaystackGateway } from "./paystack";
import { triggerInvoiceIssuedAlerts } from "@/lib/communication/event-triggers";

export interface FeeStructureInput {
  name: string;
  amount: DecimalLike;
  periodId: string;
  classGroupId?: string | null;
}

export interface InvoiceFilter {
  periodId?: string;
  studentId?: string;
  status?: InvoiceStatus;
  page?: number;
  pageSize?: number;
}

export interface RequesterContext {
  userId: string;
  roles: string[];
  permissions: string[];
  /// The member's campus (a campus administrator sees only the invoices of that campus's students).
  campusId?: string | null;
}

/// Which invoices this member may see. The school's finance people (an ADMIN, or anyone holding CAN_MANAGE_FINANCE) see them all; a campus
/// administrator sees only their campus's students' - and that wins over a permission, so a campus administrator who is also given
/// CAN_MANAGE_FINANCE is still a campus administrator; everyone else sees only their own invoices (a student's) and their linked children's (a
/// guardian's). A student with no campus belongs to no campus administrator.
function invoiceVisibility(requester: RequesterContext): Prisma.InvoiceWhereInput {
  if (requester.roles.includes("CAMPUS_ADMIN")) {
    return requester.campusId ? { student: { campusId: requester.campusId } } : { id: { in: [] } };
  }
  if (requester.roles.includes("ADMIN") || requester.permissions.includes("CAN_MANAGE_FINANCE")) return {};
  return {
    student: {
      OR: [{ userId: requester.userId }, { guardians: { some: { status: "APPROVED", guardian: { userId: requester.userId } } } }],
    },
  };
}

/**
 * Creates a fee schedule item for an academic period.
 */
export async function createFeeStructure(tenantId: VerifiedTenantId, data: FeeStructureInput, actorUserId: string) {
  return forTenant(tenantId).transaction(async (tx) => {
    // Validate period belongs to this tenant
    await tx.academicPeriod.findFirstOrThrow({
      where: { tenantId, id: data.periodId },
    });

    if (data.classGroupId) {
      await tx.classGroup.findFirstOrThrow({
        where: { tenantId, id: data.classGroupId },
      });
    }

    const amountDecimal = toDecimal(data.amount);
    if (amountDecimal.isNegative()) {
      throw new FinanceRefusal("Fee structure amount cannot be negative");
    }

    const fee = await tx.feeStructure.create({
      data: {
        tenantId,
        periodId: data.periodId,
        classGroupId: data.classGroupId ?? null,
        name: data.name.trim(),
        amount: amountDecimal,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: "fee_structure.create",
        targetType: "FeeStructure",
        targetId: fee.id,
        afterValue: { name: fee.name, amount: fee.amount.toString(), periodId: fee.periodId },
      },
    });

    return fee;
  });
}

/**
 * Queries fee structures for a tenant with optional period and classGroup filtering.
 */
export async function queryFeeStructures(tenantId: VerifiedTenantId, filter?: { periodId?: string; classGroupId?: string }) {
  return forTenant(tenantId).transaction(async (tx) => {
    return tx.feeStructure.findMany({
      where: {
        tenantId,
        ...(filter?.periodId ? { periodId: filter.periodId } : {}),
        ...(filter?.classGroupId ? { classGroupId: filter.classGroupId } : {}),
      },
      include: {
        period: { select: { id: true, label: true, kind: true, ordinal: true } },
        classGroup: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });
}

/**
 * Idempotently generates term invoices for all enrolled students in a period.
 * (Roadmap §1.5 T2: idempotent per student+period).
 */
export async function generateInvoicesForPeriod(
  tenantId: VerifiedTenantId,
  schoolCode: string,
  periodId: string,
  options?: { dueDate?: Date | null; actorUserId?: string },
): Promise<{ created: number; skipped: number }> {
  return forTenant(tenantId).transaction(async (tx) => {
    const period = await tx.academicPeriod.findFirstOrThrow({
      where: { tenantId, id: periodId },
    });

    const feeStructures = await tx.feeStructure.findMany({
      where: { tenantId, periodId },
    });

    if (feeStructures.length === 0) {
      throw new FinanceRefusal("No fee structures configured for this academic period");
    }

    const enrollments = await tx.studentEnrollment.findMany({
      where: {
        tenantId,
        sessionId: period.sessionId,
        status: "ACTIVE",
      },
      include: {
        student: true,
        classArm: true,
      },
    });

    let created = 0;
    let skipped = 0;
    const createdInvoiceIds: string[] = [];
    const year = new Date().getFullYear();

    for (const enrollment of enrollments) {
      // Idempotency guard: student already has an invoice for this period
      const existing = await tx.invoice.findUnique({
        where: {
          tenantId_studentId_periodId: {
            tenantId,
            studentId: enrollment.studentId,
            periodId,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Filter fee structures applicable to student's class group (or universal ones where classGroupId is null)
      const applicableFees = feeStructures.filter((f) => !f.classGroupId || f.classGroupId === enrollment.classArm.classGroupId);

      if (applicableFees.length === 0) {
        skipped++;
        continue;
      }

      let totalAmount = new Prisma.Decimal(0);
      const lineItems = applicableFees.map((f) => {
        totalAmount = totalAmount.add(f.amount);
        return {
          feeStructureId: f.id,
          name: f.name,
          amount: f.amount.toString(),
        };
      });

      const count = await tx.invoice.count({ where: { tenantId } });
      const invoiceNo = generateInvoiceNumber(schoolCode, year, count + 1);

      const createdInvoice = await tx.invoice.create({
        data: {
          tenantId,
          studentId: enrollment.studentId,
          periodId,
          invoiceNo,
          totalAmount,
          amountPaid: new Prisma.Decimal(0),
          status: InvoiceStatus.UNPAID,
          dueDate: options?.dueDate ?? null,
          lineItems,
        },
      });

      createdInvoiceIds.push(createdInvoice.id);
      created++;
    }

    if (createdInvoiceIds.length > 0) {
      await triggerInvoiceIssuedAlerts(tx, {
        tenantId,
        invoiceIds: createdInvoiceIds,
        actorUserId: options?.actorUserId || "system",
      });
    }

    if (options?.actorUserId && created > 0) {
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: options.actorUserId,
          action: "invoice.batch_generate",
          targetType: "AcademicPeriod",
          targetId: periodId,
          afterValue: { created, skipped },
        },
      });
    }

    return { created, skipped };
  });
}

/**
 * Queries invoices with role-based filtering and pagination.
 */
export async function queryInvoices(tenantId: VerifiedTenantId, requester: RequesterContext, filter?: InvoiceFilter) {
  return forTenant(tenantId).transaction(async (tx) => {
    const page = Math.max(1, filter?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter?.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const where: Prisma.InvoiceWhereInput = {
      AND: [invoiceVisibility(requester)],
      tenantId,
      ...(filter?.periodId ? { periodId: filter.periodId } : {}),
      ...(filter?.studentId ? { studentId: filter.studentId } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
    };

    const [items, total] = await Promise.all([
      tx.invoice.findMany({
        where,
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, admissionNo: true },
          },
          period: {
            select: { id: true, label: true, kind: true },
          },
          payments: {
            where: { status: PaymentStatus.SUCCESS },
            select: { id: true, amount: true, paidAt: true, receiptNo: true, channel: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      tx.invoice.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  });
}

/**
 * Retrieves a single student invoice with strict IDOR verification.
 * Only ADMIN/CAN_MANAGE_FINANCE, the student themselves, or verified linked guardians may view.
 */
export async function getStudentInvoice(tenantId: VerifiedTenantId, invoiceId: string, requester?: RequesterContext) {
  return forTenant(tenantId).transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { tenantId, id: invoiceId },
      include: {
        student: {
          select: { id: true, firstName: true, middleName: true, lastName: true, admissionNo: true, userId: true, campusId: true },
        },
        period: {
          select: { id: true, label: true, kind: true, session: { select: { id: true, label: true } } },
        },
        payments: {
          orderBy: { createdAt: "desc" },
        },
        discounts: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (requester) {
      // A campus administrator: their campus's students only (never a student with no campus), whatever else they hold
      if (requester.roles.includes("CAMPUS_ADMIN")) {
        if (!requester.campusId || invoice.student.campusId !== requester.campusId) throw new FinanceNotFound("Invoice not found.");
        return invoice;
      }
      const isStaffWithFinanceAccess = requester.roles.includes("ADMIN") || requester.permissions.includes("CAN_MANAGE_FINANCE");

      if (!isStaffWithFinanceAccess) {
        const isStudentHimself = invoice.student.userId === requester.userId;

        // Check if requester is a linked guardian
        const isLinkedGuardian = await tx.guardianLink.findFirst({
          where: {
            tenantId,
            studentId: invoice.studentId,
            guardian: { userId: requester.userId },
            status: "APPROVED",
          },
        });

        if (!isStudentHimself && !isLinkedGuardian) {
          throw new FinanceNotFound("Invoice not found.");
        }
      }
    }

    return invoice;
  });
}

/**
 * Initializes a payment attempt against an invoice via Paystack.
 */
export async function initializePayment(
  tenantId: VerifiedTenantId,
  invoiceId: string,
  userEmail: string,
  amountInNaira?: DecimalLike,
  callbackUrl?: string,
) {
  return forTenant(tenantId).transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { tenantId, id: invoiceId },
      include: { student: true },
    });

    if (invoice.status === InvoiceStatus.PAID) {
      throw new FinanceRefusal("Invoice is already fully paid");
    }
    if (invoice.status === InvoiceStatus.WAIVED) {
      throw new FinanceRefusal("Invoice has been waived");
    }

    const balanceDue = invoice.totalAmount.sub(invoice.amountPaid);
    const amountToPay = amountInNaira ? toDecimal(amountInNaira) : balanceDue;

    if (amountToPay.lte(0)) {
      throw new FinanceRefusal("Payment amount must be greater than zero");
    }
    if (amountToPay.gt(balanceDue)) {
      throw new FinanceRefusal("Payment amount cannot exceed the balance due");
    }

    const amountInKobo = toKobo(amountToPay);
    const reference = generatePaymentReference(PaymentProvider.PAYSTACK);

    // Create PENDING payment row
    const payment = await tx.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: amountToPay,
        provider: PaymentProvider.PAYSTACK,
        providerRef: reference,
        status: PaymentStatus.PENDING,
        verifiedServerSide: false,
        metadata: {
          tenantId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
        },
      },
    });

    const gateway = getPaystackClient();
    const gatewayInit = await gateway.initializePayment({
      email: userEmail,
      amountInKobo,
      reference,
      callbackUrl,
      metadata: {
        tenantId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        studentId: invoice.studentId,
      },
    });

    return {
      paymentId: payment.id,
      reference,
      authorizationUrl: gatewayInit.authorizationUrl,
      accessCode: gatewayInit.accessCode,
      amount: amountToPay.toString(),
    };
  });
}

/**
 * Records a manual payment (Cash, POS, Bank Transfer) by staff.
 */
const RECEIPT_RETRY_LIMIT = 50;

/// The next receipt number for a school and year: `UPDATE ... RETURNING` on the school's counter (the row lock serialises concurrent
/// fulfilments; the allocation is in the caller's transaction, so a rollback gives the number back). A number someone typed by hand earlier
/// is skipped, at most RECEIPT_RETRY_LIMIT times, then the whole payment is refused and rolled back.
async function allocateReceiptNo(tx: Tx, tenantId: string, schoolCode: string, year: number): Promise<string> {
  for (let attempt = 0; attempt < RECEIPT_RETRY_LIMIT; attempt++) {
    const rows = await tx.$queryRaw<{ seq: number }[]>`
      INSERT INTO "ReceiptCounter" ("tenantId", "year", "next") VALUES (${tenantId}, ${year}::int, 2)
      ON CONFLICT ("tenantId", "year") DO UPDATE SET "next" = "ReceiptCounter"."next" + 1
      RETURNING ("next" - 1)::int AS seq`;
    const candidate = generateReceiptNumber(schoolCode, year, rows[0].seq);
    if ((await tx.payment.count({ where: { tenantId, receiptNo: candidate } })) === 0) return candidate;
  }
  throw new FinanceRefusal("Could not allocate a receipt number. Please try again.");
}

export async function recordManualPayment(
  tenantId: VerifiedTenantId,
  schoolCode: string,
  invoiceId: string,
  data: { amount: DecimalLike; channel: string; receiptNo?: string; note?: string },
  actorUserId: string,
) {
  return forTenant(tenantId).transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { tenantId, id: invoiceId },
    });

    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.WAIVED) {
      throw new FinanceRefusal(`Cannot record payment on invoice with status ${invoice.status}`);
    }

    const amountDecimal = toDecimal(data.amount);
    if (amountDecimal.lte(0)) {
      throw new FinanceRefusal("Payment amount must be positive");
    }

    const reference = generatePaymentReference(PaymentProvider.PAYSTACK);
    const year = new Date().getFullYear();
    const supplied = data.receiptNo?.trim();
    if (supplied && (await tx.payment.count({ where: { tenantId, receiptNo: supplied } })) > 0) {
      throw new FinanceConflict("That receipt number is already used.");
    }
    const receiptNo = supplied || (await allocateReceiptNo(tx, tenantId, schoolCode, year));

    const payment = await tx.payment.create({
      data: {
        tenantId,
        invoiceId,
        amount: amountDecimal,
        provider: PaymentProvider.PAYSTACK,
        providerRef: reference,
        status: PaymentStatus.SUCCESS,
        verifiedServerSide: true,
        channel: data.channel,
        paidAt: new Date(),
        receiptNo,
        metadata: { note: data.note, recordedByUserId: actorUserId },
      },
    });

    const newAmountPaid = invoice.amountPaid.add(amountDecimal);
    const newStatus = resolveInvoiceStatus(invoice.totalAmount, newAmountPaid);

    await tx.invoice.update({
      where: { tenantId, id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: "payment.manual_record",
        targetType: "Payment",
        targetId: payment.id,
        afterValue: { invoiceId, amount: amountDecimal.toString(), channel: data.channel, newStatus },
      },
    });

    return { payment, receiptNo: payment.receiptNo, newStatus, newAmountPaid: newAmountPaid.toString() };
  });
}

/**
 * ATOMIC PAYMENT FULFILMENT (Roadmap §1.5 T6 & T10)
 *
 * Requirements:
 * - Server-side gateway verification: verifiedServerSide = true.
 * - Concurrency lock: updateMany with status = PENDING.
 * - Redirect-beats-webhook (or vice versa) resolves to exactly one fulfilment.
 * - Amount mismatch throws.
 * - 20 simultaneous fulfilments resolve to one without double-crediting.
 */
/// A user-facing refusal of a finance action (unpayable invoice, bad amount...): its message is written to be shown, and the routes answer it 400.
export class FinanceRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceRefusal";
  }
}

/// The caller asked for something that clashes with existing data (a supplied receipt number already in use): 409.
export class FinanceConflict extends FinanceRefusal {
  constructor(message: string) {
    super(message);
    this.name = "FinanceConflict";
  }
}

/// "No such invoice / record" - also what a caller who may not see it gets (same answer, so existence is not revealed): 404.
export class FinanceNotFound extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "FinanceNotFound";
  }
}

/// A deliberate refusal to fulfil a payment (amount mismatch, unknown reference, gateway says not successful). Retrying the same delivery
/// can never change the answer, so the webhook records it and answers 200; any OTHER error is treated as transient (plan F2).
export class FulfilmentRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FulfilmentRefusal";
  }
}

export async function fulfillPayment(
  reference: string,
  options?: { expectedAmountKobo?: number; tenantIdOverride?: string },
): Promise<{ success: boolean; alreadyFulfilled: boolean; paymentId: string; invoiceId: string }> {
  const gateway = getPaystackClient();
  const verified = await gateway.verifyTransaction(reference);

  if (verified.status !== "success") {
    throw new FulfilmentRefusal(`Cannot fulfill payment: gateway status is ${verified.status}`);
  }

  if (options?.expectedAmountKobo !== undefined && verified.amountInKobo !== options.expectedAmountKobo) {
    throw new FulfilmentRefusal(
      `Amount mismatch: expected ${options.expectedAmountKobo} kobo but gateway verified ${verified.amountInKobo} kobo`,
    );
  }

  let tenantId: VerifiedTenantId;
  if (options?.tenantIdOverride) {
    tenantId = trustedTenantId(options.tenantIdOverride);
  } else {
    const rawPayment = await prisma.payment.findUnique({
      where: { provider_providerRef: { provider: PaymentProvider.PAYSTACK, providerRef: reference } },
    });
    if (!rawPayment) {
      throw new FulfilmentRefusal(`Payment with reference "${reference}" not found`);
    }
    tenantId = trustedTenantId(rawPayment.tenantId);
  }

  return forTenant(tenantId).transaction(async (tx) => {
    // ATOMIC LOCK: updateMany where status = PENDING
    const lockResult = await tx.payment.updateMany({
      where: {
        tenantId,
        providerRef: reference,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.SUCCESS,
        verifiedServerSide: true,
        paidAt: verified.paidAt ?? new Date(),
        channel: verified.channel ?? "card",
      },
    });

    if (lockResult.count === 0) {
      // Another worker/webhook/callback already won the lock
      const existing = await tx.payment.findFirstOrThrow({
        where: { tenantId, providerRef: reference },
      });
      return {
        success: true,
        alreadyFulfilled: true,
        paymentId: existing.id,
        invoiceId: existing.invoiceId,
      };
    }

    // This thread won the lock
    const payment = await tx.payment.findFirstOrThrow({
      where: { tenantId, providerRef: reference },
      include: { invoice: { include: { tenant: true } } },
    });

    const paymentKobo = toKobo(payment.amount);
    if (paymentKobo !== verified.amountInKobo) {
      throw new FulfilmentRefusal(
        `Amount mismatch: payment record requires ${paymentKobo} kobo but gateway confirmed ${verified.amountInKobo} kobo`,
      );
    }

    const schoolCode = payment.invoice.tenant.code || "SCHOOL";
    const year = new Date().getFullYear();
    const receiptNo = await allocateReceiptNo(tx, tenantId, schoolCode, year);

    await tx.payment.update({
      where: { tenantId, id: payment.id },
      data: { receiptNo },
    });

    const newAmountPaid = payment.invoice.amountPaid.add(payment.amount);
    const newStatus = resolveInvoiceStatus(payment.invoice.totalAmount, newAmountPaid);

    await tx.invoice.update({
      where: { tenantId, id: payment.invoiceId },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: "system.paystack",
        action: "invoice.payment.fulfilled",
        targetType: "Invoice",
        targetId: payment.invoiceId,
        afterValue: {
          paymentId: payment.id,
          amount: payment.amount.toString(),
          receiptNo,
          newStatus,
        },
      },
    });

    return {
      success: true,
      alreadyFulfilled: false,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
    };
  });
}

/**
 * Handles incoming Paystack webhook payload.
 * Always records event in PaymentWebhookEvent, verifies raw body HMAC, and triggers fulfillment.
 * Always returns HTTP 200 equivalent.
 */
export type WebhookOutcome =
  | { status: "processed"; eventId: string; duplicate?: boolean }
  | { status: "ignored"; eventId: string }
  | { status: "invalid_signature"; eventId: string }
  /// A deliberate refusal: recorded on the event row, answered 200 (retrying cannot help).
  | { status: "refused"; eventId: string; error: string }
  /// A transient failure (database, network, gateway down): answered 503 so the provider retries; the event stays unprocessed.
  | { status: "retry"; eventId: string };

export async function processPaystackWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secretKey: string,
): Promise<WebhookOutcome> {
  const rawPayloadHash = computePayloadHash(rawBody);

  let parsed: {
    event?: string;
    data?: {
      id?: number | string;
      reference?: string;
      amount?: number;
      metadata?: { tenantId?: string };
    };
  } = {};
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    // Malformed JSON: no event to process; it can only be ignored (or refused as unsigned below).
  }

  // Derived from the payload itself when the provider names none - never from the clock, so the same body is the same event.
  const eventId = String(parsed?.data?.id || parsed?.data?.reference || `sha256:${rawPayloadHash.slice(0, 32)}`);

  // An unsigned or wrongly signed delivery is not evidence of anything: it writes NOTHING (no ledger row an outsider could fill).
  if (!verifyPaystackSignature(rawBody, signatureHeader, secretKey)) {
    return { status: "invalid_signature", eventId };
  }

  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
  });
  if (existing?.processedAt) {
    return { status: "processed", eventId, duplicate: true };
  }

  // Record the (signed) delivery in the PaymentWebhookEvent ledger.
  await prisma.paymentWebhookEvent.upsert({
    where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
    create: {
      provider: PaymentProvider.PAYSTACK,
      eventId,
      eventType: parsed?.event || null,
      signatureValid: true,
      rawPayloadHash,
      processedAt: null,
    },
    update: { signatureValid: true },
  });

  if (parsed?.event === "charge.success" && parsed?.data?.reference) {
    try {
      const gateway = getPaystackClient();
      if (gateway instanceof MockPaystackGateway) {
        gateway.simulatePaymentCompletion(parsed.data.reference, "success", parsed.data.amount);
      }

      await fulfillPayment(parsed.data.reference, {
        expectedAmountKobo: parsed.data.amount,
        tenantIdOverride: parsed.data.metadata?.tenantId,
      });
    } catch (err) {
      if (err instanceof FulfilmentRefusal) {
        await prisma.paymentWebhookEvent.update({
          where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
          data: { error: err.message.slice(0, 500) },
        });
        return { status: "refused", eventId, error: err.message };
      }
      console.error("[PAYSTACK_WEBHOOK_TRANSIENT]", err);
      return { status: "retry", eventId };
    }

    await prisma.paymentWebhookEvent.update({
      where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
      data: { processedAt: new Date(), error: null },
    });
    return { status: "processed", eventId };
  }

  return { status: "ignored", eventId };
}

/**
 * Applies a discount / waiver to an invoice.
 */
export async function applyInvoiceDiscount(
  tenantId: VerifiedTenantId,
  invoiceId: string,
  data: { amount: DecimalLike; reason: string; mode?: DiscountWorkflowMode },
  actorUserId: string,
) {
  return forTenant(tenantId).transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { tenantId, id: invoiceId },
      include: { discounts: true },
    });

    if (invoice.status === InvoiceStatus.PAID) {
      throw new FinanceRefusal("Cannot apply discount to an already fully paid invoice");
    }

    const discountAmount = toDecimal(data.amount);
    if (discountAmount.lte(0)) {
      throw new FinanceRefusal("Discount amount must be positive");
    }

    // Verify discount does not exceed balance
    const currentBalance = invoice.totalAmount.sub(invoice.amountPaid);
    if (discountAmount.gt(currentBalance)) {
      throw new FinanceRefusal("Discount cannot exceed the outstanding invoice balance");
    }

    const discount = await tx.invoiceDiscount.create({
      data: {
        tenantId,
        invoiceId,
        amount: discountAmount,
        reason: data.reason.trim(),
        mode: data.mode ?? DiscountWorkflowMode.MANUAL_OVERRIDE,
        appliedByUserId: actorUserId,
      },
    });

    // Net invoice total reduces by discount amount
    const newTotal = invoice.totalAmount.sub(discountAmount);
    const newStatus = resolveInvoiceStatus(newTotal, invoice.amountPaid);

    await tx.invoice.update({
      where: { tenantId, id: invoiceId },
      data: {
        totalAmount: newTotal,
        status: newStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: "invoice.discount.apply",
        targetType: "InvoiceDiscount",
        targetId: discount.id,
        afterValue: { invoiceId, amount: discountAmount.toString(), reason: data.reason, newStatus },
      },
    });

    return { discount, newTotal: newTotal.toString(), newStatus };
  });
}
