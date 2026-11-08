import "../support/env";
import { test, expect } from "@playwright/test";
import {
  dayOf,
  effectiveStanding,
  mayAct,
  standingAfter,
  studentStandingNow,
  suspensionEndProblem,
  type Context,
  type StandingAction,
  type Who,
} from "@/lib/standing/rules";

// Standing (task 0028): the pure rules. No database, no server.

test.describe("a suspension ends by itself, with no job", () => {
  test("it applies until its end date inclusive, or until lifted when it has none", () => {
    expect(effectiveStanding("SUSPENDED", "2026-11-10", "2026-11-03")).toBe("SUSPENDED");
    expect(effectiveStanding("SUSPENDED", "2026-11-10", "2026-11-10")).toBe("SUSPENDED"); // the last day still counts
    expect(effectiveStanding("SUSPENDED", "2026-11-10", "2026-11-11")).toBe("ACTIVE");
    expect(effectiveStanding("SUSPENDED", null, "2099-01-01")).toBe("SUSPENDED");
  });

  test("an expulsion, a termination and an active record never change with the date", () => {
    expect(effectiveStanding("EXPELLED", "2020-01-01", "2026-11-03")).toBe("EXPELLED");
    expect(effectiveStanding("TERMINATED", null, "2026-11-03")).toBe("TERMINATED");
    expect(effectiveStanding("ACTIVE", null, "2026-11-03")).toBe("ACTIVE");
  });

  test("the end date must be a real day that is not past", () => {
    expect(suspensionEndProblem(null, "2026-11-03")).toBeNull();
    expect(suspensionEndProblem("2026-11-03", "2026-11-03")).toBeNull(); // today is allowed
    expect(suspensionEndProblem("2026-11-02", "2026-11-03")).toMatch(/past/);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "soon", "2026-1-1", "2026-11-03T00:00:00Z"])
      expect(suspensionEndProblem(bad, "2026-11-03"), bad).toMatch(/real date/);
    expect(dayOf(new Date("2026-11-03T23:59:59Z"))).toBe("2026-11-03");
  });
});

test.describe("who may do what", () => {
  const schoolAdmin: Who = { userId: "sa", isAdmin: true, adminOfCampus: true };
  const campusAdmin: Who = { userId: "ba", isAdmin: false, adminOfCampus: true };
  const otherCampusAdmin: Who = { userId: "ob", isAdmin: false, adminOfCampus: false };
  const base: Context = { campusAdminMaySuspend: true };

  test("the school's administrator may do everything to anyone but themselves", () => {
    for (const action of ["SUSPEND", "LIFT", "EXPEL", "TERMINATE", "REINSTATE"] as StandingAction[]) {
      expect(mayAct(action, schoolAdmin, base)).toBeNull();
      expect(mayAct(action, schoolAdmin, { ...base, targetUserId: "sa" })).toBe("SELF");
    }
  });

  test("a campus administrator suspends and lifts in their own campus, never expels, terminates or reinstates", () => {
    expect(mayAct("SUSPEND", campusAdmin, base)).toBeNull();
    expect(mayAct("LIFT", campusAdmin, base)).toBeNull();
    for (const action of ["EXPEL", "TERMINATE", "REINSTATE"] as StandingAction[])
      expect(mayAct(action, campusAdmin, base)).toBe("FORBIDDEN");
  });

  test("not another administrator, not another campus, not themselves, and not when the school's ceiling is off", () => {
    expect(mayAct("SUSPEND", campusAdmin, { ...base, targetIsAdmin: true })).toBe("FORBIDDEN");
    expect(mayAct("SUSPEND", otherCampusAdmin, base)).toBe("FORBIDDEN");
    expect(mayAct("SUSPEND", campusAdmin, { ...base, targetUserId: "ba" })).toBe("SELF");
    expect(mayAct("SUSPEND", campusAdmin, { ...base, campusAdminMaySuspend: false })).toBe("FORBIDDEN");
    expect(mayAct("LIFT", campusAdmin, { ...base, campusAdminMaySuspend: false })).toBe("FORBIDDEN");
    expect(mayAct("SUSPEND", schoolAdmin, { ...base, campusAdminMaySuspend: false })).toBeNull(); // the ceiling holds campus administrators, not the school's administrator
  });
});

test.describe("what each action leads to", () => {
  test("a pupil", () => {
    expect(standingAfter("SUSPEND", "STUDENT", "ACTIVE")).toBe("SUSPENDED");
    expect(standingAfter("SUSPEND", "STUDENT", "SUSPENDED")).toBeNull();
    expect(standingAfter("SUSPEND", "STUDENT", "EXPELLED")).toBeNull();
    expect(standingAfter("LIFT", "STUDENT", "SUSPENDED")).toBe("ACTIVE");
    expect(standingAfter("LIFT", "STUDENT", "EXPELLED")).toBeNull(); // the expelled are reinstated, not lifted
    expect(standingAfter("EXPEL", "STUDENT", "ACTIVE")).toBe("EXPELLED");
    expect(standingAfter("EXPEL", "STUDENT", "SUSPENDED")).toBe("EXPELLED");
    expect(standingAfter("EXPEL", "STUDENT", "EXPELLED")).toBeNull();
    expect(standingAfter("REINSTATE", "STUDENT", "EXPELLED")).toBe("ACTIVE");
    expect(standingAfter("REINSTATE", "STUDENT", "SUSPENDED")).toBeNull();
    expect(standingAfter("TERMINATE", "STUDENT", "ACTIVE")).toBeNull(); // a pupil is expelled, not terminated
  });

  test("a member of staff", () => {
    expect(standingAfter("SUSPEND", "STAFF", "ACTIVE")).toBe("SUSPENDED");
    expect(standingAfter("TERMINATE", "STAFF", "ACTIVE")).toBe("TERMINATED");
    expect(standingAfter("TERMINATE", "STAFF", "SUSPENDED")).toBe("TERMINATED");
    expect(standingAfter("TERMINATE", "STAFF", "TERMINATED")).toBeNull();
    expect(standingAfter("REINSTATE", "STAFF", "TERMINATED")).toBe("ACTIVE");
    expect(standingAfter("EXPEL", "STAFF", "ACTIVE")).toBeNull();
  });
});

test.describe("a pupil's standing as it applies today", () => {
  test("an ended suspension is active again, a running one and an expulsion are not, and a stored value that is not a pupil's counts as active", () => {
    const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
    expect(studentStandingNow({ standing: "SUSPENDED", standingUntil: day("2026-11-10") }, "2026-11-10")).toBe("SUSPENDED");
    expect(studentStandingNow({ standing: "SUSPENDED", standingUntil: day("2026-11-10") }, "2026-11-11")).toBe("ACTIVE");
    expect(studentStandingNow({ standing: "SUSPENDED", standingUntil: null }, "2099-01-01")).toBe("SUSPENDED");
    expect(studentStandingNow({ standing: "EXPELLED", standingUntil: null }, "2026-11-11")).toBe("EXPELLED");
    expect(studentStandingNow({ standing: "TERMINATED", standingUntil: null }, "2026-11-11")).toBe("ACTIVE");
    expect(studentStandingNow({ standing: "ACTIVE", standingUntil: null }, "2026-11-11")).toBe("ACTIVE");
  });
});
