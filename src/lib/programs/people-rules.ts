import type { ProgramViewer } from "./access";
import { dayOf, effectiveStanding, mayAct, type Refusal, type StandingAction } from "@/lib/standing/rules";
import { cleanName, type GroupNode } from "./rules";

// Programs, slice P2 (people): the pure rules (task 0027, section 7; AlEemaan's task 0043, section 9). No database, no clock (the caller passes `today`), so every rule is unit-tested
// without a server.

export const PARTICIPANT_KINDS = ["STUDENT", "STAFF", "GUARDIAN", "ADULT", "CHILD"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

/// A pupil, a member of staff and a guardian are added by LINKING the school's record (their details are read from it every time); an adult and a child are typed in and live on the
/// participant row.
export const LINKED_KINDS: readonly ParticipantKind[] = ["STUDENT", "STAFF", "GUARDIAN"];
export const STANDALONE_KINDS: readonly ParticipantKind[] = ["ADULT", "CHILD"];
export const isLinkedKind = (kind: string): boolean => LINKED_KINDS.includes(kind as ParticipantKind);

export const PLACE_STATUSES = ["ACTIVE", "WITHDRAWN", "COMPLETED"] as const;
export type PlaceStatus = (typeof PLACE_STATUSES)[number];

/// What a place is, today. Read from the school's own records every time and never stored, so lifting, reinstating or restoring on the school's page brings the place back.
export const PLACE_STATES = ["ACTIVE", "SUSPENDED", "EXPELLED", "TERMINATED", "ENDED_BY_SCHOOL", "WITHDRAWN", "COMPLETED"] as const;
export type PlaceState = (typeof PLACE_STATES)[number];

export const MAX_PARTICIPANTS = 50_000;
export const PAGE_SIZE = 50;
export const MAX_PERSON_NAME = 60;
export const MAX_PHONE = 30;
export const MAX_EMAIL = 120;
export const MAX_CLASS_ADD = 500;

type StudentSide = { archivedAt: Date | null; standing: string; standingUntil: Date | null };
type StaffSide = {
  archivedAt: Date | null;
  standing: string;
  standingUntil: Date | null;
  /// The school membership of the person, when they have a sign-in: its `deactivatedAt` is how a school-wide suspension or a deactivation reaches the place.
  membership: { deactivatedAt: Date | null; standing: string; standingUntil: Date | null } | null;
};
export type PlaceInput = {
  kind: ParticipantKind;
  status: PlaceStatus;
  /// The standing stored on the participant row itself: it counts only for a person typed in (a database check keeps a linked one at ACTIVE).
  standing: string;
  standingUntil: Date | null;
  student?: StudentSide | null;
  staff?: StaffSide | null;
  guardian?: { archivedAt: Date | null } | null;
};

const untilOf = (date: Date | null): string | null => (date ? dayOf(date) : null);

/// A standing as it applies on `today` (an ended suspension is ACTIVE again). Anything that is not one of `allowed` counts as active: the database refuses it.
function standingNow(standing: string, until: Date | null, today: string, allowed: readonly string[]): string {
  const now = effectiveStanding(standing, untilOf(until), today);
  return allowed.includes(now) ? now : "ACTIVE";
}

/// The state of one place on `today`, in this order:
///   1. a place that was withdrawn or completed says so;
///   2. a linked pupil: archived is ENDED_BY_SCHOOL, then expelled, then suspended (an ended suspension no longer counts);
///   3. a linked member of staff: terminated, then archived or deactivated with no standing (ENDED_BY_SCHOOL), then suspended;
///   4. a linked guardian: archived is ENDED_BY_SCHOOL (a guardian record has no standing);
///   5. a person typed in: expelled or suspended by the standing on their own row.
export function placeState(input: PlaceInput, today: string): PlaceState {
  if (input.status === "WITHDRAWN") return "WITHDRAWN";
  if (input.status === "COMPLETED") return "COMPLETED";

  if (input.kind === "STUDENT") {
    const student = input.student;
    if (!student || student.archivedAt) return "ENDED_BY_SCHOOL";
    const now = standingNow(student.standing, student.standingUntil, today, ["SUSPENDED", "EXPELLED"]);
    return now === "EXPELLED" ? "EXPELLED" : now === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
  }

  if (input.kind === "STAFF") {
    const staff = input.staff;
    if (!staff) return "ENDED_BY_SCHOOL";
    const record = standingNow(staff.standing, staff.standingUntil, today, ["SUSPENDED", "TERMINATED"]);
    const membership = staff.membership
      ? standingNow(staff.membership.standing, staff.membership.standingUntil, today, ["SUSPENDED", "TERMINATED"])
      : "ACTIVE";
    if (record === "TERMINATED" || membership === "TERMINATED") return "TERMINATED";
    // Archived on its own, or deactivated with no standing behind it: the school ended it. (A deactivation that came from a suspension is not this: its STORED standing is
    // SUSPENDED, and once its last day has passed the person is active again even while the membership waits for their next sign-in to be lifted.)
    const storedOnTheRecord = staff.standing === "ACTIVE";
    const storedOnTheMembership = !staff.membership || staff.membership.standing === "ACTIVE";
    if (staff.archivedAt && storedOnTheRecord) return "ENDED_BY_SCHOOL";
    if (staff.membership?.deactivatedAt && storedOnTheRecord && storedOnTheMembership) return "ENDED_BY_SCHOOL";
    return record === "SUSPENDED" || membership === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
  }

  if (input.kind === "GUARDIAN") return !input.guardian || input.guardian.archivedAt ? "ENDED_BY_SCHOOL" : "ACTIVE";

  const own = standingNow(input.standing, input.standingUntil, today, ["SUSPENDED", "EXPELLED"]);
  return own === "EXPELLED" ? "EXPELLED" : own === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
}

/// The contract the later slices use: only an ACTIVE place takes part (can be marked present, given a score, have an entry written). A SUSPENDED person can still be READ.
export const takesPart = (state: PlaceState): boolean => state === "ACTIVE";

/// A normalised key for the namesake guard: the same name written differently (case, spaces) is the same name.
export const nameKey = (first: string, last: string): string => `${cleanName(first).toLowerCase()}|${cleanName(last).toLowerCase()}`;

/// Digits only, with a leading 0 or a country code made comparable: 08012345678, +2348012345678 and 2348012345678 are one number. Fewer than 7 digits is no number.
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.startsWith("234") && digits.length >= 12 ? digits.slice(3) : digits.replace(/^0+/, "");
}

export type Person = { firstName: string; lastName: string; dateOfBirth: string | null; phone: string | null };

/// Two people typed into one program are probably the same person when they have the same name AND birth date, or the same phone number. Probably: an administrator can confirm they are
/// not (and the confirmation is audited), exactly as for pupils.
export function mayBeSamePerson(a: Person, b: Person): boolean {
  if (nameKey(a.firstName, a.lastName) === nameKey(b.firstName, b.lastName) && a.dateOfBirth !== null && a.dateOfBirth === b.dateOfBirth)
    return true;
  const pa = phoneKey(a.phone);
  return pa !== null && pa === phoneKey(b.phone);
}

/// `id` and every group inside it, at any depth (a group's head count includes what is inside it).
export function groupAndInner(groups: readonly GroupNode[], id: string): string[] {
  const kids = new Map<string, string[]>();
  for (const group of groups) if (group.parentId) kids.set(group.parentId, [...(kids.get(group.parentId) ?? []), group.id]);
  const found: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (found.includes(next)) continue;
    found.push(next);
    queue.push(...(kids.get(next) ?? []));
  }
  return found;
}

/// Who may add, edit, move, withdraw and re-enrol: the school's administrator and a program admin for anyone in the program; an administrator of a campus only the people who are in the
/// program THROUGH their own campus. `personCampusId` is the campus of the place (for an addition, the campus the person is being added through); null is "through the school", which a
/// campus administrator never handles.
export function mayManagePerson(viewer: ProgramViewer, personCampusId: string | null): boolean {
  if (viewer.level === "SUPER" || viewer.level === "ADMIN") return true;
  return viewer.level === "CAMPUS" && personCampusId !== null && viewer.campusId === personCampusId;
}

/// Whether the viewer may SEE a person: the same reach as managing them (a campus administrator never reads another campus's phone numbers).
export const maySeePerson = mayManagePerson;

/// Who may suspend, lift, expel or reinstate a person TYPED IN. The same rule as for a pupil (`mayAct`), with a program admin counting as an administrator of the person's campus, and the
/// school's switch `standing.campusAdminMaySuspend` holding BOTH program admins and campus administrators (a school that took suspending away from campus administrators has not meant
/// program admins to have it). Expelling and reinstating stay the school administrator's.
export function mayChangeStanding(
  viewer: ProgramViewer,
  action: StandingAction,
  personCampusId: string | null,
  campusAdminMaySuspend: boolean,
  actorUserId: string,
): Refusal | "NOT_YOURS" | null {
  if (!mayManagePerson(viewer, personCampusId)) return "NOT_YOURS";
  return mayAct(action, { userId: actorUserId, isAdmin: viewer.level === "SUPER", adminOfCampus: true }, { campusAdminMaySuspend });
}

/// A person typed in: the required details by kind. Every kind needs a first and last name; a child also needs a birth date, a guardian's name and a guardian's phone.
export type StandaloneDetails = {
  kind: ParticipantKind;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};
export function standaloneProblems(details: StandaloneDetails): { path: string; message: string }[] {
  const problems: { path: string; message: string }[] = [];
  const blank = (value: string | null | undefined) => !value || cleanName(value) === "";
  if (blank(details.firstName)) problems.push({ path: "body.firstName", message: "Give a first name." });
  if (blank(details.lastName)) problems.push({ path: "body.lastName", message: "Give a last name." });
  if (details.kind === "CHILD") {
    if (!details.dateOfBirth) problems.push({ path: "body.dateOfBirth", message: "A child needs a date of birth." });
    if (blank(details.guardianName)) problems.push({ path: "body.guardianName", message: "A child needs a guardian's name." });
    if (phoneKey(details.guardianPhone) === null)
      problems.push({ path: "body.guardianPhone", message: "A child needs a guardian's phone number." });
  }
  return problems;
}
