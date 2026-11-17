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

/// What C09 bills: two fees (one for JSS 1 only, one for every class), the due date of the invoices (typed as digits), a part payment, a discount, and the school's rule on the smallest part.
export const finance = {
  tuition: { name: "Tuition", amount: "75000" },
  levy: { name: "Development Levy", amount: "15000" },
  dueDate: "12012026",
  part: "30000",
  discount: { amount: "10000", reason: "Staff child waiver" },
  rule: { smallestPart: "2000", shown: "Part payments are allowed, at least ₦2,000." },
};

/// What C10 sends: an email to the staff, an email to the parents (whose email addresses the school never recorded: nobody can be reached), a text message to the parents with a personalised tag
/// appended by its chip, and the template the administrator customises (its name as the school's templates are seeded, and the name the administrator gives it). `short` is a name too short to keep.
export const messages = {
  staff: { subject: "Staff meeting on Friday", body: "The staff meeting is on Friday after school. Please bring your registers." },
  parents: { subject: "Open day on Saturday", body: "Our open day is on Saturday. All parents are welcome." },
  sms: { body: "School closes early on Friday for" },
  template: { seeded: "Attendance Absence Notice (Email)", name: "Absence notice to parents (Email)", short: "A" },
};

/// What C11 writes: three questions of three kinds by the teacher (a one-correct-answer question with its explanation, points, difficulty, topic, subject and class; a true-or-false question; a short-
/// answer question with two accepted answers), the points the teacher changes on the first, and the reason the reviewer gives for sending the true-or-false question back.
export const questions = {
  mcq: {
    prompt: "What is seven times eight?",
    options: ["54", "56", "58", "64"],
    correctOption: 2,
    explanation: "Seven times eight is fifty-six.",
    points: "2",
    editedPoints: "3",
    difficulty: "2 of 5",
    topic: "Multiplication",
    subject: "Mathematics",
    klass: "JSS 1",
  },
  truth: { prompt: "A triangle has four sides.", answer: "False", subject: "Mathematics", klass: "JSS 1" },
  short: { prompt: "What is the capital city of Nigeria?", accepted: ["Abuja", "abuja"], subject: "Geography", klass: "JSS 1" },
  reason: "This is too easy for JSS 1. Ask about a shape with more sides.",
};

/// What C12 writes on the Forms page: a practice set (two questions: one correct answer and true or false), a questionnaire for staff (a rating and a long answer, addressed to teachers and to the
/// non-teaching staff, not anonymous, with the answer a member of the non-teaching staff gives) and a public questionnaire anyone with the link answers (anonymous, one choice and one long answer), with the visitor's answers.
export const forms = {
  practice: {
    title: "Multiplication practice",
    instructions: "Answer every question. Take your time.",
    minutes: "15",
    klass: "JSS 1",
    single: { prompt: "What is nine times six?", options: ["52", "54", "56", "64"], correct: "Option B is correct", points: "2" },
    truth: { prompt: "A triangle has three sides.", points: "1" },
  },
  staffSurvey: {
    title: "The term in your words",
    instructions: "Please answer before the term ends.",
    rating: "How was the term for you?",
    text: "What should the school do better next term?",
    answer: { rating: "4", wrote: "More time to plan together." },
  },
  openDay: {
    title: "Open day feedback",
    instructions: "Tell us what you thought of the open day.",
    single: { prompt: "How did you hear about the open day?", options: ["From a friend", "On the radio", "At the school gate"] },
    text: { prompt: "Is there anything more you would like to tell us?" },
    visitor: { chose: "On the radio", wrote: "Please put out more chairs for the parents." },
  },
};

/// What C13 sets: a piece of paper work for JSS 1 that opened and closed in September (typed into the browser's date-and-time field: the date's digits, then the time's and its AM, so that a paper handed in now is late), and the
/// note the teacher keeps beside the pupil's name on the roll call.
export const paperWork = {
  title: "Holiday assignment",
  instructions: "Hand in your workbook with every exercise done.",
  klass: "JSS 1",
  opens: { date: "09012026", time: "0900AM" },
  closes: { date: "09102026", time: "0900AM", shown: "10 Sept 2026" },
  past: "The closing time has already passed. Choose a later one, or give an earlier opening time.",
  note: "Handed in with her workbook",
};

/// What C14 writes and answers: a second practice set for JSS 1 with one question the machine marks and one short answer a teacher marks by hand (with its model answer), what the pupil answers
/// in it and in C12's practice set, a score above the question's points (refused), and the score and feedback the administrator gives.
export const marking = {
  set: {
    title: "Nigeria quiz",
    klass: "JSS 1",
    single: {
      prompt: "Which of these is the largest city in Nigeria?",
      options: ["Lagos", "Kano", "Ibadan"],
      correct: "Option A is correct",
    },
    short: { prompt: "What is the capital city of Nigeria?", model: "Abuja", points: "2" },
  },
  pupil: { multiplication: "54", truth: "True", city: "Lagos", capital: "Abuja" },
  tooMany: "5",
  score: "2",
  feedback: "Well done, Sade.",
};

/// What C15 makes on the Programs page: a program that never ends, run on the North campus, with two level names; its groups (one at the top, one inside it, a second at the top that is renamed
/// and archived); and the details the administrator edits.
export const program = {
  name: "Quran memorisation",
  description: "Daily memorisation and revision after school.",
  levels: ["Section", "Class"],
  campus: "North Campus",
  otherCampus: "South Campus",
  groups: { top: "Hifz", inside: "Beginners", second: "Tajweed", renamed: "Tajweed revision" },
  editedDescription: "Daily memorisation and revision after school, Monday to Thursday.",
};
