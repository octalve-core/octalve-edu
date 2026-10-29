import { expect, test } from "@playwright/test";
import type { ClassGroupView, ScopeView, SectionView } from "@/lib/results/approver-settings";
import {
  describeScope,
  describeScopes,
  fitsCampus,
  heldEntries,
  placementTargets,
  roleLabel,
  sameEntries,
  scopeEntries,
} from "@/lib/results/approver-view";
import { normaliseScopeSet } from "@/lib/results/section-rules";

// What the Results approval tab decides without a browser (ADR 0018, task 0020 slice 3): no database, no server.

const section = (id: string, campusId: string | null, archived = false): SectionView => ({
  id,
  name: id.toUpperCase(),
  campusId,
  campusName: campusId,
  sortOrder: 0,
  archived,
  classGroups: [],
});
const group = (id: string, campusId: string | null, sectionId: string | null = null): ClassGroupView => ({
  id,
  name: id,
  campusId,
  sectionId,
});
const scope = (kind: ScopeView["kind"], extra: Partial<ScopeView> = {}): ScopeView => ({
  kind,
  sectionId: null,
  sectionName: null,
  classGroupId: null,
  classGroupName: null,
  ...extra,
});

test.describe("fitsCampus", () => {
  test("a person with no campus fits everything; an item with no campus fits everybody; otherwise the campuses must be the same", () => {
    const table: [string | null, string | null, boolean][] = [
      [null, null, true],
      [null, "north", true],
      ["north", null, true],
      ["north", "north", true],
      ["north", "south", false],
    ];
    for (const [person, item, expected] of table) expect(fitsCampus(person, item), `${person} / ${item}`).toBe(expected);
  });
});

test.describe("placementTargets", () => {
  const sections = [section("jss", "north"), section("sss", "south"), section("any", null), section("old", "north", true)];

  test("only live sections of the class's own campus, and never the one it is already in", () => {
    expect(placementTargets(group("jss1", "north"), sections).map((s) => s.id)).toEqual(["jss"]);
    expect(placementTargets(group("sss1", "south"), sections).map((s) => s.id)).toEqual(["sss"]);
    expect(placementTargets(group("jss1", "north", "jss"), sections)).toEqual([]);
  });

  test("a class with no campus is offered only the sections with no campus", () => {
    expect(placementTargets(group("wide", null), sections).map((s) => s.id)).toEqual(["any"]);
  });
});

test.describe("scope words", () => {
  test("each kind has its words, and no scope at all is Nothing (fail closed)", () => {
    expect(describeScope(scope("GENERAL"))).toBe("Everything");
    expect(describeScope(scope("SECTION", { sectionId: "s", sectionName: "JSS" }))).toBe("Section: JSS");
    expect(describeScope(scope("CLASS", { classGroupId: "c", classGroupName: "JSS 2" }))).toBe("Class: JSS 2");
    expect(describeScopes([])).toBe("Nothing");
    expect(
      describeScopes([
        scope("SECTION", { sectionId: "s", sectionName: "JSS" }),
        scope("CLASS", { classGroupId: "c", classGroupName: "SSS 1" }),
      ]),
    ).toBe("Section: JSS, Class: SSS 1");
  });
});

test.describe("scope entries", () => {
  test("General stands alone; otherwise sections then classes, each by id, and the result is one the server accepts", () => {
    expect(scopeEntries(true, ["b", "a"], ["z"])).toEqual([{ kind: "GENERAL" }]);
    const entries = scopeEntries(false, ["b", "a"], ["z", "y"]);
    expect(entries).toEqual([
      { kind: "SECTION", sectionId: "a" },
      { kind: "SECTION", sectionId: "b" },
      { kind: "CLASS", classGroupId: "y" },
      { kind: "CLASS", classGroupId: "z" },
    ]);
    expect(normaliseScopeSet(entries)).toEqual({ ok: true, scopes: entries });
    expect(scopeEntries(false, [], [])).toEqual([]);
  });

  test("what a person holds now, read back as entries, equals the same selection made in the editor and differs from any other", () => {
    const held = heldEntries([
      scope("CLASS", { classGroupId: "y", classGroupName: "Y" }),
      scope("SECTION", { sectionId: "a", sectionName: "A" }),
    ]);
    expect(sameEntries(held, scopeEntries(false, ["a"], ["y"]))).toBe(true);
    expect(sameEntries(held, scopeEntries(false, ["a"], []))).toBe(false);
    expect(sameEntries(held, scopeEntries(true, [], []))).toBe(false);
    expect(sameEntries(heldEntries([]), scopeEntries(false, [], []))).toBe(true);
  });
});

test("roleLabel reads a role as a person would say it", () => {
  expect(roleLabel("TEACHING_STAFF")).toBe("Teaching staff");
  expect(roleLabel("ADMIN")).toBe("Admin");
});
