import { expect, test } from "@playwright/test";
import { cleanSectionName, normaliseScopeSet, sameCampus, scopeKey, SECTION_NAME_MAX, type ScopeEntry } from "@/lib/results/section-rules";

// The pure rules of sections and approver scopes (ADR 0018): no database, no server.

test.describe("cleanSectionName", () => {
  test("trims, collapses inner whitespace and keeps what is left", () => {
    expect(cleanSectionName("  Junior   Secondary ")).toBe("Junior Secondary");
    expect(cleanSectionName("JSS")).toBe("JSS");
    expect(cleanSectionName("Prîmary")).toBe("Prîmary");
  });

  test("refuses a name that is blank, not text, or longer than 80 characters; 80 is allowed", () => {
    for (const value of ["", "   ", "\n\t", 7, null, undefined, {}, ["JSS"]]) expect(cleanSectionName(value), String(value)).toBeNull();
    expect(cleanSectionName("x".repeat(SECTION_NAME_MAX))).toBe("x".repeat(SECTION_NAME_MAX));
    expect(cleanSectionName("x".repeat(SECTION_NAME_MAX + 1))).toBeNull();
    expect(cleanSectionName(`${"x ".repeat(40)}y`)).toBeNull(); // 81 characters once the spaces are counted
  });
});

test.describe("normaliseScopeSet", () => {
  const general: ScopeEntry = { kind: "GENERAL" };
  const section = (sectionId: string): ScopeEntry => ({ kind: "SECTION", sectionId });
  const klass = (classGroupId: string): ScopeEntry => ({ kind: "CLASS", classGroupId });

  test("an empty set is a valid set (approves nothing)", () => {
    expect(normaliseScopeSet([])).toEqual({ ok: true, scopes: [] });
  });

  test("a repeated entry is one entry, and the order is fixed: General, sections, classes, each by id", () => {
    const result = normaliseScopeSet([klass("c2"), section("s2"), klass("c1"), section("s1"), section("s2"), klass("c1")]);
    expect(result).toEqual({ ok: true, scopes: [section("s1"), section("s2"), klass("c1"), klass("c2")] });
    expect(normaliseScopeSet([klass("c1"), section("s1")])).toEqual(normaliseScopeSet([section("s1"), klass("c1")])); // the same set in another order is the same set
  });

  test("General alone is fine, even repeated; General with anything else is refused", () => {
    expect(normaliseScopeSet([general, general])).toEqual({ ok: true, scopes: [general] });
    expect(normaliseScopeSet([general, section("s1")])).toEqual({ ok: false, problem: "GENERAL_WITH_OTHERS" });
    expect(normaliseScopeSet([klass("c1"), general])).toEqual({ ok: false, problem: "GENERAL_WITH_OTHERS" });
  });

  test("scopeKey tells the three kinds and their targets apart", () => {
    const keys = [general, section("x"), klass("x"), section("y")].map(scopeKey);
    expect(new Set(keys).size).toBe(4);
  });
});

test("sameCampus: equal campuses match, and no campus matches no campus only", () => {
  expect(sameCampus("a", "a")).toBe(true);
  expect(sameCampus("a", "b")).toBe(false);
  expect(sameCampus(null, null)).toBe(true);
  expect(sameCampus("a", null)).toBe(false);
  expect(sameCampus(null, "a")).toBe(false);
});
