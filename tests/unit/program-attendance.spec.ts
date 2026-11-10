import "../support/env";
import { test, expect } from "@playwright/test";
import {
  addMark,
  attendancePercent,
  cleanLabel,
  dayProblem,
  daysBefore,
  emptyCounts,
  isLow,
  mayReadGroup,
  reachOfAccess,
  readsEverything,
  rightsFor,
  addMarks,
  rollEntry,
  type Access,
  type RollPlace,
} from "@/lib/programs/attendance-rules";
import { PLACE_STATES, type PlaceState } from "@/lib/programs/people-rules";

// Programs, slice P3 (task 0027, section 10): the pure rules of attendance. No database, no server.

const TODAY = "2026-11-10";
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const place = (over: Partial<RollPlace> = {}): RollPlace => ({ status: "ACTIVE", joinedOn: d("2026-10-01"), endedOn: null, ...over });

test.describe("which days can be marked, and by whom", () => {
  test("a day that has not come is never markable, by anyone", () => {
    expect(dayProblem("2026-11-11", TODAY, true)).toMatch(/hasn't come/);
    expect(dayProblem("2026-11-11", TODAY, false)).toMatch(/hasn't come/);
    expect(dayProblem("2026-11-10", TODAY, false)).toBeNull();
  });

  test("a teacher or a recorder reaches back 7 days in all; an administrator any day", () => {
    expect(daysBefore(TODAY, 6)).toBe("2026-11-04");
    expect(dayProblem("2026-11-04", TODAY, false)).toBeNull(); // the 7th day counting today
    expect(dayProblem("2026-11-03", TODAY, false)).toMatch(/today and the 6 days before/);
    expect(dayProblem("2026-01-03", TODAY, true)).toBeNull();
  });

  test("a date that is not a real date is refused", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "10/11/2026", "", "2026-11-1"])
      expect(dayProblem(bad, TODAY, true), bad).toMatch(/real date/);
  });

  test("a month and a year boundary are counted in days", () => {
    expect(daysBefore("2026-03-01", 1)).toBe("2026-02-28");
    expect(daysBefore("2028-03-01", 1)).toBe("2028-02-29");
    expect(daysBefore("2027-01-03", 6)).toBe("2026-12-28");
  });
});

test.describe("a session label", () => {
  test("is trimmed and its spaces are made single; empty stays empty", () => {
    expect(cleanLabel("  After   Asr ")).toBe("After Asr");
    expect(cleanLabel("")).toBe("");
    expect(cleanLabel(null)).toBe("");
    expect(cleanLabel(undefined)).toBe("");
  });
});

test.describe("who is on the roll of a day", () => {
  test("someone who joined after the day, or whose place ended before it, is not on it", () => {
    expect(rollEntry(place({ joinedOn: d("2026-11-05") }), "ACTIVE", "2026-11-04", TODAY).listed).toBe(false);
    expect(rollEntry(place({ joinedOn: d("2026-11-05") }), "ACTIVE", "2026-11-05", TODAY).listed).toBe(true); // the day they joined
    const left = place({ status: "WITHDRAWN", endedOn: d("2026-11-06") });
    expect(rollEntry(left, "WITHDRAWN", "2026-11-07", TODAY).listed).toBe(false);
    expect(rollEntry(left, "WITHDRAWN", "2026-11-06", TODAY).listed).toBe(true); // the day they left
    expect(rollEntry(left, "WITHDRAWN", "2026-11-05", TODAY)).toEqual({ listed: true, markable: true, flag: null });
  });

  test("a past day is what happened then: today's standing does not change it", () => {
    for (const state of PLACE_STATES) {
      const entry = rollEntry(place(), state as PlaceState, "2026-11-09", TODAY);
      expect(entry, state).toEqual({ listed: true, markable: true, flag: null });
    }
  });

  test("today: a person taking part is markable; a suspended one is listed with a flag and is not; everyone else is off the roll", () => {
    expect(rollEntry(place(), "ACTIVE", TODAY, TODAY)).toEqual({ listed: true, markable: true, flag: null });
    expect(rollEntry(place(), "SUSPENDED", TODAY, TODAY)).toEqual({ listed: true, markable: false, flag: "SUSPENDED" });
    for (const state of ["EXPELLED", "TERMINATED", "ENDED_BY_SCHOOL"] as const) {
      expect(rollEntry(place(), state, TODAY, TODAY), state).toEqual({ listed: false, markable: false, flag: null });
    }
    expect(rollEntry(place({ status: "WITHDRAWN", endedOn: d(TODAY) }), "WITHDRAWN", TODAY, TODAY).listed).toBe(false);
    expect(rollEntry(place({ status: "COMPLETED", endedOn: d(TODAY) }), "COMPLETED", TODAY, TODAY).listed).toBe(false);
  });
});

test.describe("the percentage", () => {
  const counts = (present: number, late: number, absent: number, excused: number) => ({ present, late, absent, excused });

  test("present and late over the sessions held; excused sessions count on neither side", () => {
    expect(attendancePercent(counts(8, 2, 5, 0))).toBe(67); // 10 of 15
    expect(attendancePercent(counts(8, 2, 5, 50))).toBe(67);
    expect(attendancePercent(counts(10, 0, 0, 0))).toBe(100);
    expect(attendancePercent(counts(0, 0, 4, 0))).toBe(0);
    expect(attendancePercent(counts(1, 0, 1, 0))).toBe(50);
    expect(attendancePercent(counts(1, 1, 1, 0))).toBe(67); // 66.67 rounds up
    expect(attendancePercent(counts(1, 0, 7, 0))).toBe(13); // 12.5 rounds half up
  });

  test("nothing held is no percentage, not 0%", () => {
    expect(attendancePercent(emptyCounts())).toBeNull();
    expect(attendancePercent(counts(0, 0, 0, 3))).toBeNull();
  });

  test("marks are added by status, without changing the counts they came from", () => {
    const start = emptyCounts();
    let next = addMark(start, "PRESENT");
    next = addMark(next, "LATE");
    next = addMark(next, "ABSENT");
    next = addMark(next, "EXCUSED");
    next = addMark(next, "PRESENT");
    expect(next).toEqual({ present: 2, late: 1, absent: 1, excused: 1 });
    expect(start).toEqual(emptyCounts());
  });

  test("a person is flagged only under the threshold, and only when there is a percentage", () => {
    expect(isLow(74, 75)).toBe(true);
    expect(isLow(75, 75)).toBe(false);
    expect(isLow(null, 75)).toBe(false);
    expect(isLow(0, 1)).toBe(true);
  });
});

test.describe("what a person may do on a roll", () => {
  const access = (over: Partial<Access> = {}): Access => ({
    markAll: false,
    supervisor: false,
    groups: new Set(),
    campusIds: null,
    ...over,
  });
  const admin = access({ markAll: true, supervisor: true });
  const teacher = access({ groups: new Set(["juzA", "g1", "g2"]) });
  const supervisor = access({ supervisor: true });
  const branchAdmin = access({ campusIds: ["A"] });
  const nobody = access();

  test("an administrator creates on any past day, and needs a reason to change one older than the window", () => {
    expect(rightsFor(admin, "anything", TODAY, TODAY)).toEqual({ create: true, change: true, reasonOnChange: false });
    expect(rightsFor(admin, "anything", "2026-11-04", TODAY)).toEqual({ create: true, change: true, reasonOnChange: false }); // the 7th day
    expect(rightsFor(admin, "anything", "2026-11-03", TODAY)).toEqual({ create: true, change: true, reasonOnChange: true });
    expect(rightsFor(admin, "anything", "2020-01-01", TODAY)).toEqual({ create: true, change: true, reasonOnChange: true });
  });

  test("a teacher or a recorder: their groups only, today and the 6 days before, and no reason inside the window", () => {
    expect(rightsFor(teacher, "g2", TODAY, TODAY)).toEqual({ create: true, change: true, reasonOnChange: false });
    expect(rightsFor(teacher, "g2", "2026-11-04", TODAY)).toEqual({ create: true, change: true, reasonOnChange: false });
    expect(rightsFor(teacher, "g2", "2026-11-03", TODAY)).toEqual({ create: false, change: false, reasonOnChange: false });
    expect(rightsFor(teacher, "juzB", TODAY, TODAY)).toEqual({ create: false, change: false, reasonOnChange: false });
  });

  test("a supervisor changes what exists on any day, always with a reason, and creates nothing", () => {
    for (const day of [TODAY, "2026-11-04", "2020-01-01"])
      expect(rightsFor(supervisor, "g1", day, TODAY), day).toEqual({ create: false, change: true, reasonOnChange: true });
  });

  test("a supervisor who is also a teacher creates in their own groups and corrects elsewhere with a reason", () => {
    const both = access({ supervisor: true, groups: new Set(["g1"]) });
    expect(rightsFor(both, "g1", TODAY, TODAY)).toEqual({ create: true, change: true, reasonOnChange: false });
    expect(rightsFor(both, "g1", "2026-11-01", TODAY)).toEqual({ create: false, change: true, reasonOnChange: true });
    expect(rightsFor(both, "g2", TODAY, TODAY)).toEqual({ create: false, change: true, reasonOnChange: true });
  });

  test("a campus administrator and a person with no groups have no rights; nobody has any for a day that has not come", () => {
    expect(rightsFor(branchAdmin, "g1", TODAY, TODAY)).toEqual({ create: false, change: false, reasonOnChange: false });
    expect(rightsFor(nobody, "g1", TODAY, TODAY)).toEqual({ create: false, change: false, reasonOnChange: false });
    for (const who of [admin, teacher, supervisor])
      expect(rightsFor(who, "g1", "2026-11-11", TODAY)).toEqual({ create: false, change: false, reasonOnChange: false });
  });

  test("which groups a person may read: everything for an administrator and a supervisor, their groups for a teacher, any for a campus administrator, none for no one", () => {
    expect(readsEverything(admin) && readsEverything(supervisor)).toBe(true);
    expect(readsEverything(teacher) || readsEverything(branchAdmin) || readsEverything(nobody)).toBe(false);
    expect(mayReadGroup(admin, "x") && mayReadGroup(supervisor, "x")).toBe(true);
    expect(mayReadGroup(teacher, "g2")).toBe(true);
    expect(mayReadGroup(teacher, "juzB")).toBe(false);
    expect(mayReadGroup(branchAdmin, "juzB")).toBe(true);
    expect(mayReadGroup(nobody, "g2")).toBe(false);
  });

  test("the people a person may see, as a condition: no restriction for the wide, the groups, the campuses, both for a campus administrator who is a teacher, or nothing at all", () => {
    expect(reachOfAccess(admin)).toEqual({});
    expect(reachOfAccess(supervisor)).toEqual({});
    expect(reachOfAccess(teacher)).toEqual({ OR: [{ groupId: { in: ["juzA", "g1", "g2"] } }] });
    expect(reachOfAccess(branchAdmin)).toEqual({ OR: [{ campusId: { in: ["A"] } }] });
    expect(reachOfAccess(access({ campusIds: ["A"], groups: new Set(["g1"]) }))).toEqual({
      OR: [{ groupId: { in: ["g1"] } }, { campusId: { in: ["A"] } }],
    });
    // nothing reachable matches nothing (never "everything")
    expect(reachOfAccess(nobody)).toEqual({ OR: [{ id: { in: [] } }] });
    expect(reachOfAccess(access({ campusIds: [] }))).toEqual({ OR: [{ campusId: { in: [] } }] });
  });

  test("marks are added in bulk the way a grouped count arrives", () => {
    expect(addMarks(emptyCounts(), "ABSENT", 3)).toEqual({ present: 0, late: 0, absent: 3, excused: 0 });
    expect(addMarks(addMarks(emptyCounts(), "PRESENT", 2), "LATE", 1)).toEqual({ present: 2, late: 1, absent: 0, excused: 0 });
  });
});
