// The areas of a school a support grant can name (ADR 0017). `finance` is deliberately NOT here: payment data is never grantable (decided 2026-10-13);
// the database CHECK on "SupportGrant"."areas" lists the same five, and a test keeps the two in step.
export const SUPPORT_AREAS = ["settings", "academics", "people", "attendance", "results"] as const;
export type SupportArea = (typeof SUPPORT_AREAS)[number];

export const SUPPORT_AREA_LABELS: Record<SupportArea, string> = {
  settings: "School settings",
  academics: "Academic setup and timetable",
  people: "People, staff and students",
  attendance: "Attendance",
  results: "Results and report cards",
};

export const SUPPORT_GRANT_DEFAULT_HOURS = 4;
export const SUPPORT_GRANT_MAX_HOURS = 24;
