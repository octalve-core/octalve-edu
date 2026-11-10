"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Fees in programs (task 0027, slice P4): are the fees of programs switched on for the school? The school's value is the ceiling; a campus can turn it off for itself. A program also has its own switch (the third level), in its Settings tab.

const word = (on: boolean) => (on ? "on" : "off");

const WORDS: SwitchWords = {
  endpoint: "programs-fees",
  headingId: "programs-fees-setting-heading",
  heading: "Fees in programs",
  intro:
    "The fees a program charges and the invoices made from them. Turn it off and no fee item or invoice can be made in any program (what was recorded can still be read); turn it on and everything is back. A campus can turn it off for itself but never on over the school, and each program has its own switch too.",
  about: (on, where) => (where === "school" ? `Program fees is ${word(on)} for the school` : `Program fees is ${word(on)} for this campus`),
  field: "Program fees",
  offSchool: "Turn program fees off for the school",
  onSchool: "Turn program fees on for the school",
  offCampus: "Turn program fees off for this campus",
  state: word,
  doneSchool: "The school's program fees setting is saved.",
};

export function ProgramFeesSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
