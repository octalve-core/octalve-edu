// The words of every info icon (task 0055), in one place: a typed object from a key to a short explanation. A call site names a key and cannot invent text, so the wording can be read,
// corrected and translated here, and tests/unit/info-tips.spec.ts holds every sentence to the same rules (one or two short sentences of 20 to 200 characters, ending in a full stop; no
// two keys say the same thing; no key left unused).
//
// Writing one: say what the thing IS or DOES, in plain words, and add what the screen does NOT already print under it (a tip that repeats the line under a heading is clutter: Octalve's
// screens print a description under most headings, so most of the tips here are about a rule or a lifecycle, not a definition). No promise, no instruction the button already gives, nothing
// that is only sometimes true. Check it against what the screen really does (read its source) before it goes in. AlEemaan has its own registry with its own words, checked against its own screens.

export const INFO_TIPS = {
  // Academic setup
  "academics.sessions":
    "A session is Planned, then Open, then Closed. Closing is a 24-hour countdown you can cancel, or one minute with Close sooner, which asks for your password; a closed session can be reopened.",
  "academics.scales":
    "A scale that results already use is locked. Make a new version instead: it takes the old one's place, including as the default, and the old one is archived, so graded results do not change.",
  "attendance.window":
    "Teaching staff can change a saved day for 7 days after it. After that only an administrator can, and a day that has not come yet cannot be recorded.",
  "promotion.passmark":
    "A pupil whose average over the session's published results reaches this mark moves up, or graduates from the last class. Below it, or with no published result, the pupil repeats.",

  // People
  "students.show":
    "Choose which students the list shows. An archived student is no longer current, but the record is kept and Restore, on the student's page, brings them back.",
  "staff.show":
    "Choose which staff the list shows. An archived staff member is no longer current, but the record is kept and Restore, on their page, brings them back.",
} as const;

export type InfoTipKey = keyof typeof INFO_TIPS;
