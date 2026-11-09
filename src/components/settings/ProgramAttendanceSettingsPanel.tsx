"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Attendance in programs (task 0027, slice P3): is the roll call of programs switched on for the school? The school's value is the ceiling; a campus can turn it off for itself. A program also has its own switch (the third level), in its Settings tab.

const word = (on: boolean) => (on ? "on" : "off");

const WORDS: SwitchWords = {
  endpoint: "programs-attendance",
  headingId: "programs-attendance-setting-heading",
  heading: "Attendance in programs",
  intro:
    "The roll call of a program's sessions. Turn it off and no roll can be taken in any program (what was recorded can still be read); turn it on and everything is back. A campus can turn it off for itself but never on over the school, and each program has its own switch too.",
  about: (on, where) =>
    where === "school" ? `Program attendance is ${word(on)} for the school` : `Program attendance is ${word(on)} for this campus`,
  field: "Program attendance",
  offSchool: "Turn program attendance off for the school",
  onSchool: "Turn program attendance on for the school",
  offCampus: "Turn program attendance off for this campus",
  state: word,
  doneSchool: "The school's program attendance setting is saved.",
};

export function ProgramAttendanceSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
