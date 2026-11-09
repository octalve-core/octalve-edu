// How money is written on a screen. Kept apart from `rules.ts` on purpose: that file imports Node's crypto and the Prisma runtime, which a component that runs in the browser must never
// pull in (the Prisma runtime evaluates code at load, which the page's Content-Security-Policy refuses: every page that mounted a finance component reported a violation). Pure: no
// database, no server module.

/// A plain number, a number written as text, or anything that can say its value as a number (a Prisma Decimal does).
export type MoneyLike = number | string | { toNumber(): number };

/**
 * Formats Naira currency representation with thousand separators.
 * E.g. "₦125,000.00"
 */
export function formatNaira(naira: MoneyLike): string {
  const num = typeof naira === "number" ? naira : typeof naira === "string" ? Number(naira) : naira.toNumber();
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
