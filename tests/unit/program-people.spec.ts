import { test, expect } from "@playwright/test";
import {
  groupAndInner,
  isLinkedKind,
  mayBeSamePerson,
  mayChangeStanding,
  mayManagePerson,
  nameKey,
  phoneKey,
  placeState,
  standaloneProblems,
  takesPart,
  type PlaceInput,
} from "../../src/lib/programs/people-rules";

// Programs, slice P2 (task 0027): the pure rules of the people of a program. The state of a place is READ from the school's own records; this is the whole table.

const TODAY = "2026-11-10";
const d = (day: string) => new Date(`${day}T00:00:00Z`);
const live = { archivedAt: null, standing: "ACTIVE", standingUntil: null };
const place = (over: Partial<PlaceInput>): PlaceInput => ({
  kind: "ADULT",
  status: "ACTIVE",
  standing: "ACTIVE",
  standingUntil: null,
  ...over,
});
const pupil = (over: Partial<NonNullable<PlaceInput["student"]>> = {}) => place({ kind: "STUDENT", student: { ...live, ...over } });
const staff = (record: Partial<NonNullable<PlaceInput["staff"]>> = {}) =>
  place({ kind: "STAFF", staff: { ...live, membership: null, ...record } });

test.describe("the state of a place", () => {
  test("a place that was withdrawn or completed says so, whatever the school's record says", () => {
    expect(placeState(pupil({ standing: "EXPELLED" }), TODAY)).toBe("EXPELLED");
    expect(placeState({ ...pupil({ standing: "EXPELLED" }), status: "WITHDRAWN" }, TODAY)).toBe("WITHDRAWN");
    expect(placeState({ ...pupil(), status: "COMPLETED" }, TODAY)).toBe("COMPLETED");
  });

  test("a linked pupil: archived, expelled, suspended (until a day, or until lifted), or active", () => {
    expect(placeState(pupil(), TODAY)).toBe("ACTIVE");
    expect(placeState(pupil({ archivedAt: d("2026-01-01") }), TODAY)).toBe("ENDED_BY_SCHOOL");
    expect(placeState(pupil({ standing: "EXPELLED" }), TODAY)).toBe("EXPELLED");
    expect(placeState(pupil({ standing: "SUSPENDED" }), TODAY)).toBe("SUSPENDED");
    expect(placeState(pupil({ standing: "SUSPENDED", standingUntil: d(TODAY) }), TODAY)).toBe("SUSPENDED"); // the last day counts
    expect(placeState(pupil({ standing: "SUSPENDED", standingUntil: d("2026-11-09") }), TODAY)).toBe("ACTIVE"); // ended by itself
    expect(placeState(place({ kind: "STUDENT", student: null }), TODAY)).toBe("ENDED_BY_SCHOOL");
  });

  test("a linked member of staff: terminated, archived, deactivated, suspended on the record or the membership, or active", () => {
    expect(placeState(staff(), TODAY)).toBe("ACTIVE");
    expect(placeState(staff({ standing: "TERMINATED" }), TODAY)).toBe("TERMINATED");
    expect(placeState(staff({ membership: { deactivatedAt: null, standing: "TERMINATED", standingUntil: null } }), TODAY)).toBe(
      "TERMINATED",
    );
    expect(placeState(staff({ archivedAt: d("2026-01-01") }), TODAY)).toBe("ENDED_BY_SCHOOL");
    expect(placeState(staff({ membership: { deactivatedAt: d("2026-01-01"), standing: "ACTIVE", standingUntil: null } }), TODAY)).toBe(
      "ENDED_BY_SCHOOL",
    );
    expect(placeState(staff({ standing: "SUSPENDED" }), TODAY)).toBe("SUSPENDED");
    expect(placeState(staff({ membership: { deactivatedAt: d("2026-11-01"), standing: "SUSPENDED", standingUntil: null } }), TODAY)).toBe(
      "SUSPENDED",
    );
    // a deactivation that came from a suspension whose last day has passed: the person is active again
    expect(
      placeState(staff({ membership: { deactivatedAt: d("2026-11-01"), standing: "SUSPENDED", standingUntil: d("2026-11-05") } }), TODAY),
    ).toBe("ACTIVE");
    expect(placeState(place({ kind: "STAFF", staff: null }), TODAY)).toBe("ENDED_BY_SCHOOL");
  });

  test("a linked guardian is active until the school archives the record; a person typed in follows the standing on their own row", () => {
    expect(placeState(place({ kind: "GUARDIAN", guardian: { archivedAt: null } }), TODAY)).toBe("ACTIVE");
    expect(placeState(place({ kind: "GUARDIAN", guardian: { archivedAt: d("2026-01-01") } }), TODAY)).toBe("ENDED_BY_SCHOOL");
    expect(placeState(place({ kind: "GUARDIAN", guardian: null }), TODAY)).toBe("ENDED_BY_SCHOOL");
    expect(placeState(place({ kind: "ADULT", standing: "SUSPENDED" }), TODAY)).toBe("SUSPENDED");
    expect(placeState(place({ kind: "CHILD", standing: "EXPELLED" }), TODAY)).toBe("EXPELLED");
    expect(placeState(place({ kind: "ADULT", standing: "SUSPENDED", standingUntil: d("2026-11-09") }), TODAY)).toBe("ACTIVE");
  });

  test("a standing that does not belong to the kind counts as active (the database refuses it anyway)", () => {
    expect(placeState(pupil({ standing: "TERMINATED" }), TODAY)).toBe("ACTIVE");
    expect(placeState(staff({ standing: "EXPELLED" }), TODAY)).toBe("ACTIVE");
    expect(placeState(place({ kind: "ADULT", standing: "TERMINATED" }), TODAY)).toBe("ACTIVE");
  });

  test("only an active place takes part; a suspended one can still be read", () => {
    expect(takesPart("ACTIVE")).toBe(true);
    for (const state of ["SUSPENDED", "EXPELLED", "TERMINATED", "ENDED_BY_SCHOOL", "WITHDRAWN", "COMPLETED"] as const)
      expect(takesPart(state)).toBe(false);
  });
});

test.describe("who is the same person", () => {
  test("names are compared without case or spacing; phone numbers without punctuation, a leading zero or the country code", () => {
    expect(nameKey("  Aisha ", "Bello")).toBe(nameKey("aisha", "BELLO"));
    expect(phoneKey("0801 234 5678")).toBe(phoneKey("+234 801 234 5678"));
    expect(phoneKey("2348012345678")).toBe(phoneKey("08012345678"));
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
  test("the same name AND birth date, or the same phone, is probably the same person; a name alone is not", () => {
    const a = { firstName: "Aisha", lastName: "Bello", dateOfBirth: "2015-03-02", phone: null };
    expect(mayBeSamePerson(a, { ...a, firstName: " aisha" })).toBe(true);
    expect(mayBeSamePerson(a, { ...a, dateOfBirth: "2015-03-03" })).toBe(false);
    expect(mayBeSamePerson({ ...a, dateOfBirth: null }, { ...a, dateOfBirth: null })).toBe(false);
    expect(
      mayBeSamePerson({ ...a, phone: "08012345678" }, { firstName: "Other", lastName: "Name", dateOfBirth: null, phone: "+2348012345678" }),
    ).toBe(true);
  });
});

test.describe("the tree and the kinds", () => {
  const groups = [
    { id: "a", parentId: null, name: "A" },
    { id: "b", parentId: "a", name: "B" },
    { id: "c", parentId: "b", name: "C" },
    { id: "z", parentId: null, name: "Z" },
  ];
  test("a group's head count covers everything inside it, at any depth, and a loop ends", () => {
    expect(groupAndInner(groups, "a").sort()).toEqual(["a", "b", "c"]);
    expect(groupAndInner(groups, "z")).toEqual(["z"]);
    expect(
      groupAndInner(
        [
          { id: "x", parentId: "y", name: "X" },
          { id: "y", parentId: "x", name: "Y" },
        ],
        "x",
      ).sort(),
    ).toEqual(["x", "y"]);
  });
  test("a pupil, a member of staff and a guardian are linked; an adult and a child are typed in", () => {
    for (const kind of ["STUDENT", "STAFF", "GUARDIAN"]) expect(isLinkedKind(kind)).toBe(true);
    for (const kind of ["ADULT", "CHILD", "OTHER"]) expect(isLinkedKind(kind)).toBe(false);
  });
  test("a child needs a birth date, a guardian's name and a guardian's phone; an adult needs only a name", () => {
    expect(standaloneProblems({ kind: "ADULT", firstName: "A", lastName: "B" })).toEqual([]);
    expect(standaloneProblems({ kind: "ADULT", firstName: " ", lastName: "" }).map((p) => p.path)).toEqual([
      "body.firstName",
      "body.lastName",
    ]);
    expect(standaloneProblems({ kind: "CHILD", firstName: "A", lastName: "B" }).map((p) => p.path)).toEqual([
      "body.dateOfBirth",
      "body.guardianName",
      "body.guardianPhone",
    ]);
    expect(
      standaloneProblems({
        kind: "CHILD",
        firstName: "A",
        lastName: "B",
        dateOfBirth: "2018-01-01",
        guardianName: "G",
        guardianPhone: "08012345678",
      }),
    ).toEqual([]);
  });
});

test.describe("who may do what", () => {
  const [superAdmin, programAdmin, north] = [
    { level: "SUPER" as const },
    { level: "ADMIN" as const },
    { level: "CAMPUS" as const, campusId: "north" },
  ];
  test("the school's administrator and a program admin handle everyone; a campus administrator only the people through their own campus, never the school's", () => {
    for (const viewer of [superAdmin, programAdmin]) {
      expect(mayManagePerson(viewer, "north")).toBe(true);
      expect(mayManagePerson(viewer, null)).toBe(true);
    }
    expect(mayManagePerson(north, "north")).toBe(true);
    expect(mayManagePerson(north, "south")).toBe(false);
    expect(mayManagePerson(north, null)).toBe(false);
  });
  test("suspending and lifting follow the school's switch; expelling and reinstating stay the school administrator's; nobody is refused by the wrong reason", () => {
    expect(mayChangeStanding(superAdmin, "EXPEL", null, false, "u")).toBeNull();
    expect(mayChangeStanding(superAdmin, "SUSPEND", "north", false, "u")).toBeNull();
    expect(mayChangeStanding(programAdmin, "SUSPEND", "north", true, "u")).toBeNull();
    expect(mayChangeStanding(programAdmin, "SUSPEND", "north", false, "u")).toBe("FORBIDDEN");
    expect(mayChangeStanding(programAdmin, "EXPEL", "north", true, "u")).toBe("FORBIDDEN");
    expect(mayChangeStanding(north, "LIFT", "north", true, "u")).toBeNull();
    expect(mayChangeStanding(north, "REINSTATE", "north", true, "u")).toBe("FORBIDDEN");
    expect(mayChangeStanding(north, "SUSPEND", "south", true, "u")).toBe("NOT_YOURS");
  });
});
