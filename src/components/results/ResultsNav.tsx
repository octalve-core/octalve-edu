import Link from "next/link";
import { FOCUS_RING } from "@/components/shell/nav";

export const RESULT_TABS = [
  { key: "marks", label: "Marks" },
  { key: "review", label: "Review" },
  { key: "cards", label: "Report cards" },
] as const;
export type ResultTab = (typeof RESULT_TABS)[number]["key"];
export const isResultTab = (value: unknown): value is ResultTab => RESULT_TABS.some((t) => t.key === value);

/// The parts of Results, as real links (the address says which one you are on, so reload and the back button work).
export function ResultsNav({ schoolCode, current, hide = [] }: { schoolCode: string; current: ResultTab; hide?: readonly ResultTab[] }) {
  return (
    <nav aria-label="Results sections" className="mt-6 border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {RESULT_TABS.filter((tab) => !hide.includes(tab.key)).map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key} className="shrink-0">
              <Link
                href={`/schools/${schoolCode}/results?tab=${tab.key}`}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold transition-colors ${FOCUS_RING} ${
                  active ? "border-brand-fg text-fg" : "border-transparent text-fg-muted hover:text-fg"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
