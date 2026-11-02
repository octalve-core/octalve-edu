"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { BankApiProvider } from "@/components/question-bank/BankApi";
import { PrintLogPanel } from "@/components/question-bank/PrintLogPanel";
import { QuestionsPanel } from "@/components/question-bank/QuestionsPanel";
import { MyReportsPanel } from "@/components/question-bank/MyReportsPanel";
import { ReportsPanel } from "@/components/question-bank/ReportsPanel";
import { ReviewersPanel } from "@/components/question-bank/ReviewersPanel";
import { SettingsPanel } from "@/components/question-bank/SettingsPanel";

export type Campus = { id: string; name: string };
export type BankPanelProps = {
  schoolCode: string;
  hasMfa: boolean;
  actorRole: "ADMIN" | "CAMPUS_ADMIN" | string;
  ownCampusId: string | null;
  campuses: Campus[];
};

// The Question bank page's sections behind one tab list: the same ARIA tabs pattern as the other settings screens (Left/Right/Home/End move between tabs, only the active
// section is mounted). Browse and My questions are for staff; the Review queue, Reports and Print log for reviewers; Reviewers and Settings for administrators. Presentation only: the question bank APIs decide who may do what.
export type BankSectionsProps = BankPanelProps & {
  isAdmin: boolean;
  canReview: boolean;
  writeCampuses: Campus[];
  wholeSchool: boolean;
};

export function QuestionBankSections({ isAdmin, canReview, writeCampuses, wholeSchool, ...props }: BankSectionsProps) {
  const sections = [
    { id: "browse", label: "Browse" },
    { id: "mine", label: "My questions" },
    { id: "myreports", label: "My reports" },
    ...(canReview
      ? [
          { id: "queue", label: "Review queue" },
          { id: "reports", label: "Reports" },
          { id: "prints", label: "Print log" },
        ]
      : []),
    ...(isAdmin
      ? [
          { id: "reviewers", label: "Reviewers" },
          { id: "settings", label: "Settings" },
        ]
      : []),
  ];
  const [active, setActive] = useState(sections[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = sections.findIndex((s) => s.id === active);
    const n = sections.length;
    const next =
      event.key === "ArrowRight"
        ? (at + 1) % n
        : event.key === "ArrowLeft"
          ? (at - 1 + n) % n
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? n - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(sections[next].id);
    refs.current[sections[next].id]?.focus();
  }

  return (
    <BankApiProvider schoolCode={props.schoolCode}>
      <div className="space-y-6">
        <div
          role="tablist"
          aria-label="Question bank sections"
          onKeyDown={onKeyDown}
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              type="button"
              role="tab"
              id={`qtab-${s.id}`}
              aria-selected={active === s.id}
              aria-controls={`qpanel-${s.id}`}
              tabIndex={active === s.id ? 0 : -1}
              onClick={() => setActive(s.id)}
              className={`min-h-11 flex-1 border-b-2 px-2 text-center text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                active === s.id ? "border-brand-strong text-fg" : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`qpanel-${active}`} aria-labelledby={`qtab-${active}`}>
          {(active === "browse" || active === "mine" || active === "queue") && (
            <QuestionsPanel key={active} view={active} writeCampuses={writeCampuses} wholeSchool={wholeSchool} />
          )}
          {active === "reports" && <ReportsPanel writeCampuses={writeCampuses} wholeSchool={wholeSchool} />}
          {active === "myreports" && <MyReportsPanel />}
          {active === "prints" && <PrintLogPanel />}
          {active === "reviewers" && <ReviewersPanel {...props} />}
          {active === "settings" && <SettingsPanel {...props} />}
        </div>
      </div>
    </BankApiProvider>
  );
}
