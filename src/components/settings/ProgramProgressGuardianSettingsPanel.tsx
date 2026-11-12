"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Guardians seeing progress records (task 0030): may a guardian see their child's verified progress records? The school's value is the ceiling; a campus can turn it off for itself. A program also has its own switch (the third level), in its Settings tab.

const word = (on: boolean) => (on ? "on" : "off");

const WORDS: SwitchWords = {
  endpoint: "programs-progress-guardian",
  headingId: "programs-progress-guardian-setting-heading",
  heading: "Guardians see progress records",
  intro:
    "Whether a guardian can see their child's progress records (a summary unless the program allows the full entries, and only what has been verified). A campus can turn it off for itself but never on over the school, and each program has its own switch too.",
  about: (on, where) =>
    where === "school"
      ? `Guardians seeing progress records is ${word(on)} for the school`
      : `Guardians seeing progress records is ${word(on)} for this campus`,
  field: "Guardians seeing progress records",
  offSchool: "Turn guardians seeing progress records off for the school",
  onSchool: "Turn guardians seeing progress records on for the school",
  offCampus: "Turn guardians seeing progress records off for this campus",
  state: word,
  doneSchool: "The school's guardians seeing progress records setting is saved.",
};

export function ProgramProgressGuardianSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
