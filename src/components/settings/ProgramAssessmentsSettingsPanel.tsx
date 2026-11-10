"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Assessments in programs (task 0027, slice P3b): are the assessments of programs switched on for the school? The school's value is the ceiling; a campus can turn it off for itself. A program also has its own switch (the third level), in its Settings tab.

const word = (on: boolean) => (on ? "on" : "off");

const WORDS: SwitchWords = {
  endpoint: "programs-assessments",
  headingId: "programs-assessments-setting-heading",
  heading: "Assessments in programs",
  intro:
    "Tests, recitation checks and other sittings of a program, with their scores. Turn it off and no assessment can be made or scored in any program (what was recorded can still be read); turn it on and everything is back. A campus can turn it off for itself but never on over the school, and each program has its own switch too.",
  about: (on, where) =>
    where === "school" ? `Program assessments is ${word(on)} for the school` : `Program assessments is ${word(on)} for this campus`,
  field: "Program assessments",
  offSchool: "Turn program assessments off for the school",
  onSchool: "Turn program assessments on for the school",
  offCampus: "Turn program assessments off for this campus",
  state: word,
  doneSchool: "The school's program assessments setting is saved.",
};

export function ProgramAssessmentsSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
