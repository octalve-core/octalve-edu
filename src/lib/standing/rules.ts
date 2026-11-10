// Standing: suspension, expulsion and termination on the school's own records (task 0028). The pure rules: no database, no clock (the caller passes `today`), so every
// rule is unit-tested without a server.

export const STUDENT_STANDINGS = ["ACTIVE", "SUSPENDED", "EXPELLED"] as const;
export type StudentStanding = (typeof STUDENT_STANDINGS)[number];

export const STAFF_STANDINGS = ["ACTIVE", "SUSPENDED", "TERMINATED"] as const;
export type StaffStanding = (typeof STAFF_STANDINGS)[number];

export const STANDING_ACTIONS = ["SUSPEND", "LIFT", "EXPEL", "TERMINATE", "REINSTATE"] as const;
export type StandingAction = (typeof STANDING_ACTIONS)[number];

export const MIN_REASON = 3;
export const MAX_REASON = 500;

/// "2026-11-03" for a date, in UTC: the calendar day a suspension is compared on (a date, not an instant, so no time zone moves it).
export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

/// A suspension applies from the day it starts until its end date INCLUSIVE; with no end date it applies until someone lifts it. Anything else is its stored standing.
/// (`until` and `today` are calendar days, "YYYY-MM-DD", so a plain string comparison is a date comparison.)
export function effectiveStanding<S extends string>(standing: S, until: string | null, today: string): S | "ACTIVE" {
  if (standing === "SUSPENDED" && until !== null && until < today) return "ACTIVE";
  return standing;
}

/// A pupil's standing as it applies today (an ended suspension is ACTIVE again). A value that is not a pupil's standing counts as active: the database refuses it.
export function studentStandingNow(student: { standing: string; standingUntil: Date | null }, todayDay: string): StudentStanding {
  const until = student.standingUntil ? dayOf(student.standingUntil) : null;
  const now = effectiveStanding(student.standing, until, todayDay);
  return now === "SUSPENDED" || now === "EXPELLED" ? now : "ACTIVE";
}

export type Refusal = "FORBIDDEN" | "SELF";

export type Who = {
  userId: string;
  /** the school's administrator (school-wide) */ isAdmin: boolean;
  /** administers the subject's own campus */ adminOfCampus: boolean;
};
export type Context = {
  /// The ceiling setting: may an administrator of a campus suspend there? (The school's value AND the campus's; default on.)
  campusAdminMaySuspend: boolean;
  /// For a member of staff: the person's account, so nobody changes their own standing; and whether they are the school's administrator.
  targetUserId?: string | null;
  targetIsAdmin?: boolean;
};

/// Who may do what (section 4.4 of the design note). Expelling, terminating and reinstating are the school administrator's alone; suspending and lifting a suspension are also
/// a campus administrator's, for the subjects of their own campus, while the ceiling allows it, and never for the school's administrator. Nobody acts on themselves.
export function mayAct(action: StandingAction, who: Who, context: Context): Refusal | null {
  if (context.targetUserId && context.targetUserId === who.userId) return "SELF";
  if (who.isAdmin) return null;
  if (action === "EXPEL" || action === "TERMINATE" || action === "REINSTATE") return "FORBIDDEN";
  if (!who.adminOfCampus || !context.campusAdminMaySuspend || context.targetIsAdmin) return "FORBIDDEN";
  return null;
}

/// The state an action leads to, or null when it does not apply to the state the subject is in (a suspension is lifted, not suspended again; the expelled are reinstated, not lifted).
export function standingAfter(action: StandingAction, subject: "STUDENT" | "STAFF", current: string): string | null {
  const gone = subject === "STUDENT" ? "EXPELLED" : "TERMINATED";
  switch (action) {
    case "SUSPEND":
      return current === "ACTIVE" ? "SUSPENDED" : null;
    case "LIFT":
      return current === "SUSPENDED" ? "ACTIVE" : null;
    case "EXPEL":
      return subject === "STUDENT" && (current === "ACTIVE" || current === "SUSPENDED") ? "EXPELLED" : null;
    case "TERMINATE":
      return subject === "STAFF" && (current === "ACTIVE" || current === "SUSPENDED") ? "TERMINATED" : null;
    case "REINSTATE":
      return current === gone ? "ACTIVE" : null;
  }
}

/// A suspension's end date must be a real day that is not already past.
export function suspensionEndProblem(until: string | null, today: string): string | null {
  if (until === null) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T00:00:00Z`) : null;
  // "2026-13-01" is not a day: the Date is invalid (and an invalid Date cannot even be turned back into text), "2026-02-30" rolls over to March.
  if (date === null || Number.isNaN(date.getTime()) || dayOf(date) !== until) return "The end date must be a real date.";
  if (until < today) return "The end date can't be in the past.";
  return null;
}
