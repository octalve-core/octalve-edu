// Octalve Edu's brand strings — one of only TWO per-repo brand files (the other is
// app/brand.css, the colours). The shared UI reads everything brand-specific from
// here, so the components stay code-identical with AlEemaan's.
//
// Copy is the design artifact's ("Octalve Edu & AlEemaan — UI Design").

export const brand = {
  name: "Octalve Edu",
  /// Shown under the logo on the compact (phone) sign-in header.
  tagline: "Solo or SaaS — sign in to your dashboard",
  description: "School management platform.",
  login: {
    headline: "Run every campus from one dashboard.",
    blurb: "Solo or SaaS — Octalve Edu adapts to how your school actually operates.",
    points: ["Multi-campus & multi-tenant ready", "Role-based staff permissions", "Self-hosted or fully managed"],
  },
  /// The words of the landing page a signed-out visitor sees at `/` (task 0041). Only what the product does today: a claim here is a claim a school will test. `howRun` is optional: a product
  /// that is one school's own (AlEemaan) leaves it out and the section is not drawn.
  landing: {
    title: "Octalve Edu: school management",
    description: "Octalve Edu keeps a school's students, attendance, results and fees in one place, for one campus or several.",
    eyebrow: "School management platform",
    headline: "Run every campus from one dashboard.",
    lead: "Students, attendance, results and fees in one place, and each person sees only what their role needs.",
    coversHeading: "What it covers",
    covers: [
      {
        icon: "people",
        title: "Students and staff",
        text: "Records for every pupil and member of staff, guardians linked to their children, and classes and arms in each campus.",
      },
      {
        icon: "attendance",
        title: "Attendance",
        text: "Teachers take the roll for their own classes, and administrators see the whole school.",
      },
      {
        icon: "results",
        title: "Results",
        text: "Teachers enter marks, or import them from a spreadsheet, and results are approved before they are published.",
      },
      {
        icon: "reportCards",
        title: "Report cards",
        text: "Printable PDF report cards with the teacher's and the principal's remarks, and a code on every mark that anyone can check.",
      },
      {
        icon: "fees",
        title: "Fees",
        text: "Invoices for each term and the payments made against them, with the option to hold a report card back until fees that are due are paid.",
      },
      {
        icon: "yearEnd",
        title: "The end of the year",
        text: "Promote, repeat or graduate a whole class at the end of the session, and undo a roll that was a mistake.",
      },
    ],
    peopleHeading: "Made for the people in a school",
    people: [
      { who: "School owners and administrators", text: "See the whole school, set it up and decide who may do what." },
      { who: "Registrars and bursars", text: "Keep the records, raise invoices and follow payments." },
      { who: "Teachers", text: "Take the roll, enter marks and write remarks for their own classes." },
      { who: "Pupils and parents", text: "Read published results and report cards." },
    ],
    howRun: {
      heading: "Managed, or on your own server",
      items: [
        {
          title: "Managed",
          text: "Octalve hosts it. Many schools use the same service and each school's data is kept apart from every other's.",
        },
        { title: "On your own server", text: "Install it for one school, with your own database." },
      ],
    },
    closingHeading: "Already part of a school on Octalve Edu?",
    closingText: "Sign in to open your school's dashboard.",
  },
  /// What the artifact draws as "Branches" is, in this product's data model, a Campus.
  place: { singular: "campus", plural: "campuses", Singular: "Campus", Plural: "Campuses" },
} as const;
