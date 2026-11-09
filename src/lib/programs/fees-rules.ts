import type { PlaceState } from "./people-rules";

// Programs, slice P4: the pure rules of fees (task 0027, section 11). No database, no clock. Money is handled in whole kobo (cents) here so no rounding surprise can creep in.

export const MAX_FEE_ITEMS = 200;
export const MAX_FEE_NAME = 80;
export const MIN_FEE_AMOUNT = 0.01;
export const MAX_FEE_AMOUNT = 10_000_000;
export const MAX_EXEMPT = 1000;
export const MAX_DISCOUNT_REASON = 500;

export const FEE_FREQUENCIES = ["ONCE", "MONTHLY", "YEARLY"] as const;
export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];
export const BILLED_TO = ["PARTICIPANT", "GUARDIAN"] as const;
export type BilledTo = (typeof BILLED_TO)[number];

/// Whole cents of a naira amount (two decimals at most): 12.34 -> 1234.
export const toCents = (naira: number): number => Math.round(naira * 100 + 1e-7);
export const fromCents = (cents: number): number => cents / 100;

/// The fee after a percentage off, rounded half up to the cent.
export const netCents = (amountCents: number, discountPercent: number | null): number =>
  discountPercent === null || discountPercent === 0 ? amountCents : Math.round(amountCents * (1 - discountPercent / 100) + 1e-7);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Periods

const PERIOD = /^(once|\d{4}|\d{4}-(0[1-9]|1[0-2]))$/;
export const periodKeyProblem = (key: string): string | null =>
  PERIOD.test(key) ? null : "A period is `once`, a year such as 2026, or a month such as 2026-11.";

/// Which fees a period key is for: `once` the one-off fees, a year the yearly ones, a month the monthly ones.
export function frequencyOfKey(key: string): FeeFrequency {
  if (key === "once") return "ONCE";
  return key.length === 4 ? "YEARLY" : "MONTHLY";
}

/// The key of the period a day falls in, for a frequency.
export function periodKeyFor(frequency: FeeFrequency, day: string): string {
  return frequency === "ONCE" ? "once" : frequency === "YEARLY" ? day.slice(0, 4) : day.slice(0, 7);
}

/// The due date of an invoice for a period: the due day of the month (of January for a yearly fee); none for a one-off fee or without a due day.
export function dueDateFor(dueDay: number | null, key: string): string | null {
  if (dueDay === null || key === "once") return null;
  const month = key.length === 4 ? `${key}-01` : key;
  return `${month}-${String(dueDay).padStart(2, "0")}`;
}

/// PINV-2026-0001
export const programInvoiceNo = (year: number, seq: number): string => `PINV-${year}-${String(seq).padStart(4, "0")}`;

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Who an item is for

export type Audience = { kinds?: string[]; campusIds?: string[]; groupIds?: string[] };

/// Reads the stored audience, keeping only well-formed lists.
export function parseAudience(json: unknown): Audience {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const list = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
  const a = json as Record<string, unknown>;
  return { kinds: list(a.kinds), campusIds: list(a.campusIds), groupIds: list(a.groupIds) };
}

/// Places that are billed: an open place whose person is taking part or is suspended. A suspension does not cancel a fee; a person who has left owes nothing new.
export const billableState = (state: PlaceState): boolean => state === "ACTIVE" || state === "SUSPENDED";

export type FeePerson = { id: string; kind: string; campusId: string | null; groupId: string; state: PlaceState };
export type ApplyContext = {
  /// The people this item does not apply to.
  exempt: ReadonlySet<string>;
  /// The groups of the audience with everything inside them; null = every group.
  groupSet: ReadonlySet<string> | null;
};

/// Whether a fee item applies to a person: the item is active, the person is billable, not exempt, and in the audience (an empty or missing list means everyone).
export function feeApplies(
  item: { status: string; audience: Audience },
  person: FeePerson,
  context: ApplyContext,
): { applies: boolean; why: string | null } {
  if (item.status !== "ACTIVE") return { applies: false, why: "The fee is archived." };
  if (!billableState(person.state)) return { applies: false, why: "Not taking part any more." };
  if (context.exempt.has(person.id)) return { applies: false, why: "Exempt." };
  const { kinds, campusIds } = item.audience;
  if (kinds && kinds.length > 0 && !kinds.includes(person.kind)) return { applies: false, why: "Not for this kind of person." };
  if (campusIds && campusIds.length > 0 && (person.campusId === null || !campusIds.includes(person.campusId)))
    return { applies: false, why: "Not for this campus." };
  if (context.groupSet && !context.groupSet.has(person.groupId)) return { applies: false, why: "Not for this group." };
  return { applies: true, why: null };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Who is billed

export type Contactable = {
  name: string;
  kind: string;
  ownPhone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
};

/// The billing contact snapshot: a fee billed to the PARTICIPANT names them (and a phone if the record has one); billed to the GUARDIAN it needs the guardian's name and phone on the
/// record (a pupil's, a child's), or - for an adult or a guardian, who is their own contact - their own phone. Null when the record cannot say who to ask.
export function billingContact(billedTo: BilledTo, person: Contactable): { name: string; phone: string | null } | null {
  const own = person.kind === "ADULT" || person.kind === "GUARDIAN" || person.kind === "STAFF";
  if (billedTo === "PARTICIPANT") return { name: person.name, phone: person.ownPhone ?? person.guardianPhone ?? null };
  if (own) return person.ownPhone ? { name: person.name, phone: person.ownPhone } : null;
  return person.guardianName && person.guardianPhone ? { name: person.guardianName, phone: person.guardianPhone } : null;
}

export type FeeLine = { itemId: string; name: string; amountCents: number; discountPercent: number | null; netCents: number };

export function lineOf(item: { id: string; name: string; amountCents: number; discountPercent: number | null }): FeeLine {
  return {
    itemId: item.id,
    name: item.name,
    amountCents: item.amountCents,
    discountPercent: item.discountPercent,
    netCents: netCents(item.amountCents, item.discountPercent),
  };
}

export const linesTotal = (lines: readonly FeeLine[]): number => lines.reduce((sum, line) => sum + line.netCents, 0);

/// The total owed after the discounts that were given: lines minus discounts, never below 0.
export const totalAfterDiscounts = (lines: readonly FeeLine[], discountCents: number): number =>
  Math.max(0, linesTotal(lines) - discountCents);

/// The invoice status from what is owed and paid (cents).
export function statusOf(totalCents: number, paidCents: number): "UNPAID" | "PARTIALLY_PAID" | "PAID" {
  if (paidCents >= totalCents) return "PAID";
  return paidCents > 0 ? "PARTIALLY_PAID" : "UNPAID";
}

/// Collected over billed, one decimal; null when nothing was billed.
export const collectionRate = (collectedCents: number, billedCents: number): number | null =>
  billedCents <= 0 ? null : Math.round((collectedCents / billedCents) * 1000 + 1e-9) / 10;
