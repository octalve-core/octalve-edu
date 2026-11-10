import { Prisma } from "@prisma/client";
import { formatNaira, toDecimal, type DecimalLike } from "./rules";

// Part payment "if allowed" (task 0029). The pure rule and the policy: no database, no clock. The default policy is what the system did before there was a setting: any
// amount up to the balance is accepted.

export type Minimum = { kind: "NONE" } | { kind: "AMOUNT"; value: number } | { kind: "PERCENT"; value: number };
export type PartPaymentPolicy = { allowed: boolean; minimum: Minimum };

export const PART_PAYMENT_KEY = "finance.partPayment";
export const DEFAULT_POLICY: PartPaymentPolicy = { allowed: true, minimum: { kind: "NONE" } };

const MAX_AMOUNT = 1_000_000_000;
/// ₦5,000 for a whole amount, ₦1,234.50 otherwise: the sentences read like a person wrote them, and never show a ".00" the school didn't type.
const naira = (value: DecimalLike): string => {
  const whole = toDecimal(value);
  return whole.isInteger() ? formatNaira(whole).replace(/\.00$/, "") : formatNaira(whole);
};
const twoPlaces = (n: number) => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/// A stored policy, or undefined when it is not one. Strict: a value that is not exactly this shape is ignored (the school's value, or the default, applies) and never trusted.
export function parsePolicy(value: unknown): PartPaymentPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.allowed !== "boolean") return undefined;
  const m = raw.minimum;
  if (!m || typeof m !== "object" || Array.isArray(m)) return undefined;
  const min = m as Record<string, unknown>;
  if (min.kind === "NONE") return { allowed: raw.allowed, minimum: { kind: "NONE" } };
  const amount = min.value;
  if (typeof amount !== "number" || !twoPlaces(amount)) return undefined;
  if (min.kind === "AMOUNT" && amount > 0 && amount <= MAX_AMOUNT)
    return { allowed: raw.allowed, minimum: { kind: "AMOUNT", value: amount } };
  if (min.kind === "PERCENT" && amount >= 1 && amount <= 100) return { allowed: raw.allowed, minimum: { kind: "PERCENT", value: amount } };
  return undefined;
}

/// The policy that applies to a campus: the strictest of the school's and the campus's. `allowed` only if both allow it; the smallest part is the LARGER of the two
/// smallest parts for the invoice at hand (an amount and a percentage are only comparable on a total, so both are kept).
export type EffectivePolicy = { allowed: boolean; minimums: Minimum[] };

export function effectivePolicy(school: PartPaymentPolicy | undefined, campus: PartPaymentPolicy | undefined): EffectivePolicy {
  const policies = [school ?? DEFAULT_POLICY, campus ?? DEFAULT_POLICY];
  return { allowed: policies.every((p) => p.allowed), minimums: policies.map((p) => p.minimum).filter((m) => m.kind !== "NONE") };
}

/// The smallest part for an invoice of this total: the larger of every minimum, a percentage rounded UP to the kobo (never above the total).
export function minimumFor(policy: EffectivePolicy, total: DecimalLike): Prisma.Decimal {
  const whole = toDecimal(total);
  let least = new Prisma.Decimal(0);
  for (const m of policy.minimums) {
    const part =
      m.kind === "AMOUNT"
        ? new Prisma.Decimal(m.value)
        : m.kind === "PERCENT"
          ? whole.mul(m.value).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_UP)
          : new Prisma.Decimal(0);
    if (part.gt(least)) least = part;
  }
  return least.gt(whole) ? whole : least;
}

export type PartCheck = { ok: true } | { ok: false; code: "PAY_IN_FULL" | "BELOW_MINIMUM"; message: string };

/// May this amount be paid now? (The caller has already refused zero, negative and more than the balance.) The payment that settles the balance exactly is ALWAYS allowed, so a
/// balance under the smallest part can still be paid; any other payment needs part payment to be allowed on this invoice and to reach the smallest part.
export function checkPart(input: {
  total: DecimalLike;
  paid: DecimalLike;
  amount: DecimalLike;
  policy: EffectivePolicy;
  payInFull: boolean;
}): PartCheck {
  const balance = toDecimal(input.total).sub(toDecimal(input.paid));
  const amount = toDecimal(input.amount);
  if (amount.gte(balance)) return { ok: true };
  if (input.payInFull || !input.policy.allowed) {
    return { ok: false, code: "PAY_IN_FULL", message: `This invoice has to be paid in full (${naira(balance)}).` };
  }
  const least = minimumFor(input.policy, input.total);
  if (amount.lt(least)) return { ok: false, code: "BELOW_MINIMUM", message: `The smallest part you can pay is ${naira(least)}.` };
  return { ok: true };
}

/// A sentence for a setting screen, where there is no invoice yet: what the rule is. An amount and a percentage are both named, and the larger applies on the invoice at hand.
export function policyText(policy: EffectivePolicy): string {
  if (!policy.allowed) return "Invoices have to be paid in full.";
  // Two amounts (or two percentages) are one: the larger applies. An amount and a percentage stay two, since which is larger depends on the invoice.
  const largest = (kind: "AMOUNT" | "PERCENT") => {
    const values = policy.minimums.flatMap((m) => (m.kind === kind ? [m.value] : []));
    return values.length > 0 ? Math.max(...values) : null;
  };
  const amount = largest("AMOUNT");
  const percent = largest("PERCENT");
  const parts = [...(amount !== null ? [naira(amount)] : []), ...(percent !== null ? [`${percent}% of the invoice`] : [])];
  if (parts.length === 0) return "Part payments are allowed, of any amount.";
  return `Part payments are allowed, at least ${parts.join(" or ")}${parts.length > 1 ? ", whichever is more" : ""}.`;
}

/// Is `next` at least as strict as `school`? A campus may only tighten (task 0029, 3.2). Compared kind by kind: an amount and a percentage cannot be compared without an invoice,
/// so a campus may name a different kind, but it may not allow what the school forbids, nor go under the school's smallest part of the same kind, nor drop it.
export function tighterThan(school: PartPaymentPolicy, next: PartPaymentPolicy): string | null {
  if (next.allowed && !school.allowed) return "The school does not allow part payments, so a campus can't allow them.";
  if (!next.allowed) return null; // paying in full is stricter than any smallest part
  if (school.minimum.kind === "NONE") return null;
  if (next.minimum.kind === "NONE") return "The school has a smallest part, so a campus can't remove it.";
  if (next.minimum.kind === school.minimum.kind && next.minimum.value < school.minimum.value) {
    return `The school's smallest part is ${school.minimum.kind === "AMOUNT" ? naira(school.minimum.value) : `${school.minimum.value}%`}; a campus can only raise it.`;
  }
  return null;
}

/// A sentence for the screens: what is allowed on an invoice of this total.
export function describePolicy(policy: EffectivePolicy, total: DecimalLike, payInFull: boolean): string {
  if (payInFull || !policy.allowed) return "This invoice has to be paid in full.";
  const least = minimumFor(policy, total);
  return least.gt(0) ? `Part payments are allowed, at least ${naira(least)}.` : "Part payments are allowed.";
}
