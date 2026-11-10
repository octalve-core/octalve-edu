import type { Candidate, ClassOption, ClassPlan, Person, PeoplePage } from "@/lib/programs/people-service";
import type { PlaceState } from "@/lib/programs/people-rules";

// What the People tab shares: the shapes the API answers with (types only) and the words for a kind and the state of a place.

export type { Candidate, ClassOption, ClassPlan, Person, PeoplePage };

export const KIND_TEXT: Record<Person["kind"], string> = {
  STUDENT: "Pupil",
  STAFF: "Member of staff",
  GUARDIAN: "Guardian",
  ADULT: "Adult",
  CHILD: "Child",
};

export const STATE_TEXT: Record<PlaceState, string> = {
  ACTIVE: "Taking part",
  SUSPENDED: "Suspended",
  EXPELLED: "Expelled",
  TERMINATED: "Terminated",
  ENDED_BY_SCHOOL: "Ended by the school",
  WITHDRAWN: "Left",
  COMPLETED: "Completed",
};
export const STATE_TONE: Record<PlaceState, "ok" | "warn" | "neutral" | "info"> = {
  ACTIVE: "ok",
  SUSPENDED: "warn",
  EXPELLED: "warn",
  TERMINATED: "warn",
  ENDED_BY_SCHOOL: "warn",
  WITHDRAWN: "neutral",
  COMPLETED: "info",
};

export const SKIPPED_TEXT: Record<ClassPlan["skipped"][number]["reason"], string> = {
  ALREADY_IN: "already in the program",
  LEFT_ALREADY: "has left the program (re-enrol them)",
  ARCHIVED: "archived",
  EXPELLED: "expelled",
  OTHER_CAMPUS: "from a campus you can't add from",
};

export const PEOPLE_ACTION_TEXT: Record<string, string> = {
  PERSON_ADDED: "Added",
  CLASS_ADDED: "A class was added",
  PERSON_EDITED: "Details changed",
  PERSON_MOVED: "Moved to another group",
  PERSON_WITHDRAWN: "Left the program",
  PERSON_REENROLLED: "Re-enrolled",
  PERSON_SUSPEND: "Suspended",
  PERSON_LIFT: "Suspension lifted",
  PERSON_EXPEL: "Expelled from the program",
  PERSON_REINSTATE: "Reinstated",
};

/// The pill's colours: the one state that is simply good is green, the ones that need a look are amber, the ones that ended something are red or neutral.
export const STATE_STYLE: Record<PlaceState, string> = {
  ACTIVE: "border-ok-line bg-ok-bg text-ok-fg",
  SUSPENDED: "border-warn-line bg-warn-bg text-warn-fg",
  EXPELLED: "border-danger-line bg-danger-bg text-danger-fg",
  TERMINATED: "border-danger-line bg-danger-bg text-danger-fg",
  ENDED_BY_SCHOOL: "border-line-strong bg-surface-2 text-fg-2",
  WITHDRAWN: "border-line-strong bg-surface-2 text-fg-2",
  COMPLETED: "border-ok-line bg-ok-bg text-ok-fg",
};
