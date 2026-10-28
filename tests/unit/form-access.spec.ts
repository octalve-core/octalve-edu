import "../support/env";
import { test, expect } from "@playwright/test";
import { Permission, Role } from "@prisma/client";
import { mayAccessForm, type BankViewer, type FormAccess } from "@/lib/question-bank/rules";

// Who may reach a form by its id (view, read, manage), as a table over the pure rule, with no database. The routes and services ask this one function; forms-campus-scope.spec.ts
// and forms-results-grant.spec.ts hold the same rule over HTTP.

const A = "campus-a";
const B = "campus-b";
const GRANT = [Permission.CAN_VIEW_FORM_RESULTS];

type M = { campusId: string | null; role: Role; permissions?: readonly Permission[] };
const who = (userId: string, memberships: M[], over: Partial<BankViewer> = {}): BankViewer => ({
  userId,
  isSchoolAdmin: memberships.some((m) => m.role === Role.ADMIN),
  memberships,
  reviewerRows: [],
  teaches: [],
  ...over,
});
const form = (campusId: string | null, createdById = "creator") => ({ campusId, createdById });

const schoolAdmin = who("admin", [{ campusId: null, role: Role.ADMIN }]);
const adminA = who("admin-a", [{ campusId: A, role: Role.CAMPUS_ADMIN }]);
const adminB = who("admin-b", [{ campusId: B, role: Role.CAMPUS_ADMIN }]);
const creatorA = who("creator", [{ campusId: A, role: Role.TEACHING_STAFF }]);
const colleagueA = who("colleague", [{ campusId: A, role: Role.TEACHING_STAFF }]);
const teacherB = who("teacher-b", [{ campusId: B, role: Role.TEACHING_STAFF }]);
const wideCreator = who("creator", [{ campusId: null, role: Role.TEACHING_STAFF }]);
const clerkA = who("clerk", [{ campusId: A, role: Role.NON_TEACHING_STAFF }]);
const clerkAGranted = who("clerk", [{ campusId: A, role: Role.NON_TEACHING_STAFF, permissions: GRANT }]);
const clerkWideGranted = who("clerk", [{ campusId: null, role: Role.NON_TEACHING_STAFF, permissions: GRANT }]);
const pupilA = who("creator", [{ campusId: A, role: Role.STUDENT }]);
const nobody = who("creator", []);

type Row = [string, BankViewer, ReturnType<typeof form>, Record<FormAccess, boolean>];
const yes = { view: true, read: true, manage: true };
const no = { view: false, read: false, manage: false };
const viewOnly = { view: true, read: false, manage: false };

const TABLE: Row[] = [
  // a form of campus A, written by "creator"
  ["school administrator, campus form", schoolAdmin, form(A), yes],
  ["administrator of that campus", adminA, form(A), yes],
  ["administrator of ANOTHER campus", adminB, form(A), no],
  ["the creator, still a teacher of that campus", creatorA, form(A), yes],
  ["the creator, a teacher with no campus (the whole school)", wideCreator, form(A), yes],
  ["a colleague of that campus", colleagueA, form(A), viewOnly],
  ["a teacher of ANOTHER campus", teacherB, form(A), no],
  ["non-teaching staff of that campus", clerkA, form(A), viewOnly],
  ["non-teaching staff of that campus with the grant", clerkAGranted, form(A), { view: true, read: true, manage: false }],
  ["non-teaching staff with the grant and no campus", clerkWideGranted, form(A), { view: true, read: true, manage: false }],
  ["the creator who is no longer staff (a pupil now)", pupilA, form(A), no],
  ["a person with no active membership", nobody, form(A), no],
  // the same people, a form of campus B
  ["creator of a campus A form, on a campus B form of theirs", creatorA, form(B, "creator"), no],
  ["non-teaching staff of A with the grant, on a B form", clerkAGranted, form(B), no],
  ["non-teaching staff with the grant and no campus, on a B form", clerkWideGranted, form(B), { view: true, read: true, manage: false }],
  // a form of the whole school (no campus), written by "creator"
  ["school administrator, whole-school form", schoolAdmin, form(null), yes],
  ["campus administrator, whole-school form", adminA, form(null), viewOnly],
  ["a teacher of a campus who wrote it, whole-school form", creatorA, form(null), viewOnly],
  ["a teacher with no campus who wrote it, whole-school form", wideCreator, form(null), yes],
  ["a colleague, whole-school form", colleagueA, form(null), viewOnly],
  ["non-teaching staff, whole-school form", clerkA, form(null), viewOnly],
  ["non-teaching staff bound to a campus with the grant, whole-school form", clerkAGranted, form(null), viewOnly],
  [
    "non-teaching staff with the grant and no campus, whole-school form",
    clerkWideGranted,
    form(null),
    { view: true, read: true, manage: false },
  ],
  ["a pupil, whole-school form", pupilA, form(null), no],
];

test.describe("mayAccessForm: view, read, manage", () => {
  for (const [name, viewer, f, expected] of TABLE) {
    test(name, () => {
      for (const access of ["view", "read", "manage"] as const)
        expect(mayAccessForm(viewer, f, access), `${access}`).toBe(expected[access]);
    });
  }

  test("manage implies read, and read implies view, for every row of the table", () => {
    for (const [, viewer, f] of TABLE) {
      if (mayAccessForm(viewer, f, "manage")) expect(mayAccessForm(viewer, f, "read")).toBe(true);
      if (mayAccessForm(viewer, f, "read")) expect(mayAccessForm(viewer, f, "view")).toBe(true);
    }
  });

  test("a grant held by a membership that is not staff opens nothing", () => {
    const parent = who("p", [{ campusId: A, role: Role.PARENT, permissions: GRANT }]);
    for (const access of ["view", "read", "manage"] as const) expect(mayAccessForm(parent, form(A), access)).toBe(false);
  });

  test("a viewer written before the grant existed (no permissions on the membership) holds none", () => {
    const old = who("clerk", [{ campusId: A, role: Role.NON_TEACHING_STAFF }]);
    expect(mayAccessForm(old, form(A), "read")).toBe(false);
  });
});
