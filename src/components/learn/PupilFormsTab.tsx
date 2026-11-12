"use client";

import { useState } from "react";
import { PupilPaperWork } from "@/components/learn/PupilPaperWork";
import { PupilPracticeSets } from "@/components/learn/PupilPracticeSets";
import { PupilQuestionnaires } from "@/components/learn/PupilQuestionnaires";
import { SectionTabs } from "@/components/forms/SectionTabs";

// The pupil's Forms section of "My work" (task 0025, slice O3): practice sets, questionnaires and paper work. Offered to a pupil only: every portal forms route refuses anyone else, so
// the page does not draw a tab the API would refuse. Presentation only.

const SECTIONS = [
  { id: "practice", label: "Practice sets" },
  { id: "questionnaires", label: "Questionnaires" },
  { id: "paper", label: "Paper work" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function PupilFormsTab() {
  const [active, setActive] = useState<SectionId>("practice");
  return (
    <SectionTabs label="Forms sections" idPrefix="pf" sections={SECTIONS} active={active} onChange={setActive}>
      {active === "practice" && <PupilPracticeSets key="practice" />}
      {active === "questionnaires" && <PupilQuestionnaires key="questionnaires" />}
      {active === "paper" && <PupilPaperWork key="paper" />}
    </SectionTabs>
  );
}
