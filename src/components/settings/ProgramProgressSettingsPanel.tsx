"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Progress records in programs (task 0030): are progress records switched on for the school? The school's value is the ceiling; a campus can turn it off for itself. A program also has its own switch (the third level), in its Settings tab.

const word = (on: boolean) => (on ? "on" : "off");

const WORDS: SwitchWords = {
  endpoint: "programs-progress",
  headingId: "programs-progress-setting-heading",
  heading: "Progress records in programs",
  intro:
    "The running log a teacher keeps for each person in a program. Turn it off and no record can be written in any program (what was written can still be read by staff); a campus can turn it off for itself but never on over the school, and each program has its own switch too.",
  about: (on, where) =>
    where === "school"
      ? `Program progress records is ${word(on)} for the school`
      : `Program progress records is ${word(on)} for this campus`,
  field: "Program progress records",
  offSchool: "Turn program progress records off for the school",
  onSchool: "Turn program progress records on for the school",
  offCampus: "Turn program progress records off for this campus",
  state: word,
  doneSchool: "The school's program progress records setting is saved.",
};

export function ProgramProgressSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
