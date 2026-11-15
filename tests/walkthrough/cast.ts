// The fictional people and school of the walkthrough, and the throwaway password they share. Nothing here is real: the names, the addresses (.test is reserved and never delivers) and the password
// are made up for the recording, and the run's database is thrown away.

export const PASSWORD = "Heron-Lantern-Quartz-2026";

export const cast = {
  // The first administrator of the school. In Solo the wizard makes them (C01); in SaaS the platform superadministrator onboards the school and invites them.
  schoolAdmin: { name: "Amina Yusuf", email: "amina.yusuf@walkthrough.test" },
  // The people the school administrator invites in C03. Each accepts through the link in the dev inbox and chooses the name typed there.
  campusAdmin: { name: "Bola Adeyemi", email: "bola.adeyemi@walkthrough.test" },
  teacher: { name: "Chidi Okafor", email: "chidi.okafor@walkthrough.test" },
  staff: { name: "Dayo Lawal", email: "dayo.lawal@walkthrough.test" },
  // An address typed wrongly on purpose: its invitation is revoked.
  mistyped: { email: "bola.adeyem@walkthrough.test" },
};

/// The setup token of this run: made by the runner (scripts/walkthrough-run/run.mjs), handed over in the environment, never printed. The journey types it, as a person would.
export const setupToken = (): string => process.env.WALKTHROUGH_SETUP_TOKEN ?? "";

/// The dev inbox's unlock token of this run: made by the runner, handed over in the environment, never printed. The journey types it into the inbox's own field, as a person would.
export const devToolsToken = (): string => process.env.WALKTHROUGH_DEV_TOOLS_TOKEN ?? "";

/// The fictional school of the walkthrough: its name (typed in the wizard), its campuses (typed on the Settings page, C02) and the one setting the chapter changes.
export const school = {
  name: "Demonstration School",
  campuses: { north: "North Campus", south: "South Campus" },
  timeZone: { from: "UTC", to: "Africa/Lagos" },
};

/// What C04 sets up: the school year and its first term, a class with one arm, three subjects (one is archived again), an assessment scheme and a grade scale. A date is typed the way the browser's
/// date field takes it (month, day and year as digits), and the "wrong" last day is before the first day, to show the refusal.
export const academics = {
  session: { name: "2026/2027", firstDay: "09072026", lastDay: "07232027", wrongLastDay: "09012026", copy: "2027/2028" },
  term: { name: "Term 1", firstDay: "09072026", lastDay: "12182026", shown: "7 Sep 2026 – 18 Dec 2026" },
  group: { name: "JSS 1", arm: "A", capacity: "40" },
  maths: { name: "Mathematics", code: "mth", shownCode: "MTH" },
  english: { name: "English Language" },
  drawing: { name: "Drawing" },
  scheme: { name: "Standard", exam: "60", component: "CA 1", tooSmall: "30", right: "40" },
  scale: "Standard A–F",
};

/// The family of C05 and C06: a pupil and her brother, their father and mother, and the sign-in accounts of the pupil and the father (made on the Users page, linked on the pupil's page).
export const family = {
  pupil: {
    first: "Sade",
    last: "Okoro",
    name: "Sade Okoro",
    dobTyped: "03022014",
    account: { name: "Sade Okoro", email: "sade.okoro@walkthrough.test" },
  },
  brother: { first: "Bisi", last: "Okoro", name: "Bisi Okoro", dobTyped: "02022016" },
  father: {
    first: "Gbenga",
    last: "Okoro",
    name: "Gbenga Okoro",
    phone: "08031234567",
    tooShortPhone: "12",
    account: { name: "Gbenga Okoro", email: "gbenga.okoro@walkthrough.test" },
  },
  mother: { first: "Mary", last: "Okoro", name: "Mary Okoro" },
  // the teacher's staff record (C05) carries the address the teacher signed up with in C03, and is linked to that account
  teacherRecord: { first: "Chidi", last: "Okafor", name: "Chidi Okafor" },
};

/// The marks of C08: Mathematics (CA 1 out of 40, the exam out of 60: the scheme of C04), a mark typed too high on purpose, and English; and the reason a mark is returned with.
export const marks = {
  maths: { ca: "30", exam: "45.5", total: "75.5", examTooHigh: "75" },
  english: { ca: "25", exam: "40" },
  returnReason: "The exam mark looks wrong",
};
