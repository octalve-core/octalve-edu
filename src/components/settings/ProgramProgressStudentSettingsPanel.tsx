"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Pupils seeing progress records (task 0030): may a pupil see their own verified progress records? The school's value is the ceiling; a campus can turn it off for itself. A program also has its own switch (the third level), in its Settings tab.

const word = (on: boolean) => (on ? "on" : "off");

const WORDS: SwitchWords = {
  endpoint: "programs-progress-student",
  headingId: "programs-progress-student-setting-heading",
  heading: "Pupils see progress records",
  intro:
    "Whether a pupil can see their own progress records (only what has been verified). A campus can turn it off for itself but never on over the school, and each program has its own switch too.",
  about: (on, where) =>
    where === "school"
      ? `Pupils seeing progress records is ${word(on)} for the school`
      : `Pupils seeing progress records is ${word(on)} for this campus`,
  field: "Pupils seeing progress records",
  offSchool: "Turn pupils seeing progress records off for the school",
  onSchool: "Turn pupils seeing progress records on for the school",
  offCampus: "Turn pupils seeing progress records off for this campus",
  state: word,
  doneSchool: "The school's pupils seeing progress records setting is saved.",
};

export function ProgramProgressStudentSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
