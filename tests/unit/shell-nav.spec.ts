import { test, expect } from "@playwright/test";
import {
  SECTIONS,
  groupNav,
  initialsOf,
  isActive,
  navFor,
  pageLabel,
  schoolFromPath,
  sectionOfPath,
  type ShellSchool,
} from "@/components/shell/nav";
import {
  SIDEBAR_COOKIE,
  parseFoldedSections,
  parseSidebarCollapsed,
  serializeFoldedSections,
  serializeSidebarCollapsed,
} from "@/lib/shell-prefs";

// The shell's navigation is DATA and display-only (domain-implementation-plan.md §0.5.2-H): which links to draw for the
// school a path is in. These tests pin that model — in particular that a path naming a school the person is not in matches
// nothing, and that role-hiding follows the role in THAT school (the page and API still decide access).

const admin: ShellSchool = { code: "riverside", name: "Riverside Academy", role: "ADMIN" };
const teacher: ShellSchool = { code: "hillcrest", name: "Hillcrest School", role: "TEACHING_STAFF" };
const schools = [admin, teacher];

test.describe("navFor", () => {
  test("outside any school: one entry, the school chooser", () => {
    expect(navFor(null)).toMatchObject([{ label: "Your schools", href: "/dashboard" }]);
  });

  test("an ADMIN of a school: Overview, Academics, People, Finance, Results, Communication, Users, Question bank, Forms, Programs and Settings", () => {
    const items = navFor(admin);
    expect(items.map((i) => i.label)).toEqual([
      "Overview",
      "Academics",
      "People",
      "Finance",
      "Results",
      "Communication",
      "Users",
      "Question bank",
      "Forms",
      "Programs",
      "Settings",
    ]);
    expect(items[0].href).toBe("/schools/riverside");
    expect(items[1].href).toBe("/schools/riverside/academics");
    expect(items[2].href).toBe("/schools/riverside/people");
    expect(items[3].href).toBe("/schools/riverside/finance");
    expect(items[4].href).toBe("/schools/riverside/results");
    expect(items[5].href).toBe("/schools/riverside/communication");
    expect(items[6].href).toBe("/schools/riverside/users");
    expect(items[7].href).toBe("/schools/riverside/question-bank");
    expect(items[8].href).toBe("/schools/riverside/forms");
    expect(items[9].href).toBe("/schools/riverside/programs");
    expect(items[10].href).toBe("/schools/riverside/settings");
    expect(items.filter((i) => i.href === null)).toEqual([]);
  });

  test("a platform administrator also gets a Platform link - inside a school and outside any; nobody else does", () => {
    expect(navFor(null, true).map((i) => i.label)).toEqual(["Your schools", "Platform"]);
    expect(navFor(admin, true).map((i) => i.label)).toEqual([
      "Overview",
      "Academics",
      "People",
      "Finance",
      "Results",
      "Communication",
      "Users",
      "Question bank",
      "Forms",
      "Programs",
      "Settings",
      "Platform",
    ]);
    expect(navFor(admin, true).at(-1)).toMatchObject({ href: "/platform" });
    expect(navFor(admin).map((i) => i.label)).not.toContain("Platform");
    expect(navFor(null).map((i) => i.label)).not.toContain("Platform");
  });

  test("a CAMPUS_ADMIN sees Overview, Academics, People, Finance, Communication, Users, Question bank, Forms and Programs - never the school's Settings", () => {
    const items = navFor({ ...admin, role: "CAMPUS_ADMIN" });
    expect(items.map((i) => i.label)).toEqual([
      "Overview",
      "Academics",
      "People",
      "Finance",
      "Communication",
      "Users",
      "Question bank",
      "Forms",
      "Programs",
    ]);
    expect(items.map((i) => i.href)).toEqual([
      "/schools/riverside",
      "/schools/riverside/academics",
      "/schools/riverside/people",
      "/schools/riverside/finance",
      "/schools/riverside/communication",
      "/schools/riverside/users",
      "/schools/riverside/question-bank",
      "/schools/riverside/forms",
      "/schools/riverside/programs",
    ]);
  });

  test("staff see Overview, Academics, People (to look at, never to change), Results and the Question bank (to write in); staff also get Forms; a pupil gets My work; a parent My children — decided by the role IN THAT SCHOOL", () => {
    // Teachers write and mark forms; non-teaching staff only answer the questionnaires addressed to them, and both reach the same page.
    for (const role of ["TEACHING_STAFF", "NON_TEACHING_STAFF"] as const) {
      const items = navFor({ ...admin, role });
      expect(
        items.map((i) => i.label),
        role,
      ).toEqual(["Overview", "Academics", "People", "Results", "Question bank", "Forms", "Programs"]);
      expect(
        items.map((i) => i.href),
        role,
      ).toEqual([
        "/schools/riverside",
        "/schools/riverside/academics",
        "/schools/riverside/people",
        "/schools/riverside/results",
        "/schools/riverside/question-bank",
        "/schools/riverside/forms",
        "/schools/riverside/programs",
      ]);
    }
    // A pupil's own work is one page.
    expect(navFor({ ...admin, role: "STUDENT" }).map((i) => [i.label, i.href])).toEqual([
      ["Overview", "/schools/riverside"],
      ["My work", "/schools/riverside/learn"],
    ]);
    // A guardian looks at their children's practice.
    expect(navFor({ ...admin, role: "PARENT" }).map((i) => [i.label, i.href])).toEqual([
      ["Overview", "/schools/riverside"],
      ["My children", "/schools/riverside/children"],
    ]);
    // The same person is an admin in one school and a teacher in another: each school's nav follows its own role.
    expect(navFor(teacher).map((i) => i.label)).toEqual([
      "Overview",
      "Academics",
      "People",
      "Results",
      "Question bank",
      "Forms",
      "Programs",
    ]);
    expect(navFor(admin).map((i) => i.label)).toContain("Users");
    expect(navFor(teacher).map((i) => i.label)).not.toContain("Users"); // the Users page stays the administrators'
  });

  test("the links carry the school's code", () => {
    expect(navFor(teacher)[0].href).toBe("/schools/hillcrest");
  });
});

test.describe("schoolFromPath", () => {
  test("a path inside a school the person belongs to names that school", () => {
    expect(schoolFromPath("/schools/riverside", schools)).toBe(admin);
    expect(schoolFromPath("/schools/riverside/", schools)).toBe(admin);
    expect(schoolFromPath("/schools/hillcrest/users", schools)).toBe(teacher);
    expect(schoolFromPath("/schools/hillcrest/users/abc/edit", schools)).toBe(teacher);
  });

  test("the code is matched the way the resolver matches it: trimmed and lower-cased", () => {
    expect(schoolFromPath("/schools/RIVERSIDE", schools)).toBe(admin);
    expect(schoolFromPath("/schools/Riverside/users", schools)).toBe(admin);
    expect(schoolFromPath("/schools/%20riverside%20", schools)).toBe(admin);
    expect(schoolFromPath("/schools/river%73ide", schools)).toBe(admin); // percent-encoded letters decode first
  });

  test("a school the person is NOT in — real, unknown or malformed — matches nothing", () => {
    expect(schoolFromPath("/schools/someone-elses", schools)).toBeNull();
    expect(schoolFromPath("/schools/riverside-extra", schools)).toBeNull(); // a prefix is not a match
    expect(schoolFromPath("/schools/riversid", schools)).toBeNull();
    expect(schoolFromPath("/schools/", schools)).toBeNull();
    expect(schoolFromPath("/schools", schools)).toBeNull();
    expect(schoolFromPath("/schools/riverside", [])).toBeNull(); // nobody belongs to anything
  });

  test("hostile paths match nothing and never throw", () => {
    for (const path of [
      "/schools/%E0%A4%A", // a malformed escape
      "/schools/..%2Friverside",
      "/schools/riverside%2Fusers%2F..%2F..",
      "/schools//riverside",
      "/schools/%00",
      "/schools/dashboard", // a reserved word can never be a school
      "/schools/" + "a".repeat(200),
      "/x/schools/riverside",
      "/account",
      "/dashboard",
      "",
    ]) {
      expect(() => schoolFromPath(path, schools), path).not.toThrow();
      expect(schoolFromPath(path, schools), path).toBeNull();
    }
  });
});

test.describe("pageLabel and isActive", () => {
  test("the breadcrumb's page name, by path", () => {
    expect(pageLabel("/dashboard")).toBe("Your schools");
    expect(pageLabel("/account")).toBe("Account");
    expect(pageLabel("/account/")).toBe("Account");
    expect(pageLabel("/schools/riverside")).toBe("Overview");
    expect(pageLabel("/schools/riverside/communication")).toBe("Communication");
    expect(pageLabel("/schools/riverside/communication/broadcast")).toBe("Communication");
    expect(pageLabel("/schools/riverside/users")).toBe("Users");
    expect(pageLabel("/schools/riverside/users/")).toBe("Users");
    expect(pageLabel("/schools/riverside/question-bank")).toBe("Question bank");
    expect(pageLabel("/schools/riverside/forms")).toBe("Forms");
    expect(pageLabel("/schools/riverside/forms/abc123")).toBe("Forms"); // a form's own page is still Forms
    expect(pageLabel("/schools/riverside/forms/abc123/extra")).toBeNull();
    expect(pageLabel("/schools/riverside/learn")).toBe("My work");
    expect(pageLabel("/schools/riverside/children")).toBe("My children");
    expect(pageLabel("/schools/riverside/academics")).toBe("Academics");
    expect(pageLabel("/schools/riverside/people")).toBe("People");
    expect(pageLabel("/schools/riverside/people/students/abc123")).toBe("People"); // a person's own page is still People
    expect(pageLabel("/schools/riverside/people/staff/abc123/")).toBe("People");
    expect(pageLabel("/schools/riverside/people/students")).toBeNull(); // no such page: no invented names
    expect(pageLabel("/schools/riverside/people/other/abc123")).toBeNull();
    expect(pageLabel("/schools/riverside/programs")).toBe("Programs");
    expect(pageLabel("/schools/riverside/programs/abc123")).toBe("Programs"); // a program's own page is still Programs
    expect(pageLabel("/schools/riverside/programs/abc123/extra")).toBeNull();
    expect(pageLabel("/schools/riverside/finance")).toBe("Finance");
    expect(pageLabel("/schools/riverside/finance/invoices/abc123")).toBe("Finance"); // an invoice's own page is still Finance
    expect(pageLabel("/schools/riverside/finance/invoices")).toBeNull(); // no such page: no invented names
    expect(pageLabel("/schools/riverside/unheard-of")).toBeNull(); // no invented names
    expect(pageLabel("/somewhere-else")).toBeNull();
  });

  test("Overview is active only on its own path; other links are active on their sub-paths", () => {
    const overview = { href: "/schools/riverside", exact: true };
    expect(isActive("/schools/riverside", overview)).toBe(true);
    expect(isActive("/schools/riverside/", overview)).toBe(true);
    expect(isActive("/schools/riverside/users", overview)).toBe(false); // a prefix, but not the same page
    const users = { href: "/schools/riverside/users" };
    expect(isActive("/schools/riverside/users", users)).toBe(true);
    expect(isActive("/schools/riverside/users/abc", users)).toBe(true);
    expect(isActive("/schools/riverside/users-other", users)).toBe(false); // a segment boundary, not a string prefix
    expect(isActive("/schools/riverside", users)).toBe(false);
    expect(isActive("/anything", { href: null })).toBe(false); // an unbuilt entry is never "current"
  });
});

test.describe("initialsOf", () => {
  test("first and last word of a name; the email's local part with no name; one letter for one word", () => {
    expect(initialsOf("Amina Yusuf", null)).toBe("AY");
    expect(initialsOf("Amina", null)).toBe("A");
    expect(initialsOf("  amina  bello  yusuf ", null)).toBe("AY");
    expect(initialsOf(null, "ada.obi@school.test")).toBe("AO");
    expect(initialsOf("", "x@y.z")).toBe("X");
    expect(initialsOf(null, null)).toBe("?");
  });

  test("never splits a surrogate pair", () => {
    expect(initialsOf("😀 Smile", null)).toBe("😀S");
  });
});

// The sidebar in sections (task 0026). `navFor` is still the one list; these tests pin how it is grouped for each kind of person,
// that the phone's tab bar still comes out of the same list in the same order, and how the two remembered choices are read.
const labels = (items: { label: string }[]) => items.map((item) => item.label);
const IDS = SECTIONS.map((section) => section.id);
const headings = (groups: ReturnType<typeof groupNav>) => groups.map((group) => group.section?.label ?? null);

test.describe("groupNav: sections for each kind of person", () => {
  test("an ADMIN: Overview on its own, then Administration (with Settings) and Learning; a platform administrator also gets Platform last, as a plain link", () => {
    const groups = groupNav(navFor(admin));
    expect(headings(groups)).toEqual([null, "Administration", "Learning"]);
    expect(labels(groups[0].items)).toEqual(["Overview"]);
    expect(labels(groups[1].items)).toEqual(["Academics", "People", "Finance", "Results", "Communication", "Users", "Settings"]);
    expect(labels(groups[2].items)).toEqual(["Question bank", "Forms", "Programs"]);

    const withPlatform = groupNav(navFor(admin, true));
    expect(headings(withPlatform)).toEqual([null, "Administration", "Learning", null]);
    expect(labels(withPlatform[3].items)).toEqual(["Platform"]);
  });

  test("a CAMPUS_ADMIN has no Settings in Administration", () => {
    const groups = groupNav(navFor({ ...admin, role: "CAMPUS_ADMIN" }));
    expect(labels(groups[1].items)).toEqual(["Academics", "People", "Finance", "Communication", "Users"]);
  });

  test("staff: Administration (Academics, People, Results) and Learning (Question bank, Forms, Programs)", () => {
    for (const role of ["TEACHING_STAFF", "NON_TEACHING_STAFF"] as const) {
      const groups = groupNav(navFor({ ...admin, role }));
      expect(headings(groups), role).toEqual([null, "Administration", "Learning"]);
      expect(labels(groups[1].items), role).toEqual(["Academics", "People", "Results"]);
      expect(labels(groups[2].items), role).toEqual(["Question bank", "Forms", "Programs"]);
    }
  });

  test("a pupil, a guardian and someone outside any school have no sections at all", () => {
    for (const items of [navFor({ ...admin, role: "STUDENT" }), navFor({ ...admin, role: "PARENT" }), navFor(null)]) {
      const groups = groupNav(items);
      expect(headings(groups)).toEqual([null]);
      expect(labels(groups[0].items)).toEqual(labels(items));
    }
  });

  test("outside any school a platform administrator has Your schools, then Platform as a plain link", () => {
    const groups = groupNav(navFor(null, true));
    expect(headings(groups)).toEqual([null, null]);
    expect(labels(groups.flatMap((group) => group.items))).toEqual(["Your schools", "Platform"]);
  });

  test("a section of one entry is a plain link, and nothing is lost or repeated", () => {
    const one = navFor(admin).filter(
      (item) =>
        item.label !== "Academics" &&
        item.label !== "People" &&
        item.label !== "Finance" &&
        item.label !== "Results" &&
        item.label !== "Communication" &&
        item.label !== "Users",
    );
    const groups = groupNav(one); // only Settings is left in Administration
    expect(headings(groups)).toEqual([null, null, "Learning"]);
    for (const items of [
      navFor(admin),
      navFor(admin, true),
      navFor({ ...admin, role: "CAMPUS_ADMIN" }),
      navFor({ ...admin, role: "STUDENT" }),
      one,
    ]) {
      expect(labels(groupNav(items).flatMap((group) => group.items)).sort()).toEqual(labels(items).sort());
    }
  });

  test("an empty list has no groups", () => {
    expect(groupNav([])).toEqual([]);
  });

  test("the phone's More sheet groups what it holds the same way (it passes only the overflow entries)", () => {
    // The bar keeps the first four of an administrator's entries; the rest are in the sheet.
    const overflow = navFor(admin, true).slice(4);
    const groups = groupNav(overflow);
    expect(headings(groups)).toEqual(["Administration", "Learning", null]);
    expect(labels(groups[0].items)).toEqual(["Results", "Communication", "Users", "Settings"]);
    expect(labels(groups[2].items)).toEqual(["Platform"]);
  });
});

test.describe("the list itself", () => {
  test("every entry in a school's list is either unsectioned (Overview, My work, My children, Your schools) or in a known section", () => {
    for (const items of [
      navFor(admin, true),
      navFor({ ...admin, role: "CAMPUS_ADMIN" }),
      navFor({ ...admin, role: "TEACHING_STAFF" }),
      navFor(null, true),
    ]) {
      for (const item of items) {
        if (!item.section) expect(["Overview", "Your schools", "My work", "My children"], item.label).toContain(item.label);
        else expect(IDS, item.label).toContain(item.section);
      }
    }
  });

  test("the order of the list is unchanged by sections: the phone's tab bar is its first entries", () => {
    expect(labels(navFor(admin, true).slice(0, 4))).toEqual(["Overview", "Academics", "People", "Finance"]);
  });

  test("section ids are unique and are what the cookie stores", () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    expect(IDS).toEqual(["administration", "learning", "platform"]);
  });
});

test.describe("sectionOfPath", () => {
  test("a page and the pages below it belong to the section of their entry", () => {
    const items = navFor(admin, true);
    expect(sectionOfPath("/schools/riverside/academics", items)).toBe("administration");
    expect(sectionOfPath("/schools/riverside/people/students/abc", items)).toBe("administration");
    expect(sectionOfPath("/schools/riverside/forms/xyz", items)).toBe("learning");
    expect(sectionOfPath("/platform", items)).toBe("platform");
  });

  test("Overview, an unknown path and a page the person has no entry for belong to no section", () => {
    expect(sectionOfPath("/schools/riverside", navFor(admin))).toBeNull(); // Overview is exact and has no section
    expect(sectionOfPath("/account", navFor(admin))).toBeNull();
    expect(sectionOfPath("/schools/riverside/settings", navFor({ ...admin, role: "CAMPUS_ADMIN" }))).toBeNull();
  });
});

test.describe("the remembered choices (cookies) are read strictly", () => {
  test("collapsed only when the cookie says exactly so", () => {
    expect(parseSidebarCollapsed("collapsed")).toBe(true);
    for (const value of [undefined, null, "", "expanded", "Collapsed", "true", "1", "collapsed ", "collapsed,x"]) {
      expect(parseSidebarCollapsed(value), String(value)).toBe(false);
    }
    expect(SIDEBAR_COOKIE).toBe("sidebar");
    expect(parseSidebarCollapsed(serializeSidebarCollapsed(true))).toBe(true);
    expect(parseSidebarCollapsed(serializeSidebarCollapsed(false))).toBe(false);
  });

  test("folded sections: only known ids, each once, in the order of the sections; they round-trip", () => {
    expect(parseFoldedSections("learning,administration", IDS)).toEqual(["administration", "learning"]);
    expect(parseFoldedSections("administration,administration,administration", IDS)).toEqual(["administration"]);
    expect(parseFoldedSections("administration,<script>,__proto__,constructor,", IDS)).toEqual(["administration"]);
    expect(parseFoldedSections("Administration", IDS)).toEqual([]);
    for (const value of ["", undefined, null]) expect(parseFoldedSections(value, IDS)).toEqual([]);
    expect(parseFoldedSections(serializeFoldedSections(["learning", "administration"]), IDS)).toEqual(["administration", "learning"]);
    expect(serializeFoldedSections([])).toBe("");
  });
});
