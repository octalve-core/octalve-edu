import "../support/env";
import { test, expect } from "@playwright/test";
import {
  CERT_PLACEHOLDERS,
  certificateSerial,
  fillWording,
  longDate,
  maskName,
  parseSignatories,
  placeCompletable,
  programCompletable,
  unknownPlaceholders,
  wordingProblem,
} from "@/lib/programs/completion-rules";
import { PLACE_STATES } from "@/lib/programs/people-rules";
import { ruleText } from "@/components/programs/completion-model";

// Programs, slice P5 (task 0027, section 12): the pure rules of completing and of the wording of a certificate. No database, no server.

test.describe("completing a program", () => {
  const program = (over = {}) => ({ kind: "FIXED_TERM", status: "ACTIVE", endsOn: "2026-11-10", ...over });

  test("only a fixed-term, active program that has reached its end date; the last day counts", () => {
    expect(programCompletable(program(), "2026-11-10")).toEqual({ ok: true, why: null });
    expect(programCompletable(program(), "2027-01-01").ok).toBe(true);
    expect(programCompletable(program(), "2026-11-09").why).toMatch(/not reached its end date/);
  });

  test("a program that never ends is archived, not completed; a draft, completed or archived one is not completed either", () => {
    expect(programCompletable(program({ kind: "ONGOING", endsOn: null }), "2030-01-01").why).toMatch(/never ends/);
    expect(programCompletable(program({ status: "DRAFT" }), "2027-01-01").why).toMatch(/Only an active program/);
    expect(programCompletable(program({ status: "ARCHIVED" }), "2027-01-01").ok).toBe(false);
    expect(programCompletable(program({ status: "COMPLETED" }), "2027-01-01").why).toMatch(/already completed/);
    expect(programCompletable(program({ endsOn: null }), "2027-01-01").why).toMatch(/no end date/);
  });

  test("a place is completed only while it is open and the person is taking part", () => {
    for (const state of PLACE_STATES) {
      const result = placeCompletable("ACTIVE", state);
      expect(result.ok, state).toBe(state === "ACTIVE");
    }
    expect(placeCompletable("ACTIVE", "SUSPENDED").why).toMatch(/lift the suspension/);
    expect(placeCompletable("WITHDRAWN", "WITHDRAWN").why).toMatch(/not open/);
    expect(placeCompletable("COMPLETED", "COMPLETED").ok).toBe(false);
  });
});

test.describe("the wording", () => {
  test("placeholders are filled in one pass, so what is put in is never read for placeholders again", () => {
    const values = { name: "{school} Pupil", program: "Quran", from: "1 January 2026", to: "1 June 2026", school: "Al Eemaan" };
    expect(fillWording("{name} finished {program} at {school}, {from} to {to}.", values)).toBe(
      "{school} Pupil finished Quran at Al Eemaan, 1 January 2026 to 1 June 2026.",
    );
    expect(fillWording("No placeholders, and {unknown} stays.", values)).toBe("No placeholders, and {unknown} stays.");
    expect(fillWording("{name}{name}", values)).toBe("{school} Pupil{school} Pupil");
  });

  test("a placeholder that is not ours is found, so a typo never reaches a printed certificate", () => {
    expect(CERT_PLACEHOLDERS).toEqual(["name", "program", "from", "to", "school"]);
    expect(unknownPlaceholders("{name} did {program} {nme} {nme} {}")).toEqual(["nme", ""]);
    expect(unknownPlaceholders("plain text")).toEqual([]);
  });

  test("a wording is saved only if it is the right length, uses our placeholders and has at most two signatories", () => {
    const ok = { title: "Certificate", body: "Well done {name}.", signatories: [{ name: "Head", title: "" }] };
    expect(wordingProblem(ok)).toBeNull();
    expect(wordingProblem({ ...ok, title: "" })).toMatch(/title/);
    expect(wordingProblem({ ...ok, title: "t".repeat(81) })).toMatch(/title/);
    expect(wordingProblem({ ...ok, body: "" })).toMatch(/wording/);
    expect(wordingProblem({ ...ok, body: "b".repeat(601) })).toMatch(/wording/);
    expect(wordingProblem({ ...ok, body: "Well done {nme}." })).toMatch(/\{nme\} is not a placeholder/);
    expect(wordingProblem({ ...ok, body: "{a} {b}" })).toMatch(/\{a\}, \{b\} are not placeholders/);
    expect(wordingProblem({ ...ok, signatories: [ok.signatories[0]!, ok.signatories[0]!, ok.signatories[0]!] })).toMatch(/At most 2/);
    expect(wordingProblem({ ...ok, signatories: [{ name: "", title: "x" }] })).toMatch(/signatory/);
    expect(wordingProblem({ ...ok, signatories: [{ name: "n".repeat(61), title: "" }] })).toMatch(/signatory/);
  });

  test("signatories are read back keeping at most two well-formed ones", () => {
    expect(parseSignatories(null)).toEqual([]);
    expect(parseSignatories({})).toEqual([]);
    expect(parseSignatories([{ name: "A", title: "x" }, { name: 5 }, null, { name: "B", title: "y" }, { name: "C", title: "z" }])).toEqual([
      { name: "A", title: "x" },
      { name: "B", title: "y" },
    ]);
  });
});

test.describe("what the public sees of a person", () => {
  test("the first name and the initial of the last, nothing more", () => {
    expect(maskName("Aisha Bello")).toBe("Aisha B.");
    expect(maskName("  Aisha   Bello  ")).toBe("Aisha B.");
    expect(maskName("Aisha Bello Ibrahim")).toBe("Aisha I.");
    expect(maskName("Aisha")).toBe("Aisha");
    expect(maskName("aisha bello")).toBe("aisha B.");
    expect(maskName("Aisha Òkè")).toBe("Aisha Ò.");
    expect(maskName("   ")).toBe("");
    expect(maskName("Aisha Bello")).not.toContain("ello");
  });
});

test.describe("serial numbers and dates", () => {
  test("a serial is padded to four digits", () => {
    expect(certificateSerial(2026, 1)).toBe("CERT-2026-0001");
    expect(certificateSerial(2026, 99_999)).toBe("CERT-2026-99999");
  });

  test("a calendar day is the same day everywhere", () => {
    expect(longDate("2026-11-03")).toBe("3 November 2026");
    expect(longDate("2027-01-01")).toBe("1 January 2027");
    expect(longDate("2028-02-29")).toBe("29 February 2028");
  });
});

test.describe("the completion rule in words", () => {
  test("none, an average, required passes, or both", () => {
    expect(ruleText({ minAverage: null, requirePassed: false })).toMatch(/no completion rule/);
    expect(ruleText({ minAverage: 70, requirePassed: false })).toBe(
      "To be completed without an override a person needs an average of at least 70%.",
    );
    expect(ruleText({ minAverage: null, requirePassed: true })).toBe(
      "To be completed without an override a person needs every required assessment passed.",
    );
    expect(ruleText({ minAverage: 55.5, requirePassed: true })).toBe(
      "To be completed without an override a person needs an average of at least 55.5% and every required assessment passed.",
    );
  });
});
