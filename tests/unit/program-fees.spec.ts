import "../support/env";
import { test, expect } from "@playwright/test";
import {
  billableState,
  billingContact,
  collectionRate,
  dueDateFor,
  feeApplies,
  frequencyOfKey,
  fromCents,
  lineOf,
  linesTotal,
  netCents,
  parseAudience,
  periodKeyFor,
  periodKeyProblem,
  programInvoiceNo,
  statusOf,
  toCents,
  totalAfterDiscounts,
  type FeePerson,
} from "@/lib/programs/fees-rules";
import { PLACE_STATES } from "@/lib/programs/people-rules";
import { amountProblem, audienceText, defaultPeriod, parseAmount, periodText } from "@/components/programs/fees-model";

// Programs, slice P4 (task 0027, section 11): the pure rules of fees and the words of the Fees tab. No database, no server.

test.describe("money", () => {
  test("is counted in whole kobo, so nothing drifts", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(10_000_000)).toBe(1_000_000_000);
    expect(toCents(1.005)).toBe(101);
    expect(fromCents(1234)).toBe(12.34);
  });

  test("a percentage off is rounded half up to the cent", () => {
    expect(netCents(10_000, null)).toBe(10_000);
    expect(netCents(10_000, 0)).toBe(10_000);
    expect(netCents(10_000, 10)).toBe(9000);
    expect(netCents(10_000, 100)).toBe(0);
    expect(netCents(999, 50)).toBe(500); // 499.5 rounds up
    expect(netCents(1, 33.33)).toBe(1);
  });

  test("lines add up, discounts come off, and the total never goes below zero", () => {
    const lines = [
      lineOf({ id: "a", name: "A", amountCents: 5000, discountPercent: null }),
      lineOf({ id: "b", name: "B", amountCents: 2000, discountPercent: 50 }),
    ];
    expect(lines[1]).toEqual({ itemId: "b", name: "B", amountCents: 2000, discountPercent: 50, netCents: 1000 });
    expect(linesTotal(lines)).toBe(6000);
    expect(totalAfterDiscounts(lines, 1500)).toBe(4500);
    expect(totalAfterDiscounts(lines, 99_999)).toBe(0);
  });

  test("the status from what is owed and paid", () => {
    expect(statusOf(5000, 0)).toBe("UNPAID");
    expect(statusOf(5000, 1)).toBe("PARTIALLY_PAID");
    expect(statusOf(5000, 4999)).toBe("PARTIALLY_PAID");
    expect(statusOf(5000, 5000)).toBe("PAID");
    expect(statusOf(5000, 6000)).toBe("PAID");
  });

  test("the collection rate, one decimal; nothing billed is no rate", () => {
    expect(collectionRate(7000, 19_000)).toBe(36.8);
    expect(collectionRate(0, 100)).toBe(0);
    expect(collectionRate(100, 100)).toBe(100);
    expect(collectionRate(0, 0)).toBeNull();
  });
});

test.describe("periods", () => {
  test("a key is `once`, a year or a month", () => {
    for (const ok of ["once", "2026", "2026-01", "2026-12"]) expect(periodKeyProblem(ok), ok).toBeNull();
    for (const bad of ["", "Once", "26", "2026-13", "2026-00", "2026-1", "2026-11-03", "monthly", " 2026", "2026 "])
      expect(periodKeyProblem(bad), bad).not.toBeNull();
  });

  test("a key says which fees it is for, and a day says which key it falls in", () => {
    expect(frequencyOfKey("once")).toBe("ONCE");
    expect(frequencyOfKey("2026")).toBe("YEARLY");
    expect(frequencyOfKey("2026-11")).toBe("MONTHLY");
    expect(periodKeyFor("ONCE", "2026-11-04")).toBe("once");
    expect(periodKeyFor("YEARLY", "2026-11-04")).toBe("2026");
    expect(periodKeyFor("MONTHLY", "2026-11-04")).toBe("2026-11");
  });

  test("the due date: the due day of the month (of January for a year); none for a one-off or without a day", () => {
    expect(dueDateFor(10, "2026-11")).toBe("2026-11-10");
    expect(dueDateFor(5, "2026")).toBe("2026-01-05");
    expect(dueDateFor(10, "once")).toBeNull();
    expect(dueDateFor(null, "2026-11")).toBeNull();
  });

  test("invoice numbers are padded to four digits", () => {
    expect(programInvoiceNo(2026, 1)).toBe("PINV-2026-0001");
    expect(programInvoiceNo(2026, 12_345)).toBe("PINV-2026-12345");
  });
});

test.describe("who a fee is for", () => {
  const person = (over: Partial<FeePerson> = {}): FeePerson => ({
    id: "p1",
    kind: "STUDENT",
    campusId: "A",
    groupId: "g1",
    state: "ACTIVE",
    ...over,
  });
  const ctx = (over: { exempt?: string[]; groups?: string[] | null } = {}) => ({
    exempt: new Set(over.exempt ?? []),
    groupSet: over.groups === undefined || over.groups === null ? null : new Set(over.groups),
  });
  const item = (audience = {}, status = "ACTIVE") => ({ status, audience });

  test("an empty audience is everyone who is billed", () => {
    expect(feeApplies(item(), person(), ctx())).toEqual({ applies: true, why: null });
    expect(feeApplies(item({ kinds: [], campusIds: [], groupIds: [] }), person(), ctx()).applies).toBe(true);
  });

  test("an archived fee applies to no one; neither does an exempt person", () => {
    expect(feeApplies(item({}, "ARCHIVED"), person(), ctx())).toEqual({ applies: false, why: "The fee is archived." });
    expect(feeApplies(item(), person(), ctx({ exempt: ["p1"] }))).toEqual({ applies: false, why: "Exempt." });
    expect(feeApplies(item(), person(), ctx({ exempt: ["p2"] })).applies).toBe(true);
  });

  test("kind, campus and group each narrow it, and all must hold", () => {
    expect(feeApplies(item({ kinds: ["ADULT"] }), person(), ctx()).applies).toBe(false);
    expect(feeApplies(item({ kinds: ["ADULT", "STUDENT"] }), person(), ctx()).applies).toBe(true);
    expect(feeApplies(item({ campusIds: ["B"] }), person(), ctx()).applies).toBe(false);
    expect(feeApplies(item({ campusIds: ["A", "B"] }), person(), ctx()).applies).toBe(true);
    expect(feeApplies(item({ groupIds: ["g1"] }), person(), ctx({ groups: ["g1", "g1a"] })).applies).toBe(true);
    expect(feeApplies(item({ groupIds: ["g2"] }), person(), ctx({ groups: ["g2"] })).applies).toBe(false);
    expect(feeApplies(item({ kinds: ["STUDENT"], campusIds: ["A"], groupIds: ["g1"] }), person(), ctx({ groups: ["g1"] })).applies).toBe(
      true,
    );
    expect(
      feeApplies(item({ kinds: ["STUDENT"], campusIds: ["A"], groupIds: ["g1"] }), person({ campusId: "B" }), ctx({ groups: ["g1"] }))
        .applies,
    ).toBe(false);
  });

  test("a suspension does not cancel a fee; a person who has left owes nothing new", () => {
    const billed = PLACE_STATES.filter((state) => billableState(state));
    expect(billed).toEqual(["ACTIVE", "SUSPENDED"]);
    for (const state of PLACE_STATES)
      expect(feeApplies(item(), person({ state }), ctx()).applies, state).toBe(state === "ACTIVE" || state === "SUSPENDED");
  });

  test("a stored audience is read back keeping only well-formed lists", () => {
    expect(parseAudience(null)).toEqual({});
    expect(parseAudience([])).toEqual({});
    expect(parseAudience({ kinds: ["ADULT", 5], campusIds: "A", groupIds: ["g"] })).toEqual({
      kinds: ["ADULT"],
      campusIds: undefined,
      groupIds: ["g"],
    });
  });
});

test.describe("who is billed", () => {
  const who = (over = {}) => ({
    name: "Amina Pupil",
    kind: "STUDENT",
    ownPhone: null as string | null,
    guardianName: "Mrs Pupil" as string | null,
    guardianPhone: "0801" as string | null,
    ...over,
  });

  test("a fee billed to the person names them, with the phone on the record (a pupil's is the guardian's)", () => {
    expect(billingContact("PARTICIPANT", who())).toEqual({ name: "Amina Pupil", phone: "0801" });
    expect(billingContact("PARTICIPANT", who({ ownPhone: "0802" }))).toEqual({ name: "Amina Pupil", phone: "0802" });
    expect(billingContact("PARTICIPANT", who({ guardianPhone: null }))).toEqual({ name: "Amina Pupil", phone: null });
  });

  test("a fee billed to the guardian needs the guardian's name and phone; an adult, a guardian and a member of staff are their own contact", () => {
    expect(billingContact("GUARDIAN", who())).toEqual({ name: "Mrs Pupil", phone: "0801" });
    expect(billingContact("GUARDIAN", who({ guardianPhone: null }))).toBeNull();
    expect(billingContact("GUARDIAN", who({ guardianName: null }))).toBeNull();
    expect(billingContact("GUARDIAN", who({ guardianName: "", guardianPhone: "" }))).toBeNull();
    expect(billingContact("GUARDIAN", who({ kind: "CHILD" }))).toEqual({ name: "Mrs Pupil", phone: "0801" });
    for (const kind of ["ADULT", "GUARDIAN", "STAFF"]) {
      expect(billingContact("GUARDIAN", who({ kind, ownPhone: "0803" })), kind).toEqual({ name: "Amina Pupil", phone: "0803" });
      expect(billingContact("GUARDIAN", who({ kind })), kind).toBeNull();
    }
  });
});

test.describe("the Fees tab", () => {
  test("the words of a period", () => {
    expect(periodText("once")).toBe("One-off");
    expect(periodText("2026")).toBe("2026");
    expect(periodText("2026-11")).toBe("November 2026");
    expect(defaultPeriod("ONCE", "2026-11-04")).toBe("once");
    expect(defaultPeriod("MONTHLY", "2026-11-04")).toBe("2026-11");
    expect(defaultPeriod("YEARLY", "2026-11-04")).toBe("2026");
  });

  test("who a fee is for, in a sentence", () => {
    const names = { campuses: new Map([["A", "Primary"]]), groups: new Map([["g1", "Juz A"]]) };
    expect(audienceText({}, names)).toBe("Everyone");
    expect(audienceText({ kinds: [], groupIds: [] }, names)).toBe("Everyone");
    expect(audienceText({ kinds: ["STUDENT"], campusIds: ["A"], groupIds: ["g1", "gone"] }, names)).toBe(
      "Pupil in Primary in Juz A, a group",
    );
  });

  test("an amount typed for a payment or a discount", () => {
    expect(amountProblem("100")).toBeNull();
    expect(amountProblem("100,5")).toBeNull();
    expect(amountProblem(" 12.34 ")).toBeNull();
    expect(amountProblem("0")).toMatch(/more than zero/);
    expect(amountProblem("0.00")).toMatch(/more than zero/);
    for (const bad of ["", "abc", "1.234", "-5", "1e3", ".5"]) expect(amountProblem(bad), bad).toMatch(/at most two decimals/);
    expect(amountProblem("500", 400)).toMatch(/more than is owed/);
    expect(amountProblem("400", 400)).toBeNull();
    expect(parseAmount(" 12,50 ")).toBe(12.5);
  });
});
