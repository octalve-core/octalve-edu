"use client";

import { useState } from "react";
import { FormsApiProvider } from "@/components/forms/FormsApi";
import { FormsList } from "@/components/forms/FormsList";
import { MarkingQueue } from "@/components/forms/MarkingQueue";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { useClassGroups } from "@/components/forms/useClassGroups";

// The Forms page's sections behind one tab list, the same ARIA tabs pattern as the Question bank (Left/Right/Home/End move between tabs, only the active section is mounted).
// Presentation only - the forms APIs decide who may do what, in which campus.

const SECTIONS = [
  { id: "practice", label: "Practice sets" },
  { id: "questionnaires", label: "Questionnaires" },
  { id: "paper", label: "Paper work" },
  { id: "marking", label: "Marking" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function FormsSections({ schoolCode }: { schoolCode: string }) {
  return (
    <FormsApiProvider schoolCode={schoolCode}>
      <Sections />
    </FormsApiProvider>
  );
}

function Sections() {
  const classGroups = useClassGroups();
  const [active, setActive] = useState<SectionId>("practice");
  return (
    <SectionTabs label="Forms sections" idPrefix="f" sections={SECTIONS} active={active} onChange={setActive}>
      {active === "practice" && <FormsList key="practice" kind="PRACTICE_SET" classGroups={classGroups} />}
      {active === "questionnaires" && <FormsList key="questionnaires" kind="QUESTIONNAIRE" classGroups={classGroups} />}
      {active === "paper" && <FormsList key="paper" kind="PAPER_WORK" classGroups={classGroups} />}
      {active === "marking" && <MarkingQueue key="marking" />}
    </SectionTabs>
  );
}
