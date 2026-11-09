"use client";

import { SwitchSettingPanel, type SwitchWords } from "./SwitchSettingPanel";

// Programs (task 0027): are programs switched on for the school? The school's value is the ceiling; a campus can only turn them off for itself.

const word = (on: boolean) => (on ? "on" : "off");

const WORDS: SwitchWords = {
  endpoint: "programs",
  headingId: "programs-setting-heading",
  heading: "Programs",
  intro:
    "Programs are learning that is not a normal class (a memorisation program, a short course). Turn them off and nothing can be made or changed (what exists can still be read by the school's administrator); turn them on and everything is back. A campus can turn programs off for itself but never on over the school.",
  about: (on, where) => (where === "school" ? `Programs are ${word(on)} for the school` : `Programs are ${word(on)} for this campus`),
  field: "Programs",
  offSchool: "Turn programs off for the school",
  onSchool: "Turn programs on for the school",
  offCampus: "Turn programs off for this campus",
  state: word,
  doneSchool: "The school's setting is saved.",
};

export function ProgramsSettingsPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  return <SwitchSettingPanel schoolCode={schoolCode} hasMfa={hasMfa} words={WORDS} />;
}
