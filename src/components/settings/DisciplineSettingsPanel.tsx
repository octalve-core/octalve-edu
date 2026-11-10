"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Discipline (task 0028): may the administrator of a campus suspend there? Expelling, terminating and reinstating stay with the school's administrator whatever this says.

const word = (on: boolean) => (on ? "allowed" : "not allowed");

const WORDS: SwitchWords = {
  endpoint: "standing",
  headingId: "discipline-heading",
  heading: "Discipline",
  intro:
    "Whether the administrator of a campus may suspend its pupils and staff. Expelling, terminating and reinstating are always the school's administrator's. A campus can turn this off for itself but never on over the school.",
  about: (allowed, where) =>
    where === "school" ? `Suspending by a campus administrator is ${word(allowed)}` : `Suspending by its administrator is ${word(allowed)}`,
  field: "Campus administrators may suspend",
  offSchool: "Do not allow campus administrators to suspend",
  onSchool: "Allow campus administrators to suspend",
  offCampus: "Turn off for this campus",
  state: word,
  doneSchool: "The school's setting is saved.",
};

export function DisciplineSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
