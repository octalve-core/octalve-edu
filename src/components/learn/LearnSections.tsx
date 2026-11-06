"use client";

import { useState } from "react";
import { FormsApiProvider } from "@/components/forms/FormsApi";
import { PupilFormsTab } from "@/components/learn/PupilFormsTab";
import { PupilPracticeTab } from "@/components/learn/PupilPracticeTab";
import { SectionTabs } from "@/components/forms/SectionTabs";

// "My work" (task 0025, slices O3 and O4): a pupil's forms (practice sets, questionnaires, paper work) and their own question practice behind one tab list, the same ARIA tabs
// pattern as the rest of the app. A guardian has their own page (`/children`). Presentation only: the portal routes check who the person is and what they may see.

const SECTIONS = [
  { id: "forms", label: "Forms" },
  { id: "practice", label: "Practice" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function LearnSections({ schoolCode }: { schoolCode: string }) {
  return (
    <FormsApiProvider schoolCode={schoolCode}>
      <PupilSections />
    </FormsApiProvider>
  );
}

function PupilSections() {
  const [active, setActive] = useState<SectionId>("forms");
  return (
    <SectionTabs label="My work sections" idPrefix="lw" sections={SECTIONS} active={active} onChange={setActive}>
      {active === "forms" && <PupilFormsTab key="forms" />}
      {active === "practice" && <PupilPracticeTab key="practice" />}
    </SectionTabs>
  );
}
