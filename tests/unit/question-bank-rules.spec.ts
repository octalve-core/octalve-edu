import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import {
  mayAuthorIn,
  mayDecide,
  mayEditAsSubmitter,
  mayMakeGeneral,
  mayReachCampus,
  maySeeOverlap,
  maySetVisibility,
  maySubmit,
  pupilsMaySee,
  reviewPower,
  staffMaySee,
  type BankItemFacts,
  type BankViewer,
  type DecisionAction,
} from "@/lib/question-bank/rules";

// Who may do what with a question bank item. The rules are one pure module, so they are tested as tables and as properties over thousands of random people and items, with
// no database. What each rule is for is in the design note (sections 6 and 7) and the slice 2 rules (docs/tasks/0032, section 4b).

const NOW = new Date("2026-10-20T12:00:00Z");
const PAST = new Date("2026-10-01T00:00:00Z");
const FUTURE = new Date("2026-12-01T00:00:00Z");
const A = "campus-a";
const B = "campus-b";

const who = (over: Partial<BankViewer> = {}): BankViewer => ({
  userId: "viewer",
  isSchoolAdmin: false,
  memberships: [],
  reviewerRows: [],
  teaches: [],
  ...over,
});
const thing = (over: Partial<BankItemFacts> = {}): BankItemFacts => ({
  campusId: A,
  subjectKey: "maths",
  status: "PENDING",
  visibility: "TEACHERS_ONLY",
  visibleFrom: null,
  submittedById: "someone-else",
  ...over,
});
const member = (role: Role, campusId = A) => ({ campusId, role });
const reviewer = (over: Partial<BankViewer["reviewerRows"][number]> = {}) => ({
  campusId: A as string | null,
  scope: "GENERAL" as "GENERAL" | "SUBJECT",
  subjectKey: null as string | null,
  isExamApprover: false,
  ...over,
});
const ALL_ACTIONS: DecisionAction[] = ["approve", "reject", "edit", "retire"];
const STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "RETIRED"] as const;

test.describe("review power: who can review an item at all", () => {
  test("a school administrator can, as an exam approver for every campus", () => {
    expect(reviewPower(who({ isSchoolAdmin: true }), thing())).toEqual({ mayReview: true, examApprover: true, everyCampus: true });
    expect(reviewPower(who({ isSchoolAdmin: true }), thing({ campusId: null }))).toEqual({
      mayReview: true,
      examApprover: true,
      everyCampus: true,
    });
  });

  test("a general reviewer of the campus can; a subject reviewer only for their subject; an exam approver flag is carried; every-campus only for a null-campus row", () => {
    const staff = [member(Role.TEACHING_STAFF)];
    expect(reviewPower(who({ memberships: staff, reviewerRows: [reviewer()] }), thing())).toEqual({
      mayReview: true,
      examApprover: false,
      everyCampus: false,
    });
    expect(reviewPower(who({ memberships: staff, reviewerRows: [reviewer({ isExamApprover: true })] }), thing()).examApprover).toBe(true);
    expect(
      reviewPower(who({ memberships: staff, reviewerRows: [reviewer({ scope: "SUBJECT", subjectKey: "maths" })] }), thing()).mayReview,
    ).toBe(true);
    expect(
      reviewPower(who({ memberships: staff, reviewerRows: [reviewer({ scope: "SUBJECT", subjectKey: "english" })] }), thing()).mayReview,
    ).toBe(false);
    // a subject reviewer does not cover a cross-subject item; a general reviewer does
    expect(
      reviewPower(
        who({ memberships: staff, reviewerRows: [reviewer({ scope: "SUBJECT", subjectKey: "maths" })] }),
        thing({ subjectKey: null }),
      ).mayReview,
    ).toBe(false);
    expect(reviewPower(who({ memberships: staff, reviewerRows: [reviewer()] }), thing({ subjectKey: null })).mayReview).toBe(true);
    const everyCampus = who({ memberships: staff, reviewerRows: [reviewer({ campusId: null })] });
    expect(reviewPower(everyCampus, thing({ campusId: B })).mayReview).toBe(true);
    expect(reviewPower(everyCampus, thing({ campusId: B })).everyCampus).toBe(true);
  });

  test("a reviewer of one campus has no power over another campus's item, or over a general item (a campus never overrides the school)", () => {
    const v = who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer({ isExamApprover: true })] });
    expect(reviewPower(v, thing({ campusId: B })).mayReview).toBe(false);
    expect(reviewPower(v, thing({ campusId: null })).mayReview).toBe(false);
  });

  test("a reviewer row counts only while its person is still active staff there: a deactivated membership, a pupil's membership or none at all voids it", () => {
    const row = reviewer({ isExamApprover: true });
    expect(reviewPower(who({ memberships: [], reviewerRows: [row] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.STUDENT)], reviewerRows: [row] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.PARENT)], reviewerRows: [row] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.TEACHING_STAFF, B)], reviewerRows: [row] }), thing()).mayReview).toBe(false); // staff, but of another campus
    expect(reviewPower(who({ memberships: [member(Role.NON_TEACHING_STAFF)], reviewerRows: [row] }), thing()).mayReview).toBe(true);
    // an every-campus row needs active staff somewhere
    const wide = reviewer({ campusId: null });
    expect(reviewPower(who({ memberships: [], reviewerRows: [wide] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.STUDENT)], reviewerRows: [wide] }), thing()).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.NON_TEACHING_STAFF, B)], reviewerRows: [wide] }), thing()).mayReview).toBe(true);
  });

  test("the administrator of the item's campus can review (the 'override'), but is not an exam approver and cannot reach another campus or a general item", () => {
    const admin = who({ memberships: [member(Role.CAMPUS_ADMIN)] });
    expect(reviewPower(admin, thing())).toEqual({ mayReview: true, examApprover: false, everyCampus: false });
    expect(reviewPower(admin, thing({ campusId: B })).mayReview).toBe(false);
    expect(reviewPower(admin, thing({ campusId: null })).mayReview).toBe(false);
    expect(reviewPower(who({ memberships: [member(Role.TEACHING_STAFF)] }), thing()).mayReview).toBe(false);
  });
});

test.describe("deciding", () => {
  const reviewerOfA = who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer({ isExamApprover: true })] });

  test("approve and reject need a PENDING item; edit and retire need an APPROVED one; no other status works", () => {
    for (const status of STATUSES) {
      for (const action of ALL_ACTIONS) {
        const needs = action === "approve" || action === "reject" ? "PENDING" : "APPROVED";
        const verdict = mayDecide(reviewerOfA, thing({ status }), action);
        expect(verdict.ok, `${action} on ${status}`).toBe(status === needs);
        if (!verdict.ok) expect(verdict.why).toBe("STATUS");
      }
    }
  });

  test("nobody decides their own submission except a school administrator, whatever their other authority, for every action", () => {
    const own = thing({ submittedById: "viewer" });
    for (const action of ALL_ACTIONS) {
      const status = action === "approve" || action === "reject" ? "PENDING" : "APPROVED";
      const item = { ...own, status } as BankItemFacts;
      const reviewerSelf = mayDecide(reviewerOfA, item, action);
      expect(reviewerSelf, action).toEqual({ ok: false, why: "SELF" });
      expect(mayDecide(who({ memberships: [member(Role.CAMPUS_ADMIN)] }), item, action), `admin ${action}`).toEqual({
        ok: false,
        why: "SELF",
      });
      expect(mayDecide(who({ isSchoolAdmin: true }), item, action), `school administrator ${action}`).toEqual({ ok: true });
    }
  });

  test("a person with no authority gets 'SCOPE' whatever the status, so they learn nothing about the item", () => {
    for (const status of STATUSES) {
      expect(mayDecide(who(), thing({ status }), "approve")).toEqual({ ok: false, why: "SCOPE" });
      expect(mayDecide(who({ memberships: [member(Role.TEACHING_STAFF)] }), thing({ status, submittedById: "viewer" }), "retire")).toEqual({
        ok: false,
        why: "SCOPE",
      });
    }
  });

  test("visibility: an exam approver in scope, the campus's administrator and a school administrator set it; a plain reviewer, a teacher and the uploader do not", () => {
    const item = thing();
    expect(maySetVisibility(reviewerOfA, item)).toBe(true);
    expect(maySetVisibility(who({ memberships: [member(Role.CAMPUS_ADMIN)] }), item)).toBe(true);
    expect(maySetVisibility(who({ isSchoolAdmin: true }), item)).toBe(true);
    expect(maySetVisibility(who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer()] }), item)).toBe(false); // reviewer, not an approver
    expect(maySetVisibility(who({ memberships: [member(Role.TEACHING_STAFF)] }), item)).toBe(false);
    expect(maySetVisibility(who({ userId: "someone-else", memberships: [member(Role.TEACHING_STAFF)] }), item)).toBe(false); // the uploader
    expect(maySetVisibility(who({ memberships: [member(Role.CAMPUS_ADMIN, B)] }), item)).toBe(false); // another campus's administrator
    expect(maySetVisibility(who({ memberships: [member(Role.CAMPUS_ADMIN)] }), thing({ campusId: null }))).toBe(false);
    expect(
      maySetVisibility(
        who({ memberships: [member(Role.TEACHING_STAFF, B)], reviewerRows: [reviewer({ campusId: B, isExamApprover: true })] }),
        item,
      ),
    ).toBe(false);
  });

  test("overlap warnings: exam approvers in scope and school administrators only; not a reviewer, not an administrator, not the uploader", () => {
    const item = thing();
    expect(maySeeOverlap(reviewerOfA, item)).toBe(true);
    expect(maySeeOverlap(who({ isSchoolAdmin: true }), item)).toBe(true);
    expect(maySeeOverlap(who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer()] }), item)).toBe(false);
    expect(maySeeOverlap(who({ memberships: [member(Role.CAMPUS_ADMIN)] }), item)).toBe(false);
    expect(maySeeOverlap(who({ userId: "someone-else", memberships: [member(Role.CAMPUS_ADMIN)], reviewerRows: [reviewer()] }), item)).toBe(
      false,
    );
    expect(maySeeOverlap(reviewerOfA, thing({ campusId: B }))).toBe(false);
    expect(
      maySeeOverlap(
        who({
          memberships: [member(Role.TEACHING_STAFF)],
          reviewerRows: [reviewer({ isExamApprover: true, scope: "SUBJECT", subjectKey: "english" })],
        }),
        item,
      ),
    ).toBe(false);
  });

  test("making an item general needs an every-campus reviewer or a school administrator, not a campus reviewer or an administrator", () => {
    expect(mayMakeGeneral(who({ isSchoolAdmin: true }), thing())).toBe(true);
    expect(mayMakeGeneral(who({ memberships: [member(Role.TEACHING_STAFF)], reviewerRows: [reviewer({ campusId: null })] }), thing())).toBe(
      true,
    );
    expect(mayMakeGeneral(reviewerOfA, thing())).toBe(false);
    expect(mayMakeGeneral(who({ memberships: [member(Role.CAMPUS_ADMIN)] }), thing())).toBe(false);
  });
});

test.describe("authoring and editing one's own", () => {
  test("a school administrator, an administrator or teacher of the campus, and a reviewer who is staff there may write into it; nobody else", () => {
    expect(mayAuthorIn(who({ isSchoolAdmin: true }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.CAMPUS_ADMIN)] }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.TEACHING_STAFF)] }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF)], reviewerRows: [reviewer()] }), A)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF)], reviewerRows: [reviewer({ campusId: null })] }), A)).toBe(
      true,
    );
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), A)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [member(Role.TEACHING_STAFF)] }), B)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [member(Role.STUDENT)] }), A)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [member(Role.PARENT)], reviewerRows: [reviewer()] }), A)).toBe(false);
    expect(mayAuthorIn(who(), A)).toBe(false);
    // a reviewer row for the campus does not carry across to a campus where the person is not staff
    expect(mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF, B)], reviewerRows: [reviewer({ campusId: null })] }), A)).toBe(
      false,
    );
  });

  test("the submitter edits a DRAFT, PENDING or REJECTED item and submits a DRAFT or REJECTED one; never an APPROVED or RETIRED item; others never", () => {
    const me = who();
    for (const status of STATUSES) {
      const own = { status, submittedById: "viewer" } as const;
      expect(mayEditAsSubmitter(me, own), `edit ${status}`).toBe(status === "DRAFT" || status === "PENDING" || status === "REJECTED");
      expect(maySubmit(me, own), `submit ${status}`).toBe(status === "DRAFT" || status === "REJECTED");
      expect(mayEditAsSubmitter(me, { status, submittedById: "other" })).toBe(false);
      expect(maySubmit(me, { status, submittedById: "other" })).toBe(false);
    }
    // not even a school administrator edits as a submitter what is not theirs (they act through the review routes)
    expect(mayEditAsSubmitter(who({ isSchoolAdmin: true }), { status: "DRAFT", submittedById: "other" })).toBe(false);
  });
});

test.describe("seeing an item (staff)", () => {
  const teacher = (teaches: string[] = ["maths"], over: Partial<BankViewer> = {}) =>
    who({ memberships: [member(Role.TEACHING_STAFF)], teaches: teaches.map((subjectKey) => ({ campusId: A, subjectKey })), ...over });
  const approved = (over: Partial<BankItemFacts> = {}) => thing({ status: "APPROVED", ...over });

  test("a DRAFT is seen by its submitter and a school administrator, and by nobody else, whatever their authority", () => {
    const draft = thing({ status: "DRAFT" });
    expect(staffMaySee(who({ isSchoolAdmin: true }), draft, NOW)).toBe(true);
    expect(staffMaySee(who({ userId: "someone-else" }), draft, NOW)).toBe(true);
    expect(
      staffMaySee(
        who({ memberships: [member(Role.CAMPUS_ADMIN)], reviewerRows: [reviewer({ campusId: null, isExamApprover: true })] }),
        draft,
        NOW,
      ),
    ).toBe(false);
    expect(staffMaySee(teacher(), draft, NOW)).toBe(false);
  });

  test("the submitter sees their own item in every status; a reviewer or the campus administrator sees every status but DRAFT in their scope", () => {
    for (const status of STATUSES) {
      expect(staffMaySee(who({ userId: "someone-else" }), thing({ status }), NOW), `own ${status}`).toBe(true);
      const admin = who({ memberships: [member(Role.CAMPUS_ADMIN)] });
      expect(staffMaySee(admin, thing({ status }), NOW), `admin ${status}`).toBe(status !== "DRAFT");
      expect(staffMaySee(admin, thing({ status, campusId: B }), NOW), `other campus ${status}`).toBe(false);
    }
  });

  test("an approved TEACHERS_ONLY item is seen by a teacher of that subject, not by a teacher of another subject, nor by non-teaching staff", () => {
    const item = approved();
    expect(staffMaySee(teacher(["maths"]), item, NOW)).toBe(true);
    expect(staffMaySee(teacher(["english"]), item, NOW)).toBe(false);
    expect(staffMaySee(teacher([]), item, NOW)).toBe(false); // a teacher with no assignment
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), item, NOW)).toBe(false);
    // a subject taught in ANOTHER campus does not count for a campus item
    expect(
      staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF)], teaches: [{ campusId: B, subjectKey: "maths" }] }), item, NOW),
    ).toBe(false);
    // an item with no subject is for any teacher of the campus
    expect(staffMaySee(teacher([]), approved({ subjectKey: null }), NOW)).toBe(true);
    expect(staffMaySee(teacher(["english"]), approved({ subjectKey: null }), NOW)).toBe(true);
  });

  test("TEACHERS_ONLY_UNTIL is secret until its date and then ordinary; PRACTICE is ordinary: any active staff of the campus sees an ordinary item", () => {
    const until = (visibleFrom: Date) => approved({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom });
    expect(staffMaySee(teacher(["english"]), until(FUTURE), NOW)).toBe(false);
    expect(staffMaySee(teacher(["maths"]), until(FUTURE), NOW)).toBe(true);
    expect(staffMaySee(teacher(["english"]), until(PAST), NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), until(PAST), NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), until(FUTURE), NOW)).toBe(false);
    expect(staffMaySee(teacher(["english"]), approved({ visibility: "PRACTICE" }), NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF)] }), approved({ visibility: "PRACTICE" }), NOW)).toBe(true);
    // an ordinary item is still only for the item's campus
    expect(staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF, B)] }), approved({ visibility: "PRACTICE" }), NOW)).toBe(false);
    // not approved yet or no longer: not for general staff
    for (const status of ["PENDING", "REJECTED", "RETIRED"] as const)
      expect(staffMaySee(teacher(["maths"]), approved({ status, visibility: "PRACTICE" }), NOW), status).toBe(false);
  });

  test("a general item is for staff of every campus; its secret form needs a teacher of that subject in some campus, or an administrator of any campus", () => {
    const general = approved({ campusId: null, visibility: "TEACHERS_ONLY" });
    expect(
      staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF, B)], teaches: [{ campusId: B, subjectKey: "maths" }] }), general, NOW),
    ).toBe(true);
    expect(
      staffMaySee(who({ memberships: [member(Role.TEACHING_STAFF, B)], teaches: [{ campusId: B, subjectKey: "english" }] }), general, NOW),
    ).toBe(false);
    expect(staffMaySee(who({ memberships: [member(Role.CAMPUS_ADMIN, B)] }), general, NOW)).toBe(true);
    expect(staffMaySee(who({ memberships: [member(Role.NON_TEACHING_STAFF, B)] }), general, NOW)).toBe(false);
    expect(staffMaySee(who(), general, NOW)).toBe(false);
    expect(staffMaySee(who({ memberships: [member(Role.STUDENT, B)] }), approved({ campusId: null, visibility: "PRACTICE" }), NOW)).toBe(
      false,
    );
  });

  test("pupils' and parents' memberships give no access to anything, in any state", () => {
    const pupil = who({ memberships: [member(Role.STUDENT), member(Role.PARENT, B)] });
    for (const status of STATUSES)
      for (const visibility of ["PRACTICE", "TEACHERS_ONLY"] as const)
        for (const campusId of [A, B, null])
          expect(staffMaySee(pupil, thing({ status, visibility, campusId }), NOW), `${status} ${visibility} ${campusId}`).toBe(false);
  });

  test("pupilsMaySee: PRACTICE, or UNTIL once the date has passed (including the exact instant); never TEACHERS_ONLY or a missing date", () => {
    expect(pupilsMaySee({ visibility: "PRACTICE", visibleFrom: null }, NOW)).toBe(true);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY", visibleFrom: null }, NOW)).toBe(false);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: PAST }, NOW)).toBe(true);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: NOW }, NOW)).toBe(true);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: new Date(NOW.getTime() + 1) }, NOW)).toBe(false);
    expect(pupilsMaySee({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: null }, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Properties over random people and items. A seeded generator, so a failure names the same case on every run.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BRANCHES = [A, B, "campus-c"];
const SUBJECTS = ["maths", "english", "physics"];
const ROLES: Role[] = [Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT];
const pick = <T>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)];

function randomViewer(next: () => number): BankViewer {
  const memberships: BankViewer["memberships"][number][] = [];
  for (const campusId of BRANCHES) if (next() < 0.5) memberships.push({ campusId, role: pick(next, ROLES) });
  const reviewerRows: BankViewer["reviewerRows"][number][] = [];
  for (let i = Math.floor(next() * 3); i > 0; i--) {
    const scope = next() < 0.5 ? "GENERAL" : "SUBJECT";
    reviewerRows.push({
      campusId: next() < 0.3 ? null : pick(next, BRANCHES),
      scope,
      subjectKey: scope === "SUBJECT" ? pick(next, SUBJECTS) : null,
      isExamApprover: next() < 0.5,
    });
  }
  const teaches: BankViewer["teaches"][number][] = [];
  for (let i = Math.floor(next() * 3); i > 0; i--) teaches.push({ campusId: pick(next, BRANCHES), subjectKey: pick(next, SUBJECTS) });
  return { userId: next() < 0.2 ? "viewer" : "other", isSchoolAdmin: next() < 0.1, memberships, reviewerRows, teaches };
}
function randomItem(next: () => number): BankItemFacts {
  const visibility = pick(next, ["PRACTICE", "TEACHERS_ONLY", "TEACHERS_ONLY_UNTIL"] as const);
  return {
    campusId: next() < 0.2 ? null : pick(next, BRANCHES),
    subjectKey: next() < 0.2 ? null : pick(next, SUBJECTS),
    status: pick(next, STATUSES),
    visibility,
    visibleFrom: visibility === "TEACHERS_ONLY_UNTIL" ? (next() < 0.5 ? PAST : FUTURE) : null,
    submittedById: next() < 0.2 ? "viewer" : "someone-else",
  };
}

/// Every permission one person has over one item, as a comparable list of names.
function permissions(viewer: BankViewer, item: BankItemFacts): string[] {
  const out: string[] = [];
  const add = (name: string, yes: boolean) => yes && out.push(name);
  add("see", staffMaySee(viewer, item, NOW));
  for (const action of ALL_ACTIONS) add(`decide:${action}`, mayDecide(viewer, item, action).ok);
  add("review", reviewPower(viewer, item).mayReview);
  add("examApprover", reviewPower(viewer, item).examApprover);
  add("everyCampus", reviewPower(viewer, item).everyCampus);
  add("visibility", maySetVisibility(viewer, item));
  add("overlap", maySeeOverlap(viewer, item));
  add("general", mayMakeGeneral(viewer, item));
  add("author", item.campusId !== null && mayAuthorIn(viewer, item.campusId));
  add("editOwn", mayEditAsSubmitter(viewer, item));
  add("submit", maySubmit(viewer, item));
  return out;
}

test.describe("properties over random people and items", () => {
  const CASES = 6000;

  test("taking anything away from a person (a membership, a reviewer row, a subject) never gives them a permission they did not have", () => {
    const next = rng(20261020);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const item = randomItem(next);
      const before = new Set(permissions(viewer, item));
      const reduced: BankViewer[] = [
        ...viewer.memberships.map((_, k) => ({ ...viewer, memberships: viewer.memberships.filter((__, j) => j !== k) })),
        ...viewer.reviewerRows.map((_, k) => ({ ...viewer, reviewerRows: viewer.reviewerRows.filter((__, j) => j !== k) })),
        ...viewer.teaches.map((_, k) => ({ ...viewer, teaches: viewer.teaches.filter((__, j) => j !== k) })),
      ];
      if (viewer.isSchoolAdmin) reduced.push({ ...viewer, isSchoolAdmin: false });
      for (const smaller of reduced)
        for (const permission of permissions(smaller, item))
          if (!before.has(permission)) problems.push(`case ${i}: removing something gave "${permission}"`);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("a person with no staff membership, no reviewer row that counts and no school administrator flag can see and do nothing except with their own items", () => {
    const next = rng(7);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const base = randomViewer(next);
      const viewer: BankViewer = {
        ...base,
        isSchoolAdmin: false,
        memberships: base.memberships.map((m) => ({ ...m, role: next() < 0.5 ? Role.STUDENT : Role.PARENT })),
      };
      const item = randomItem(next);
      const own = item.submittedById === viewer.userId;
      for (const permission of permissions(viewer, item)) {
        const allowedOwn = own && (permission === "see" || permission === "editOwn" || permission === "submit");
        if (!allowedOwn) problems.push(`case ${i}: a pupil/parent-only viewer got "${permission}"`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("a DRAFT is seen by nobody but its submitter and a school administrator; nobody but a school administrator decides their own submission; overlap implies review power", () => {
    const next = rng(99);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const item = randomItem(next);
      const own = item.submittedById === viewer.userId;
      if (item.status === "DRAFT" && staffMaySee(viewer, item, NOW) && !own && !viewer.isSchoolAdmin)
        problems.push(`case ${i}: a draft was seen by a stranger`);
      for (const action of ALL_ACTIONS)
        if (own && !viewer.isSchoolAdmin && mayDecide(viewer, item, action).ok)
          problems.push(`case ${i}: self-decision (${action}) allowed`);
      if (maySeeOverlap(viewer, item) && !reviewPower(viewer, item).mayReview) problems.push(`case ${i}: overlap without review power`);
      if (
        maySetVisibility(viewer, item) &&
        !viewer.isSchoolAdmin &&
        !reviewPower(viewer, item).examApprover &&
        !(item.campusId && viewer.memberships.some((m) => m.campusId === item.campusId && m.role === Role.CAMPUS_ADMIN))
      )
        problems.push(`case ${i}: visibility set without being an approver or the administrator`);
      if (mayMakeGeneral(viewer, item) && !viewer.isSchoolAdmin && !viewer.reviewerRows.some((r) => r.campusId === null))
        problems.push(`case ${i}: made general without an every-campus row`);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("a reviewer row of one campus never gives power over another campus's item or a general item; a general item is reached only by an every-campus reviewer or a school administrator", () => {
    const next = rng(31337);
    const problems: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const item = randomItem(next);
      const power = reviewPower(viewer, item);
      if (!power.mayReview || viewer.isSchoolAdmin) continue;
      const viaEveryBranchRow = viewer.reviewerRows.some((r) => r.campusId === null);
      const viaBranchRow = item.campusId !== null && viewer.reviewerRows.some((r) => r.campusId === item.campusId);
      const viaAdmin =
        item.campusId !== null && viewer.memberships.some((m) => m.campusId === item.campusId && m.role === Role.CAMPUS_ADMIN);
      if (!viaEveryBranchRow && !viaBranchRow && !viaAdmin) problems.push(`case ${i}: review power from nowhere`);
      if (item.campusId === null && !viaEveryBranchRow) problems.push(`case ${i}: a campus person reached a general item`);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  test("the rules never throw for any combination, including a person with duplicated rows", () => {
    const next = rng(5);
    for (let i = 0; i < CASES; i++) {
      const viewer = randomViewer(next);
      const doubled: BankViewer = {
        ...viewer,
        memberships: [...viewer.memberships, ...viewer.memberships],
        reviewerRows: [...viewer.reviewerRows, ...viewer.reviewerRows],
      };
      const item = randomItem(next);
      expect(permissions(doubled, item)).toEqual(permissions(viewer, item));
    }
  });
});

// What Octalve adds: a school has an ADMIN with no campus, a CAMPUS_ADMIN tied to one campus, and staff whose membership may name a campus or none (the whole school).
test.describe("a school and its campuses", () => {
  const wholeSchool = (role: Role) => ({ campusId: null as string | null, role });

  test("a membership with no campus covers every campus: a teacher of a one-campus school may write and read there", () => {
    const teacher = who({ memberships: [wholeSchool(Role.TEACHING_STAFF)] });
    expect(mayAuthorIn(teacher, A)).toBe(true);
    expect(mayAuthorIn(teacher, B)).toBe(true);
    expect(staffMaySee(teacher, thing({ status: "APPROVED", visibility: "PRACTICE" }), NOW)).toBe(true);
    expect(staffMaySee(teacher, thing({ campusId: B, status: "APPROVED", visibility: "PRACTICE" }), NOW)).toBe(true);
  });

  test("a membership tied to one campus covers that campus only", () => {
    const teacher = who({ memberships: [member(Role.TEACHING_STAFF, A)] });
    expect(mayAuthorIn(teacher, A)).toBe(true);
    expect(mayAuthorIn(teacher, B)).toBe(false);
    expect(staffMaySee(teacher, thing({ campusId: B, status: "APPROVED", visibility: "PRACTICE" }), NOW)).toBe(false);
  });

  test("the school's ADMIN administers every campus without being an exam approver; a CAMPUS_ADMIN only their own", () => {
    const admin = who({ memberships: [wholeSchool(Role.ADMIN)] });
    expect(reviewPower(admin, thing({ campusId: A }))).toEqual({ mayReview: true, examApprover: false, everyCampus: false });
    expect(reviewPower(admin, thing({ campusId: B })).mayReview).toBe(true);
    expect(maySetVisibility(admin, thing({ campusId: B }))).toBe(true);
    expect(reviewPower(admin, thing({ campusId: null })).mayReview).toBe(false); // a school-wide item is a reviewer for every campus's, or isSchoolAdmin's
    const campusAdmin = who({ memberships: [member(Role.CAMPUS_ADMIN, A)] });
    expect(reviewPower(campusAdmin, thing({ campusId: A })).mayReview).toBe(true);
    expect(reviewPower(campusAdmin, thing({ campusId: B })).mayReview).toBe(false);
    expect(maySetVisibility(campusAdmin, thing({ campusId: B }))).toBe(false);
  });

  test("a campus administrator is staff for reading and writing, like a teacher", () => {
    const campusAdmin = who({ memberships: [member(Role.CAMPUS_ADMIN, A)] });
    expect(mayAuthorIn(campusAdmin, A)).toBe(true);
    expect(mayAuthorIn(campusAdmin, B)).toBe(false);
  });

  test("a pupil or a parent is never staff, whatever their campus", () => {
    for (const role of [Role.STUDENT, Role.PARENT]) {
      const person = who({ memberships: [wholeSchool(role)], reviewerRows: [reviewer({ campusId: null })] });
      expect(mayAuthorIn(person, A), role).toBe(false);
      expect(reviewPower(person, thing()).mayReview, role).toBe(false);
      expect(staffMaySee(person, thing({ status: "APPROVED", visibility: "PRACTICE" }), NOW), role).toBe(false);
    }
  });

  test("a teacher with no campus on a subject assignment teaches it at every campus", () => {
    const teacher = who({ memberships: [member(Role.TEACHING_STAFF, B)], teaches: [{ campusId: null, subjectKey: "maths" }] });
    expect(staffMaySee(teacher, thing({ campusId: B, status: "APPROVED" }), NOW)).toBe(true);
  });
});

test.describe("writing for the whole school (no campus)", () => {
  const wholeSchool = (role: Role) => ({ campusId: null as string | null, role });

  test("with no campus named, the school's administrator and teaching staff whose membership is school-wide may write; a teacher tied to a campus may not", () => {
    expect(mayAuthorIn(who({ isSchoolAdmin: true }), null)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [wholeSchool(Role.TEACHING_STAFF)] }), null)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [wholeSchool(Role.CAMPUS_ADMIN)] }), null)).toBe(true);
    expect(mayAuthorIn(who({ memberships: [member(Role.TEACHING_STAFF, A)] }), null)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [member(Role.CAMPUS_ADMIN, A)] }), null)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [wholeSchool(Role.STUDENT)] }), null)).toBe(false);
    expect(mayAuthorIn(who({ memberships: [wholeSchool(Role.PARENT)] }), null)).toBe(false);
    expect(mayAuthorIn(who(), null)).toBe(false);
  });

  test("a non-teaching member writes for the whole school only as a reviewer for every campus who is school-wide staff", () => {
    const staff = [wholeSchool(Role.NON_TEACHING_STAFF)];
    expect(mayAuthorIn(who({ memberships: staff }), null)).toBe(false);
    expect(mayAuthorIn(who({ memberships: staff, reviewerRows: [reviewer({ campusId: null })] }), null)).toBe(true);
    expect(mayAuthorIn(who({ memberships: staff, reviewerRows: [reviewer({ campusId: A })] }), null)).toBe(false); // a campus's reviewer is not the school's
    expect(
      mayAuthorIn(who({ memberships: [member(Role.NON_TEACHING_STAFF, A)], reviewerRows: [reviewer({ campusId: null })] }), null),
    ).toBe(false);
  });
});

test.describe("reaching what is kept for a campus (printing a form or a quiz)", () => {
  test("the school's administrator reaches every campus and the whole school", () => {
    expect(mayReachCampus(who({ isSchoolAdmin: true }), A)).toBe(true);
    expect(mayReachCampus(who({ isSchoolAdmin: true }), B)).toBe(true);
    expect(mayReachCampus(who({ isSchoolAdmin: true }), null)).toBe(true);
  });

  test("staff reach their own campus and the whole school's, and not another campus's", () => {
    for (const role of [Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.CAMPUS_ADMIN]) {
      const viewer = who({ memberships: [member(role, A)] });
      expect(mayReachCampus(viewer, A)).toBe(true);
      expect(mayReachCampus(viewer, null)).toBe(true);
      expect(mayReachCampus(viewer, B)).toBe(false);
    }
  });

  test("a membership with no campus covers every campus", () => {
    const viewer = who({ memberships: [{ campusId: null, role: Role.TEACHING_STAFF }] });
    expect(mayReachCampus(viewer, A)).toBe(true);
    expect(mayReachCampus(viewer, B)).toBe(true);
  });

  test("a pupil, a guardian and a person with no membership reach nothing", () => {
    for (const viewer of [who({ memberships: [member(Role.STUDENT, A)] }), who({ memberships: [member(Role.PARENT, A)] }), who()]) {
      expect(mayReachCampus(viewer, A)).toBe(false);
      expect(mayReachCampus(viewer, null)).toBe(false);
    }
  });
});
