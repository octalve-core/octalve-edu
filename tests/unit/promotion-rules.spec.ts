import { test, expect } from "@playwright/test";
import {
  campusAdminMayRoll,
  classCalendarProblem,
  computeStudentSessionAverage,
  defaultPromotionSessions,
  evaluatePromotionRecommendation,
  resolveNextClassGroup,
  resolveTargetArm,
  sessionAfter,
  sessionPairProblem,
  validateSessionPromotionEligibility,
} from "../../src/lib/promotion/rules";

// The rules of a promotion (task 0031) as tables: what the rule advises, which class is next, which arm a pupil lands in, which pairs of sessions make a rollover and who may roll which class.

const group = (id: string, sortOrder: number, campusId: string | null = null, name = id, archivedAt: Date | null = null) => ({
  id,
  name,
  sortOrder,
  campusId,
  archivedAt,
});

test.describe("the average and the advice", () => {
  test("the mean of the term averages that exist, to two decimals; none gives null", () => {
    expect(computeStudentSessionAverage([60, 70, 80])).toBe(70);
    expect(computeStudentSessionAverage([60, null, 80])).toBe(70); // a term with no published result is left out, not counted as 0
    expect(computeStudentSessionAverage([33.333, 66.667])).toBe(50);
    expect(computeStudentSessionAverage([null, undefined])).toBeNull();
    expect(computeStudentSessionAverage([])).toBeNull();
    expect(computeStudentSessionAverage([Number.NaN, 40])).toBe(40);
  });

  test("promoted at the pass mark, repeating below it, graduating in the last class, repeating with no result", () => {
    expect(evaluatePromotionRecommendation(50, false).decision).toBe("PROMOTED"); // the pass mark itself passes
    expect(evaluatePromotionRecommendation(49.99, false).decision).toBe("REPEATED");
    expect(evaluatePromotionRecommendation(80, true).decision).toBe("GRADUATED");
    expect(evaluatePromotionRecommendation(20, true).decision).toBe("REPEATED"); // failing the last class does not graduate
    expect(evaluatePromotionRecommendation(null, false).decision).toBe("REPEATED");
    expect(evaluatePromotionRecommendation(null, true).decision).toBe("REPEATED");
    expect(evaluatePromotionRecommendation(45, false, 40).decision).toBe("PROMOTED"); // the school's own pass mark
    expect(evaluatePromotionRecommendation(45, false, 40).reason).toContain("40.0%");
  });
});

test.describe("the next class", () => {
  test("the next rung up; the last rung has none", () => {
    const all = [group("a", 1), group("b", 2), group("c", 3)];
    expect(resolveNextClassGroup(all[0], all)).toMatchObject({ nextClass: { id: "b" }, isTerminalClass: false });
    expect(resolveNextClassGroup(all[1], all).nextClass?.id).toBe("c");
    expect(resolveNextClassGroup(all[2], all)).toEqual({ nextClass: null, isTerminalClass: true });
  });

  test("an archived class is skipped; a gap in the rungs is bridged", () => {
    const all = [group("a", 1), group("b", 2, null, "b", new Date()), group("c", 5)];
    expect(resolveNextClassGroup(all[0], all).nextClass?.id).toBe("c");
  });

  test("two classes on one rung are parallel streams, never each other's next class", () => {
    const all = [group("sciA", 3), group("artB", 3), group("next", 4)];
    expect(resolveNextClassGroup(all[0], all).nextClass?.id).toBe("next");
    expect(resolveNextClassGroup(all[1], all).nextClass?.id).toBe("next");
    const lone = [group("x", 3), group("y", 3)];
    expect(resolveNextClassGroup(lone[0], lone).isTerminalClass).toBe(true);
  });

  test("a campus's class climbs its own campus's ladder and the school's, never another campus's; a school-wide class only the school's", () => {
    const all = [group("n1", 1, "north"), group("n2", 2, "north"), group("s2", 2, "south"), group("w2", 2, null), group("w1", 1, null)];
    expect(resolveNextClassGroup(all[0], all).nextClass?.id).toBe("n2"); // north and school-wide both have rung 2: the campus's own first
    expect(resolveNextClassGroup(all[4], all).nextClass?.id).toBe("w2"); // the school's class never moves into a campus's
    const onlyOther = [group("n1", 1, "north"), group("s2", 2, "south")];
    expect(resolveNextClassGroup(onlyOther[0], onlyOther).isTerminalClass).toBe(true);
  });

  test("a tie on the next rung is settled the same way every time", () => {
    const a = [group("z", 2, null, "Beta"), group("y", 2, null, "Alpha"), group("cur", 1)];
    const b = [...a].reverse();
    expect(resolveNextClassGroup(a[2], a).nextClass?.id).toBe("y");
    expect(resolveNextClassGroup(b[0], b).nextClass?.id).toBe("y");
  });
});

test.describe("the arm", () => {
  const arms = [
    { id: "1", name: "Gold" },
    { id: "2", name: "Blue" },
  ];
  test("the arm with the same name in any case, else the first arm, else none", () => {
    expect(resolveTargetArm("blue ", arms)).toBe("2");
    expect(resolveTargetArm("Red", arms)).toBe("1");
    expect(resolveTargetArm(null, arms)).toBe("1");
    expect(resolveTargetArm("", arms)).toBe("1");
    expect(resolveTargetArm("Gold", [])).toBeNull();
  });
});

test.describe("the last period of the session", () => {
  test("eligible only when the current period is the last", () => {
    expect(
      validateSessionPromotionEligibility([
        { ordinal: 1, isCurrent: false },
        { ordinal: 2, isCurrent: false },
        { ordinal: 3, isCurrent: true },
      ]),
    ).toEqual({ eligible: true, finalPeriodOrdinal: 3 });
    const early = validateSessionPromotionEligibility([
      { ordinal: 1, isCurrent: true },
      { ordinal: 2, isCurrent: false },
    ]);
    expect(early.eligible).toBe(false);
    expect(early.reason).toContain("last period");
    expect(validateSessionPromotionEligibility([{ ordinal: 1, isCurrent: false }]).reason).toContain("No current");
    expect(validateSessionPromotionEligibility([]).reason).toContain("No academic periods");
  });
});

test.describe("sessions", () => {
  const s = (id: string, startDate: string, status = "PLANNED", campusId: string | null = null) => ({ id, startDate, status, campusId });
  const list = [s("y3", "2028-09-01"), s("y2", "2027-09-01", "PLANNED"), s("y1", "2026-09-01", "ACTIVE")];

  test("the session after is the one that begins next in the same calendar", () => {
    expect(sessionAfter(list, "y1")).toBe("y2");
    expect(sessionAfter(list, "y3")).toBe("");
    expect(sessionAfter(list, "nope")).toBe("");
    const mixed = [
      s("w1", "2026-09-01"),
      s("n1", "2026-09-01", "ACTIVE", "north"),
      s("n2", "2027-09-01", "PLANNED", "north"),
      s("w2", "2027-10-01"),
    ];
    expect(sessionAfter(mixed, "n1")).toBe("n2");
    expect(sessionAfter(mixed, "w1")).toBe("w2");
  });

  test("the defaults start on the active session and the one after it, whatever order the list comes in", () => {
    expect(defaultPromotionSessions(list)).toEqual({ sourceId: "y1", targetId: "y2" });
    expect(defaultPromotionSessions([...list].reverse())).toEqual({ sourceId: "y1", targetId: "y2" });
    expect(defaultPromotionSessions([s("a", "2026-01-01"), s("b", "2027-01-01")])).toEqual({ sourceId: "a", targetId: "b" }); // none active: the second newest
    expect(defaultPromotionSessions([s("only", "2026-01-01")])).toEqual({ sourceId: "only", targetId: "" });
    expect(defaultPromotionSessions([])).toEqual({ sourceId: "", targetId: "" });
  });

  test("a pair that cannot be a rollover says why", () => {
    expect(sessionPairProblem(list[2], list[1])).toBeNull();
    expect(sessionPairProblem(list[2], list[2])).toContain("different");
    expect(sessionPairProblem(list[1], list[2])).toContain("begin after");
    expect(sessionPairProblem(s("a", "2026-01-01"), s("b", "2026-01-01"))).toContain("begin after"); // the same day is not later
    expect(sessionPairProblem(s("a", "2026-01-01", "ACTIVE", "north"), s("b", "2027-01-01"))).toContain("same calendar");
    expect(sessionPairProblem(s("a", "2026-01-01", "ACTIVE", "north"), s("b", "2027-01-01", "PLANNED", "south"))).toContain(
      "same calendar",
    );
    expect(sessionPairProblem(s("a", "2026-01-01", "ACTIVE", "north"), s("b", "2027-01-01", "PLANNED", "north"))).toBeNull();
  });
});

test.describe("calendars and campuses", () => {
  test("a class of a campus rolls in the school's sessions or its own campus's, never another's; a school-wide class in any", () => {
    expect(classCalendarProblem("north", null)).toBeNull();
    expect(classCalendarProblem("north", "north")).toBeNull();
    expect(classCalendarProblem("north", "south")).toContain("another campus");
    expect(classCalendarProblem(null, "south")).toBeNull();
    expect(classCalendarProblem(null, null)).toBeNull();
  });

  test("a campus administrator rolls their own campus's classes, or the school's classes inside their own calendar, and nothing else", () => {
    expect(campusAdminMayRoll("north", "north", null)).toBe(true);
    expect(campusAdminMayRoll("north", "north", "north")).toBe(true);
    expect(campusAdminMayRoll("north", "south", null)).toBe(false);
    expect(campusAdminMayRoll("north", null, "north")).toBe(true); // a shared class inside north's own calendar
    expect(campusAdminMayRoll("north", null, null)).toBe(false); // a shared class in the school's calendar moves every campus: the school's administrator
    expect(campusAdminMayRoll("north", null, "south")).toBe(false);
    expect(campusAdminMayRoll(null, "north", null)).toBe(false); // a campus administrator with no campus rolls nothing
  });
});
