"use client";

import { useState } from "react";
import { PracticeHistory } from "@/components/learn/PracticeHistory";
import { PracticeNow } from "@/components/learn/PracticeNow";
import { PracticeReports } from "@/components/learn/PracticeReports";
import { SectionTabs } from "@/components/forms/SectionTabs";

// The pupil's Practice section of "My work" (task 0025, slice O4): Practise now, History, My reports. A guardian is not shown these: the routes that start, answer, finish, archive,
// report and print refuse anyone but the pupil, so the screen does not offer them (a guardian has their own page, `ParentPractice`). Presentation only.

const SECTIONS = [
  { id: "now", label: "Practise now" },
  { id: "history", label: "History" },
  { id: "reports", label: "My reports" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function PupilPracticeTab() {
  const [active, setActive] = useState<SectionId>("now");
  return (
    <SectionTabs label="Practice sections" idPrefix="pp" sections={SECTIONS} active={active} onChange={setActive}>
      {active === "now" && <PracticeNow key="now" />}
      {active === "history" && <PracticeHistory key="history" canAct />}
      {active === "reports" && <PracticeReports key="reports" />}
    </SectionTabs>
  );
}
