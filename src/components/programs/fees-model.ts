import type { Audience } from "@/lib/programs/fees-rules";
import { KIND_TEXT } from "@/components/programs/people-model";

// The words and the small decisions of the Fees tab (task 0027, slice P4). Pure, so each is unit-tested without a browser. Presentation only: the API decides who sees which money.

export const STATUS_TEXT: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  WAIVED: "Waived",
  CANCELLED: "Cancelled",
};

/// The pill of each invoice status; unpaid uses the danger tokens (the contrast the school's own finance screens were fixed to).
export const STATUS_STYLE: Record<string, string> = {
  UNPAID: "border-danger-line bg-danger-bg text-danger-fg",
  PARTIALLY_PAID: "border-warn-line bg-warn-bg text-warn-fg",
  PAID: "border-ok-line bg-ok-bg text-ok-fg",
  WAIVED: "border-line-strong bg-surface-2 text-fg-2",
  CANCELLED: "border-line-strong bg-surface-2 text-fg-2",
};

export const FREQUENCY_TEXT: Record<string, string> = { ONCE: "Once", MONTHLY: "Every month", YEARLY: "Every year" };
export const BILLED_TO_TEXT: Record<string, string> = { PARTICIPANT: "The person", GUARDIAN: "Their guardian" };
export const CHANNELS = ["cash", "bank transfer", "pos", "cheque"] as const;

/// The period an invoice run is for, from what the person chose and today: `once`, this year, or this month.
export function defaultPeriod(frequency: "ONCE" | "MONTHLY" | "YEARLY", today: string): string {
  return frequency === "ONCE" ? "once" : frequency === "YEARLY" ? today.slice(0, 4) : today.slice(0, 7);
}

/// "2026-11" -> "November 2026", "2026" -> "2026", "once" -> "One-off".
export function periodText(key: string): string {
  if (key === "once") return "One-off";
  if (key.length === 4) return key;
  const [year, month] = key.split("-");
  return new Date(`${year}-${month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/// Who a fee is for, in a sentence: "Everyone", or the kinds, campuses and groups it is limited to.
export function audienceText(audience: Audience, names: { campuses: Map<string, string>; groups: Map<string, string> }): string {
  const parts: string[] = [];
  if (audience.kinds && audience.kinds.length > 0)
    parts.push(audience.kinds.map((k) => KIND_TEXT[k as keyof typeof KIND_TEXT] ?? k).join(", "));
  if (audience.campusIds && audience.campusIds.length > 0)
    parts.push(`in ${audience.campusIds.map((id) => names.campuses.get(id) ?? "a campus").join(", ")}`);
  if (audience.groupIds && audience.groupIds.length > 0)
    parts.push(`in ${audience.groupIds.map((id) => names.groups.get(id) ?? "a group").join(", ")}`);
  return parts.length === 0 ? "Everyone" : parts.join(" ");
}

/// Why an amount typed for a payment or a discount is not usable, or null: a number above zero with at most two decimals.
export function amountProblem(text: string, max?: number): string | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "Enter an amount with at most two decimals.";
  const n = Number(t);
  if (n <= 0) return "The amount must be more than zero.";
  if (max !== undefined && n > max) return "That is more than is owed.";
  return null;
}
export const parseAmount = (text: string): number => Number(text.trim().replace(",", "."));
