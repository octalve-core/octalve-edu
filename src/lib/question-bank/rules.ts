import { Role, type BankItemStatus, type BankVisibility } from "@prisma/client";

// Who may do what with a question bank item (design note sections 6 and 7; slice 2 rules in docs/tasks/0032, section 4b). Pure functions over facts already loaded, so every rule
// can be tested as a table without a database, and the routes and services all ask the same code. The loaders (`loadViewer`) live in `viewer.ts`; nothing here reads or writes.
//
// The shape of the rules, in one place:
//   - A school administrator may do everything (the audited "override"), except that they are not "staff of a campus" for the purposes below that name a campus: they simply pass.
//   - A reviewer row counts only while its person is STILL active staff in the row's campus (any campus for an every-campus row). Removing or deactivating someone
//     takes effect at their next decision, not at their next sign-in.
//   - Nobody decides their own submission; only a school administrator can.
//   - What an uploader may learn about their own item is only its status (and a rejection's reason): nothing here lets a non-approver see an overlap flag.

const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];
const TEACHING_ROLES: readonly Role[] = [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF];

export type BankViewer = {
  userId: string;
  /// Already true only for a school administrator who still holds an active membership (see `campus-access.ts`).
  isSchoolAdmin: boolean;
  /// ACTIVE memberships only.
  memberships: ReadonlyArray<{ campusId: string | null; role: Role }>;
  reviewerRows: ReadonlyArray<{
    campusId: string | null;
    scope: "GENERAL" | "SUBJECT";
    subjectKey: string | null;
    isExamApprover: boolean;
  }>;
  /// Folded names (as `subjectKey`) of the subjects the person teaches, per campus (`StaffSubjectAssignment`, not archived).
  teaches: ReadonlyArray<{ campusId: string | null; subjectKey: string }>;
};

export type BankItemFacts = {
  campusId: string | null;
  subjectKey: string | null;
  status: BankItemStatus;
  visibility: BankVisibility;
  visibleFrom: Date | null;
  submittedById: string;
};

export type DecisionAction = "approve" | "reject" | "edit" | "retire";

/// A membership with no campus belongs to the whole school (an ADMIN always; a teacher in a school with one campus), so it covers every campus.
const covers = (m: { campusId: string | null }, campusId: string) => m.campusId === null || m.campusId === campusId;
const staffIn = (viewer: BankViewer, campusId: string) =>
  viewer.memberships.some((m) => covers(m, campusId) && STAFF_ROLES.includes(m.role));
const anyStaff = (viewer: BankViewer) => viewer.memberships.some((m) => STAFF_ROLES.includes(m.role));
/// The school's administrator, or the administrator of that campus.
const adminOf = (viewer: BankViewer, campusId: string) =>
  viewer.memberships.some((m) => m.role === Role.ADMIN || (m.role === Role.CAMPUS_ADMIN && m.campusId === campusId));
const anyAdmin = (viewer: BankViewer) => viewer.memberships.some((m) => m.role === Role.ADMIN || m.role === Role.CAMPUS_ADMIN);

/// Whether a member of staff reaches what is kept for a campus: the school's administrator everything; what belongs to the whole school (no campus), any active member of staff;
/// what belongs to a campus, the staff of that campus (a membership with no campus covers every campus). The rule printing uses for a form or a quiz; a question's own, finer rule is
/// `staffMaySee`.
export function mayReachCampus(viewer: BankViewer, campusId: string | null): boolean {
  if (viewer.isSchoolAdmin) return true;
  return campusId === null ? anyStaff(viewer) : staffIn(viewer, campusId);
}

/// The reviewer rows that still count: the person is active staff where the row says (anywhere, for an every-campus row).
function liveReviewerRows(viewer: BankViewer) {
  return viewer.reviewerRows.filter((row) => (row.campusId === null ? anyStaff(viewer) : staffIn(viewer, row.campusId)));
}

export type ReviewPower = {
  /// May approve, reject, edit or retire this item (subject to its status and the self-decision rule).
  mayReview: boolean;
  /// Sees overlap warnings and sets visibility.
  examApprover: boolean;
  /// Covers every campus (needed to make an item general).
  everyCampus: boolean;
};

const NONE: ReviewPower = { mayReview: false, examApprover: false, everyCampus: false };

/// What this person's authority over an item's REVIEW is, from who they are alone: a school administrator; an every-campus reviewer or the item's campus reviewer whose scope covers the
/// item's subject; or the administrator of the item's campus (the design note's "override": not an exam approver). A general item (no campus) is reached only by an every-campus
/// reviewer: "a campus can never override a school-wide" decision.
export function reviewPower(viewer: BankViewer, item: Pick<BankItemFacts, "campusId" | "subjectKey">): ReviewPower {
  if (viewer.isSchoolAdmin) return { mayReview: true, examApprover: true, everyCampus: true };
  const matching = liveReviewerRows(viewer).filter(
    (row) =>
      (row.campusId === null || (item.campusId !== null && row.campusId === item.campusId)) &&
      (row.scope === "GENERAL" || (item.subjectKey !== null && row.subjectKey === item.subjectKey)),
  );
  const power: ReviewPower = {
    mayReview: matching.length > 0,
    examApprover: matching.some((row) => row.isExamApprover),
    everyCampus: matching.some((row) => row.campusId === null),
  };
  if (item.campusId !== null && adminOf(viewer, item.campusId)) power.mayReview = true;
  return power.mayReview ? power : NONE;
}

/// Who may write a question into a campus: the school's administrator; an administrator or teacher of that campus (or of the whole school); a reviewer who is active staff there
/// (a reviewer may be non-teaching). With no campus (`null`: a school-wide question, as in a school with no campuses of its own) only the school's administrator and teaching
/// staff whose membership is school-wide, or a school-wide reviewer who is school-wide staff, may.
export function mayAuthorIn(viewer: BankViewer, campusId: string | null): boolean {
  if (viewer.isSchoolAdmin) return true;
  if (campusId === null) {
    if (viewer.memberships.some((m) => m.campusId === null && TEACHING_ROLES.includes(m.role))) return true;
    return (
      liveReviewerRows(viewer).some((row) => row.campusId === null) &&
      viewer.memberships.some((m) => m.campusId === null && STAFF_ROLES.includes(m.role))
    );
  }
  if (viewer.memberships.some((m) => covers(m, campusId) && TEACHING_ROLES.includes(m.role))) return true;
  return liveReviewerRows(viewer).some((row) => (row.campusId === null || row.campusId === campusId) && staffIn(viewer, campusId));
}

/// The submitter edits their own DRAFT (free), PENDING (a new version) and REJECTED (then submits again) item; never an APPROVED or RETIRED one.
export function mayEditAsSubmitter(viewer: BankViewer, item: Pick<BankItemFacts, "status" | "submittedById">): boolean {
  return item.submittedById === viewer.userId && (item.status === "DRAFT" || item.status === "PENDING" || item.status === "REJECTED");
}

export function maySubmit(viewer: BankViewer, item: Pick<BankItemFacts, "status" | "submittedById">): boolean {
  return item.submittedById === viewer.userId && (item.status === "DRAFT" || item.status === "REJECTED");
}

export type DecisionVerdict = { ok: true } | { ok: false; why: "STATUS" | "SELF" | "SCOPE" };

/// Whether the person may take this decision on this item now. The order matters only for the reason given: scope is asked first, so a person with no authority learns nothing
/// about the item's status.
export function mayDecide(viewer: BankViewer, item: BankItemFacts, action: DecisionAction): DecisionVerdict {
  if (!reviewPower(viewer, item).mayReview) return { ok: false, why: "SCOPE" };
  if (item.submittedById === viewer.userId && !viewer.isSchoolAdmin) return { ok: false, why: "SELF" };
  const needs: BankItemStatus = action === "approve" || action === "reject" ? "PENDING" : "APPROVED";
  if (item.status !== needs) return { ok: false, why: "STATUS" };
  return { ok: true };
}

/// Visibility is set by an exam approver in scope, the administrator of the item's campus, or a school administrator; never by the uploader and never by a reviewer who is not one of those.
export function maySetVisibility(viewer: BankViewer, item: Pick<BankItemFacts, "campusId" | "subjectKey">): boolean {
  if (viewer.isSchoolAdmin) return true;
  if (reviewPower(viewer, item).examApprover) return true;
  return item.campusId !== null && adminOf(viewer, item.campusId);
}

/// Overlap warnings: exam approvers in scope and school administrators only. Not reviewers, not administrators, never the uploader.
export const maySeeOverlap = (viewer: BankViewer, item: Pick<BankItemFacts, "campusId" | "subjectKey">): boolean =>
  reviewPower(viewer, item).examApprover;

/// Making an item GENERAL (every campus) needs an every-campus reviewer or a school administrator.
export const mayMakeGeneral = (viewer: BankViewer, item: Pick<BankItemFacts, "campusId" | "subjectKey">): boolean =>
  reviewPower(viewer, item).everyCampus;

/// Whether pupils already see this item: PRACTICE, or TEACHERS_ONLY_UNTIL once its date has passed. (Whether a pupil route exists for it is slice 4's business.)
export function pupilsMaySee(item: Pick<BankItemFacts, "visibility" | "visibleFrom">, now: Date): boolean {
  if (item.visibility === "PRACTICE") return true;
  return item.visibility === "TEACHERS_ONLY_UNTIL" && item.visibleFrom !== null && item.visibleFrom.getTime() <= now.getTime();
}

/// Whether a member of staff may see an item in a listing or by id. School administrator: all. The submitter: their own, in any status. A DRAFT: no one else. A reviewer or the campus's
/// administrator in scope: every status but DRAFT. Any other staff: APPROVED items only, in their campus scope (every campus for a general item); the ones pupils can already
/// see by any active staff member, and the secret ones (TEACHERS_ONLY, or UNTIL its date) by a teacher of that subject, or by any teacher when the item has no subject.
export function staffMaySee(viewer: BankViewer, item: BankItemFacts, now: Date): boolean {
  if (viewer.isSchoolAdmin) return true;
  if (item.submittedById === viewer.userId) return true;
  if (item.status === "DRAFT") return false;
  if (reviewPower(viewer, item).mayReview) return true;
  if (item.status !== "APPROVED") return false;

  const inScope = item.campusId === null ? anyStaff(viewer) : staffIn(viewer, item.campusId);
  if (!inScope) return false;
  if (pupilsMaySee(item, now)) return true;

  // a secret item
  const administers = item.campusId === null ? anyAdmin(viewer) : adminOf(viewer, item.campusId);
  if (administers) return true;
  const teachesHere = viewer.memberships.some(
    (m) => m.role === Role.TEACHING_STAFF && (item.campusId === null || covers(m, item.campusId)),
  );
  if (!teachesHere) return false;
  if (item.subjectKey === null) return true;
  return viewer.teaches.some(
    (t) => t.subjectKey === item.subjectKey && (item.campusId === null || t.campusId === null || t.campusId === item.campusId),
  );
}
