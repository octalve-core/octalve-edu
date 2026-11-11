import "../support/env";
import { test, expect } from "@playwright/test";
import { isCampusAdmin, mayChangeClass, ownsNothing } from "@/lib/results/campus-admin";
import { remarkPermissions } from "@/lib/results/remarks";
import { STAFF_READ_ROLES, WRITE_ROLES, resultFailure } from "@/lib/results/http";

// The pure rules of a campus administrator's work on Results (task 0046). The behaviour over HTTP, with two campuses, is tests/api/results-campus-admin.spec.ts.

test.describe("which classes a campus administrator may change", () => {
  test("their own campus's classes and no others: not another campus's, not a class of the whole school, not any when they have no campus", () => {
    expect(mayChangeClass("north", "north")).toBe(true);
    expect(mayChangeClass("north", "south")).toBe(false);
    expect(mayChangeClass("north", null)).toBe(false);
    expect(mayChangeClass(null, null)).toBe(false);
    expect(mayChangeClass(null, "north")).toBe(false);
  });

  test("a campus administrator with no campus owns nothing (the database refuses to make one; this is the fail-closed backstop), and no one else is affected", () => {
    expect(ownsNothing("CAMPUS_ADMIN", null)).toBe(true);
    expect(ownsNothing("CAMPUS_ADMIN", "north")).toBe(false);
    for (const role of ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]) expect(ownsNothing(role, null), role).toBe(false);
    expect(isCampusAdmin("CAMPUS_ADMIN")).toBe(true);
    expect(isCampusAdmin("ADMIN")).toBe(false);
  });
});

test.describe("remarks", () => {
  test("the principal's remark is the school administrator's alone; the teacher's is a campus administrator's for a class of their own campus", () => {
    expect(remarkPermissions("ADMIN", false)).toEqual({ teacher: true, principal: true });
    expect(remarkPermissions("CAMPUS_ADMIN", true)).toEqual({ teacher: true, principal: false });
    expect(remarkPermissions("CAMPUS_ADMIN", false)).toEqual({ teacher: false, principal: false });
    expect(remarkPermissions("TEACHING_STAFF", true)).toEqual({ teacher: true, principal: false });
    expect(remarkPermissions("NON_TEACHING_STAFF", true)).toEqual({ teacher: false, principal: false });
    expect(remarkPermissions("STUDENT", true)).toEqual({ teacher: false, principal: false });
  });
});

test.describe("the role lists and the refusal", () => {
  test("the results roles name the campus administrator, and no pupil or parent", () => {
    for (const list of [[...STAFF_READ_ROLES], [...WRITE_ROLES]] as string[][]) {
      expect(list).toContain("CAMPUS_ADMIN");
      expect(list).not.toContain("STUDENT");
      expect(list).not.toContain("PARENT");
    }
    expect([...STAFF_READ_ROLES]).toContain("NON_TEACHING_STAFF");
    expect([...WRITE_ROLES]).not.toContain("NON_TEACHING_STAFF");
  });

  test("a change outside their campus is a 403 with a sentence that says whose it is", async () => {
    const res = resultFailure("OUTSIDE_CAMPUS");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toMatch(/whole school or to another campus/);
  });
});
