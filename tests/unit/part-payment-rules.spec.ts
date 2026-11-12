import { test, expect } from "@playwright/test";
import {
  DEFAULT_POLICY,
  checkPart,
  describePolicy,
  effectivePolicy,
  minimumFor,
  parsePolicy,
  policyText,
  tighterThan,
  type PartPaymentPolicy,
} from "@/lib/finance/part-payment";

// Part payment "if allowed" (task 0029): the pure rule and the policy. No database, no server.

const policy = (allowed: boolean, minimum: PartPaymentPolicy["minimum"] = { kind: "NONE" }): PartPaymentPolicy => ({ allowed, minimum });
const check = (amount: number, over: Partial<Parameters<typeof checkPart>[0]> = {}) =>
  checkPart({ total: 100_000, paid: 0, amount, policy: effectivePolicy(undefined, undefined), payInFull: false, ...over });

test.describe("the rule", () => {
  test("by default any amount up to the balance is allowed, which is what the system did before there was a setting", () => {
    expect(effectivePolicy(undefined, undefined)).toEqual({ allowed: true, minimums: [] });
    expect(check(1).ok).toBe(true);
    expect(check(50_000).ok).toBe(true);
    expect(check(100_000).ok).toBe(true);
  });

  test("with part payment off, only the whole balance goes through", () => {
    const off = effectivePolicy(policy(false), undefined);
    expect(check(99_999.99, { policy: off })).toMatchObject({ ok: false, code: "PAY_IN_FULL" });
    expect(check(100_000, { policy: off }).ok).toBe(true);
    // after a part has been paid earlier (when it was allowed), the balance is what has to be paid
    expect(check(10_000, { policy: off, paid: 90_000 }).ok).toBe(true);
    expect(check(5_000, { policy: off, paid: 90_000 })).toMatchObject({ ok: false, code: "PAY_IN_FULL" });
  });

  test("an invoice marked pay-in-full refuses a part even where the policy allows it", () => {
    expect(check(50_000, { payInFull: true })).toMatchObject({ ok: false, code: "PAY_IN_FULL" });
    expect(check(100_000, { payInFull: true }).ok).toBe(true);
  });

  test("a smallest part, as an amount or as a percentage of the invoice", () => {
    const amount = effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), undefined);
    expect(check(4_999.99, { policy: amount })).toMatchObject({ ok: false, code: "BELOW_MINIMUM" });
    expect(check(5_000, { policy: amount }).ok).toBe(true);
    const percent = effectivePolicy(policy(true, { kind: "PERCENT", value: 25 }), undefined);
    expect(check(24_999.99, { policy: percent })).toMatchObject({ ok: false, code: "BELOW_MINIMUM" });
    expect(check(25_000, { policy: percent }).ok).toBe(true);
  });

  test("the payment that settles the balance is always allowed, even below the smallest part", () => {
    const strict = effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), undefined);
    expect(check(3_000, { policy: strict, paid: 97_000 }).ok).toBe(true);
    expect(check(2_999, { policy: strict, paid: 97_000 })).toMatchObject({ ok: false, code: "BELOW_MINIMUM" });
  });

  test("the messages say the amount", () => {
    const strict = effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), undefined);
    const refused = check(1_000, { policy: strict });
    expect(refused.ok === false && refused.message).toContain("5,000");
    const full = check(1_000, { payInFull: true });
    expect(full.ok === false && full.message).toContain("100,000");
  });
});

test.describe("the policy: the school's value is the ceiling", () => {
  test("allowed only if the school AND the campus allow it", () => {
    expect(effectivePolicy(policy(true), policy(true)).allowed).toBe(true);
    expect(effectivePolicy(policy(false), policy(true)).allowed).toBe(false); // a campus can never widen the school's "off"
    expect(effectivePolicy(policy(true), policy(false)).allowed).toBe(false);
    expect(effectivePolicy(undefined, policy(false)).allowed).toBe(false);
  });

  test("the smallest part is the larger of the school's and the campus's, compared on the invoice at hand", () => {
    const both = effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), policy(true, { kind: "PERCENT", value: 10 }));
    expect(minimumFor(both, 100_000).toNumber()).toBe(10_000); // 10% beats 5,000
    expect(minimumFor(both, 20_000).toNumber()).toBe(5_000); // 5,000 beats 10% of 20,000 = 2,000
    const sameKind = effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), policy(true, { kind: "AMOUNT", value: 2_000 }));
    expect(minimumFor(sameKind, 100_000).toNumber()).toBe(5_000); // a looser campus value changes nothing
  });

  test("a percentage is rounded up to the kobo and the smallest part is never more than the invoice", () => {
    expect(minimumFor(effectivePolicy(policy(true, { kind: "PERCENT", value: 33.33 }), undefined), 100.01).toString()).toBe("33.34");
    expect(minimumFor(effectivePolicy(policy(true, { kind: "AMOUNT", value: 9_999 }), undefined), 500).toNumber()).toBe(500);
  });

  test("a stored value that is not exactly a policy is ignored, never trusted", () => {
    expect(parsePolicy({ allowed: true, minimum: { kind: "NONE" } })).toEqual(DEFAULT_POLICY);
    expect(parsePolicy({ allowed: false, minimum: { kind: "AMOUNT", value: 2500.5 } })).toEqual({
      allowed: false,
      minimum: { kind: "AMOUNT", value: 2500.5 },
    });
    expect(parsePolicy({ allowed: true, minimum: { kind: "PERCENT", value: 25 } })).toBeDefined();
    for (const bad of [
      null,
      "off",
      [],
      {},
      { allowed: "yes", minimum: { kind: "NONE" } },
      { allowed: true },
      { allowed: true, minimum: { kind: "AMOUNT" } },
      { allowed: true, minimum: { kind: "AMOUNT", value: 0 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: -5 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: 1.234 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: 1e12 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: Number.NaN } },
      { allowed: true, minimum: { kind: "PERCENT", value: 0 } },
      { allowed: true, minimum: { kind: "PERCENT", value: 101 } },
      { allowed: true, minimum: { kind: "SOMETHING" } },
    ]) {
      expect(parsePolicy(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  test("the sentence for the screens", () => {
    expect(describePolicy(effectivePolicy(undefined, undefined), 100_000, false)).toBe("Part payments are allowed.");
    expect(describePolicy(effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), undefined), 100_000, false)).toContain(
      "at least",
    );
    expect(describePolicy(effectivePolicy(policy(false), undefined), 100_000, false)).toBe("This invoice has to be paid in full.");
    expect(describePolicy(effectivePolicy(undefined, undefined), 100_000, true)).toBe("This invoice has to be paid in full.");
  });
});

test.describe("a campus can only tighten the school's rule", () => {
  test("it may not allow what the school forbids, nor remove or lower the school's smallest part of the same kind", () => {
    expect(tighterThan(policy(false), policy(true))).toMatch(/does not allow part payments/);
    expect(tighterThan(policy(false), policy(false))).toBeNull();
    expect(tighterThan(policy(true), policy(false))).toBeNull(); // forbidding is always tighter
    const school = policy(true, { kind: "AMOUNT", value: 5_000 });
    expect(tighterThan(school, policy(true))).toMatch(/can't remove it/);
    expect(tighterThan(school, policy(false))).toBeNull(); // paying in full is stricter than any smallest part, so a campus may do it even under the school's minimum
    expect(tighterThan(school, policy(true, { kind: "AMOUNT", value: 4_000 }))).toMatch(/only raise it/);
    expect(tighterThan(school, policy(true, { kind: "AMOUNT", value: 5_000 }))).toBeNull();
    expect(tighterThan(school, policy(true, { kind: "AMOUNT", value: 9_000 }))).toBeNull();
    expect(tighterThan(school, policy(true, { kind: "PERCENT", value: 5 }))).toBeNull(); // another kind: compared on the invoice at hand, the larger applies
    expect(tighterThan(policy(true, { kind: "PERCENT", value: 20 }), policy(true, { kind: "PERCENT", value: 10 }))).toMatch(/20%/);
    expect(tighterThan(policy(true), policy(true))).toBeNull();
  });

  test("the sentence for a setting screen names the rule", () => {
    expect(policyText(effectivePolicy(undefined, undefined))).toBe("Part payments are allowed, of any amount.");
    expect(policyText(effectivePolicy(policy(false), undefined))).toBe("Invoices have to be paid in full.");
    expect(policyText(effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), undefined))).toContain("at least ₦5,000");
    expect(policyText(effectivePolicy(policy(true, { kind: "PERCENT", value: 25 }), undefined))).toContain("25% of the invoice");
    const both = policyText(effectivePolicy(policy(true, { kind: "AMOUNT", value: 5_000 }), policy(true, { kind: "PERCENT", value: 10 })));
    expect(both).toContain("₦5,000 or 10% of the invoice");
    expect(both).toContain("whichever is more");
    // two amounts are one (the larger applies); an amount and a percentage stay two
    expect(
      policyText(effectivePolicy(policy(true, { kind: "AMOUNT", value: 2_000 }), policy(true, { kind: "AMOUNT", value: 4_000 }))),
    ).toBe("Part payments are allowed, at least ₦4,000.");
  });
});
