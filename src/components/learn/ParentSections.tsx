"use client";

import { useState } from "react";
import { FormsApiProvider } from "@/components/forms/FormsApi";
import { ForYouPanel } from "@/components/forms/ForYouPanel";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { ParentPractice } from "@/components/learn/ParentPractice";
import { ProgressFamilyPanel } from "@/components/learn/ProgressFamilyPanel";

// A guardian's page (task 0025): how question practice is going for the pupils linked to them, and the questionnaires addressed to guardians. Presentation only: the API decides which
// pupils, at what level, and which questionnaires are for this guardian.

const SECTIONS = [
  { id: "practice", label: "Practice" },
  { id: "progress", label: "Progress" },
  { id: "foryou", label: "For you" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function ParentSections({ schoolCode }: { schoolCode: string }) {
  return (
    <FormsApiProvider schoolCode={schoolCode}>
      <Sections schoolCode={schoolCode} />
    </FormsApiProvider>
  );
}

function Sections({ schoolCode }: { schoolCode: string }) {
  const [active, setActive] = useState<SectionId>("practice");
  return (
    <SectionTabs label="My children sections" idPrefix="mc" sections={SECTIONS} active={active} onChange={setActive}>
      {active === "practice" && <ParentPractice key="practice" />}
      {active === "progress" && <ProgressFamilyPanel key="progress" schoolCode={schoolCode} />}
      {active === "foryou" && <ForYouPanel key="foryou" />}
    </SectionTabs>
  );
}
