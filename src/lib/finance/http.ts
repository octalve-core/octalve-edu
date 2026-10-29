import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { FinanceConflict, FinanceNotFound, FinanceRefusal, FulfilmentRefusal } from "./service";
import { DiscountWorkflowMode } from "@prisma/client";

export const createFeeStructureSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  amount: z.coerce.number().positive("Amount must be positive"),
  periodId: z.string().trim().min(1, "Academic period ID is required"),
  classGroupId: z.string().trim().min(1).nullable().optional(),
});

export const queryFeeStructuresSchema = z.object({
  periodId: z.string().trim().min(1).optional(),
  classGroupId: z.string().trim().min(1).optional(),
});

export const generateInvoicesSchema = z.object({
  periodId: z.string().trim().min(1, "Academic period ID is required"),
  dueDate: z.string().date().optional(),
});

export const queryInvoicesSchema = z.object({
  periodId: z.string().trim().min(1).optional(),
  studentId: z.string().trim().min(1).optional(),
  status: z.enum(["UNPAID", "PARTIALLY_PAID", "PAID", "WAIVED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const initializePaymentSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be positive").optional(),
  channel: z.string().trim().optional(),
});

export const recordManualPaymentSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be positive"),
  channel: z.enum(["cash", "bank_transfer", "pos", "cheque", "other"]).default("cash"),
  receiptNo: z.string().trim().optional(),
  note: z.string().trim().max(255).optional(),
});

export const applyDiscountSchema = z.object({
  amount: z.coerce.number().positive("Discount amount must be positive"),
  reason: z.string().trim().min(2, "Reason is required").max(255),
  mode: z.nativeEnum(DiscountWorkflowMode).default(DiscountWorkflowMode.MANUAL_OVERRIDE),
});

/// The ONE way a finance route turns a thrown error into an answer (plan "Fix design - Phase 1 review findings", F4): a refusal written to be
/// shown is a 400 with its message, a missing record - or one the caller may not see - is the same 404, and anything else is logged and
/// answered with a generic 500. Raw error text (database messages, stack hints) never reaches the client.
export function financeFailure(err: unknown, context: string): Response {
  if (err instanceof FinanceConflict) return fail(err.message, 409, "CONFLICT");
  if (err instanceof FinanceRefusal) return fail(err.message, 400, "REFUSED");
  // a payment the gateway does not confirm (unknown reference, still pending, not successful, amount differs): the message is written for the webhook's log, so it is not shown
  if (err instanceof FulfilmentRefusal) return fail("The payment could not be confirmed.", 400, "REFUSED");
  // a unique-index race on a supplied receipt number
  if ((err as { code?: string } | null)?.code === "P2002") return fail("That receipt number is already used.", 409, "CONFLICT");
  const name = (err as { name?: string; code?: string } | null)?.name;
  const code = (err as { code?: string } | null)?.code;
  if (err instanceof FinanceNotFound || name === "NotFoundError" || code === "P2025") return fail("Not found.", 404, "NOT_FOUND");
  console.error(`[FINANCE_${context}]`, err);
  return fail("Something went wrong. Please try again.", 500, "INTERNAL");
}
