import "../support/env";
import { test, expect } from "@playwright/test";
import { REMARK_MAX, cleanRemark, remarkChange, remarkPermissions, remarksVisibleTo } from "@/lib/results/remarks";

// The rules of report remarks (task 0036), as tables.

test.describe("cleanRemark", () => {
  const ok = (value: unknown) => cleanRemark(value);
  test("null and text that is only spaces clear the remark", () => {
    for (const blank of [null, "", "   ", "\n \t\r\n"]) expect(ok(blank), JSON.stringify(blank)).toEqual({ ok: true, value: null });
  });
  test("the text is trimmed, line ends become \\n and tabs become spaces; nothing else is rewritten", () => {
    expect(ok("  Works hard.  ")).toEqual({ ok: true, value: "Works hard." });
    expect(ok("A.\r\nB.\rC.\nD.")).toEqual({ ok: true, value: "A.\nB.\nC.\nD." });
    expect(ok("a\tb")).toEqual({ ok: true, value: "a b" });
    expect(ok("  Ọmọ rere — “good”  ")).toEqual({ ok: true, value: "Ọmọ rere — “good”" });
    expect(ok("keeps   inner   spaces")).toEqual({ ok: true, value: "keeps   inner   spaces" });
  });
  test("500 characters are fine and 501 are not, counted as a person counts (an emoji is one)", () => {
    expect(ok("x".repeat(REMARK_MAX))).toMatchObject({ ok: true });
    expect(ok("x".repeat(REMARK_MAX + 1))).toEqual({ ok: false, message: "A remark can be at most 500 characters." });
    expect(ok("😀".repeat(REMARK_MAX))).toMatchObject({ ok: true }); // 1,000 UTF-16 units, 500 characters
    expect(ok("😀".repeat(REMARK_MAX + 1))).toMatchObject({ ok: false });
  });
  test("a control character that is not a line end is refused; so is anything that is not text", () => {
    for (const bad of ["a\u0000b", "a\u0007b", "a\u001bb", "a\u007fb", "a\u2028b", "a\u2029b"])
      expect(ok(bad), JSON.stringify(bad)).toEqual({ ok: false, message: "A remark cannot contain control characters." });
    for (const bad of [5, true, {}, [], undefined]) expect(ok(bad), String(bad)).toEqual({ ok: false, message: "A remark is text." });
  });
  test("length is judged after the clean-up: a 500-character remark with spaces around it is fine", () => {
    expect(ok(`  ${"y".repeat(REMARK_MAX)}  `)).toMatchObject({ ok: true });
  });
});

test.describe("remarkPermissions", () => {
  test("the administrator writes both; a teacher only the teacher's, and only for a pupil of their arm; everyone else nothing", () => {
    expect(remarkPermissions("ADMIN", false)).toEqual({ teacher: true, principal: true });
    expect(remarkPermissions("TEACHING_STAFF", true)).toEqual({ teacher: true, principal: false });
    expect(remarkPermissions("TEACHING_STAFF", false)).toEqual({ teacher: false, principal: false });
    for (const role of ["NON_TEACHING_STAFF", "STUDENT", "PARENT", "CAMPUS_ADMIN", "SOMETHING_ELSE"])
      for (const teaches of [true, false])
        expect(remarkPermissions(role, teaches), `${role} ${teaches}`).toEqual({ teacher: false, principal: false });
  });
});

test.describe("remarksVisibleTo", () => {
  test("staff always; a pupil or a parent only once something is published or locked", () => {
    for (const role of ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]) {
      expect(remarksVisibleTo(role, false)).toBe(true);
      expect(remarksVisibleTo(role, true)).toBe(true);
    }
    for (const role of ["STUDENT", "PARENT"]) {
      expect(remarksVisibleTo(role, false)).toBe(false);
      expect(remarksVisibleTo(role, true)).toBe(true);
    }
  });
});

test.describe("remarkChange", () => {
  test("nothing when equal; set, changed and cleared otherwise", () => {
    expect(remarkChange(null, null)).toBeNull();
    expect(remarkChange("a", "a")).toBeNull();
    expect(remarkChange(null, "a")).toBe("set");
    expect(remarkChange("a", "b")).toBe("changed");
    expect(remarkChange("a", null)).toBe("cleared");
  });
});
