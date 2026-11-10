"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Report cards and unpaid fees (task 0037): does the school hold a pupil's report card back from the pupil and their parents while school fees are owed? Off until the school says so; staff are
// never held. The switch is "report cards are released whatever is owed" (on by default); the school's value is the ceiling and a campus can only turn it off for itself, so it can hold more and
// never release what the school holds.

const state = (open: boolean) => (open ? "released whatever is owed" : "held while fees are owed");

const WORDS: SwitchWords = {
  endpoint: "report-cards",
  headingId: "report-card-gate-heading",
  heading: "Report cards",
  intro:
    "Whether a pupil's report card is held back from the pupil and their parents while school fees are owed. Staff always see the card, and are told when it is held. Fees count when they are due; a waived or paid invoice owes nothing. A campus can hold cards for itself but cannot release cards the school holds.",
  about: (open, where) =>
    where === "school" ? `Report cards are ${state(open)} for the school` : `Report cards are ${state(open)} for this campus`,
  field: "Report cards",
  offSchool: "Hold report cards while fees are owed",
  onSchool: "Release report cards whatever is owed",
  offCampus: "Hold report cards for this campus",
  state,
  doneSchool: "The school's setting is saved.",
};

export function ReportCardGatePanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
