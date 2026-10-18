import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { canAdminister, isAdministrator } from "@/lib/auth/administer";

// The truth table of "may this member administer a row of this campus (or a school-wide row)?" (plan C3, ADR 0016).

const CAMPUS_A = "campus-a";
const CAMPUS_B = "campus-b";

test.describe("canAdminister", () => {
  test("an ADMIN administers every campus and the school-wide rows, whatever campus their own membership names", () => {
    for (const own of [null, CAMPUS_A]) {
      const admin = { role: Role.ADMIN, campusId: own };
      expect(canAdminister(admin, CAMPUS_A)).toBe(true);
      expect(canAdminister(admin, CAMPUS_B)).toBe(true);
      expect(canAdminister(admin, null)).toBe(true);
    }
  });

  test("a CAMPUS_ADMIN administers their own campus only — not another, not a school-wide row", () => {
    const campusAdmin = { role: Role.CAMPUS_ADMIN, campusId: CAMPUS_A };
    expect(canAdminister(campusAdmin, CAMPUS_A)).toBe(true);
    expect(canAdminister(campusAdmin, CAMPUS_B)).toBe(false);
    expect(canAdminister(campusAdmin, null)).toBe(false);
  });

  test("a CAMPUS_ADMIN row with no campus (the database forbids it) administers nothing, never everything", () => {
    const broken = { role: Role.CAMPUS_ADMIN, campusId: null };
    for (const target of [CAMPUS_A, CAMPUS_B, null]) expect(canAdminister(broken, target)).toBe(false);
  });

  test("staff, students and parents administer nothing, even in their own campus", () => {
    for (const role of [Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT]) {
      expect(canAdminister({ role, campusId: CAMPUS_A }, CAMPUS_A)).toBe(false);
      expect(canAdminister({ role, campusId: CAMPUS_A }, null)).toBe(false);
    }
  });

  test("isAdministrator is true for exactly the two administrator roles", () => {
    expect(Object.values(Role).filter(isAdministrator).sort()).toEqual(["ADMIN", "CAMPUS_ADMIN"]);
  });
});
