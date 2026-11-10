import { test, expect } from "@playwright/test";
import { placeFits } from "@/lib/programs/access";
import {
  addMonths,
  buildTree,
  cleanName,
  endDateFor,
  groupPath,
  isEditableStatus,
  parseIsoDate,
  sameName,
  statusAfter,
  toIsoDate,
} from "@/lib/programs/rules";
import {
  createGroupSchema,
  createProgramSchema,
  levelLabelsSchema,
  updateGroupSchema,
  updateProgramSchema,
} from "@/lib/programs/validation";

// Programs, slice P1 (task 0027): the pure rules and the request shapes. No server, no database.

const day = (iso: string) => parseIsoDate(iso)!;

test.describe("names", () => {
  test("a name is trimmed and its inner white space collapsed; two names differing only in case or spacing are the same", () => {
    expect(cleanName("  Juz   Amma  ")).toBe("Juz Amma");
    expect(sameName("Juz Amma", "  juz   AMMA ")).toBe(true);
    expect(sameName("Juz Amma", "Juz Ammaa")).toBe(false);
  });
});

test.describe("dates", () => {
  test("only a real calendar day is a date", () => {
    expect(toIsoDate(day("2026-11-03"))).toBe("2026-11-03");
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "soon", "2026-1-1", "2026-11-03T00:00:00Z", ""])
      expect(parseIsoDate(bad), bad).toBeNull();
  });

  test("a month later keeps the month end: 31 August plus six months is 28 February (29 in a leap year)", () => {
    expect(toIsoDate(addMonths(day("2026-08-31"), 6))).toBe("2027-02-28");
    expect(toIsoDate(addMonths(day("2027-08-31"), 6))).toBe("2028-02-29");
    expect(toIsoDate(addMonths(day("2026-11-30"), 3))).toBe("2027-02-28");
  });

  test("a fixed-term program ends on its LAST day: the start plus the duration, minus one day", () => {
    expect(toIsoDate(endDateFor(day("2026-11-03"), { value: 6, unit: "MONTHS" }))).toBe("2027-05-02");
    expect(toIsoDate(endDateFor(day("2026-09-01"), { value: 3, unit: "YEARS" }))).toBe("2029-08-31");
    expect(toIsoDate(endDateFor(day("2026-01-01"), { value: 1, unit: "YEARS" }))).toBe("2026-12-31");
  });
});

test.describe("groups", () => {
  const groups = [
    { id: "a", parentId: null, name: "JSS 2", sortOrder: 1 },
    { id: "b", parentId: "a", name: "C", sortOrder: 0 },
    { id: "c", parentId: null, name: "JSS 1", sortOrder: 0 },
    { id: "d", parentId: "a", name: "A", sortOrder: 0 },
  ];

  test("the path of a group runs from the top with an en dash, and a broken or looping chain is shown by what could be followed", () => {
    expect(groupPath(groups, "b")).toBe("JSS 2–C");
    expect(groupPath(groups, "c")).toBe("JSS 1");
    expect(
      groupPath(
        [
          { id: "x", parentId: "y", name: "X" },
          { id: "y", parentId: "x", name: "Y" },
        ],
        "x",
      ),
    ).toBe("Y–X"); // a loop ends, never hangs
    expect(groupPath(groups, "missing")).toBe("");
  });

  test("the tree orders siblings by their place, then by name, and keeps a group whose parent is missing as a top-level one", () => {
    const tree = buildTree([...groups, { id: "z", parentId: "gone", name: "Orphan", sortOrder: 5 }]);
    expect(tree.map((node) => node.name)).toEqual(["JSS 1", "JSS 2", "Orphan"]);
    expect(tree[1]!.children.map((node) => node.name)).toEqual(["A", "C"]);
  });
});

test.describe("status", () => {
  test("a draft is activated, a draft or active program is archived, an archived one is restored as a draft; nothing else applies", () => {
    expect(statusAfter("activate", "DRAFT")).toBe("ACTIVE");
    expect(statusAfter("activate", "ACTIVE")).toBeNull();
    expect(statusAfter("archive", "DRAFT")).toBe("ARCHIVED");
    expect(statusAfter("archive", "ACTIVE")).toBe("ARCHIVED");
    expect(statusAfter("archive", "ARCHIVED")).toBeNull();
    expect(statusAfter("archive", "COMPLETED")).toBeNull();
    expect(statusAfter("restore", "ARCHIVED")).toBe("DRAFT");
    expect(statusAfter("restore", "COMPLETED")).toBeNull();
  });

  test("only a draft or active program can be changed", () => {
    expect(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"].map((s) => isEditableStatus(s as "DRAFT"))).toEqual([true, true, false, false]);
  });
});

test.describe("who a program takes", () => {
  test("a school-wide program takes any staff member; one in campuses takes those of the whole school or of one of its campuses", () => {
    expect(placeFits([], "north")).toBe(true);
    expect(placeFits([], null)).toBe(true);
    expect(placeFits(["north", "south"], "north")).toBe(true);
    expect(placeFits(["north", "south"], null)).toBe(true);
    expect(placeFits(["north"], "south")).toBe(false);
  });
});

test.describe("the request shapes", () => {
  const base = { name: "Hifz", kind: "ONGOING", levelLabels: ["Section"] };

  test("level names: one to four, each different, each trimmed", () => {
    expect(levelLabelsSchema.safeParse(["Section", " Class "]).data).toEqual(["Section", "Class"]);
    expect(levelLabelsSchema.safeParse([]).success).toBe(false);
    expect(levelLabelsSchema.safeParse(["a", "b", "c", "d", "e"]).success).toBe(false);
    expect(levelLabelsSchema.safeParse(["Class", "class"]).success).toBe(false);
    expect(levelLabelsSchema.safeParse(["Cla\u0000ss"]).success).toBe(false);
  });

  test("a program that never ends has no end date or duration; a fixed-term one has a start and either an end or a duration, not both", () => {
    expect(createProgramSchema.safeParse(base).success).toBe(true);
    expect(createProgramSchema.safeParse({ ...base, endsOn: "2027-01-01" }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, duration: { value: 6, unit: "MONTHS" } }).success).toBe(false);
    const fixed = { ...base, kind: "FIXED_TERM" };
    expect(createProgramSchema.safeParse(fixed).success).toBe(false); // no start
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03" }).success).toBe(false); // no end, no duration
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", duration: { value: 6, unit: "MONTHS" } }).success).toBe(true);
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", endsOn: "2027-05-02" }).success).toBe(true);
    expect(
      createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", endsOn: "2027-05-02", duration: { value: 6, unit: "MONTHS" } })
        .success,
    ).toBe(false);
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-11-03", endsOn: "2026-11-03" }).success).toBe(false); // not after the start
    expect(createProgramSchema.safeParse({ ...fixed, startsOn: "2026-02-30", duration: { value: 6, unit: "MONTHS" } }).success).toBe(false);
  });

  test("campuses are listed once; the body is strict (an unknown key is refused); the name is required and bounded", () => {
    expect(createProgramSchema.safeParse({ ...base, campusIds: ["a", "a"] }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, campusIds: ["a", "b"] }).success).toBe(true);
    expect(createProgramSchema.safeParse({ ...base, campusIds: [] }).data?.campusIds).toEqual([]); // school-wide
    expect(createProgramSchema.safeParse({ ...base, surprise: true }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(createProgramSchema.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
  });

  test("an update changes something and nothing it should not; a group change is exactly one of a name, a move, or archived", () => {
    expect(updateProgramSchema.safeParse({}).success).toBe(false);
    expect(updateProgramSchema.safeParse({ name: "New" }).success).toBe(true);
    expect(updateProgramSchema.safeParse({ kind: "ONGOING" }).success).toBe(false);
    expect(updateGroupSchema.safeParse({ name: "B" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ move: "up" }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ move: "sideways" }).success).toBe(false);
    expect(updateGroupSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ name: "B", archived: true }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "A", parentId: null }).success).toBe(true);
    expect(createGroupSchema.safeParse({ name: "A", parentId: "../x" }).success).toBe(false);
  });
});
