"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

/// A row of tabs with the one panel under it, the ARIA tabs pattern used across the app (Left/Right/Home/End move between the tabs; the children are the active panel's content,
/// so only the active section is mounted). Presentation only.
export function SectionTabs<Id extends string>({
  label,
  idPrefix,
  sections,
  active,
  onChange,
  children,
}: {
  label: string;
  idPrefix: string;
  sections: readonly { id: Id; label: string }[];
  active: Id;
  onChange: (id: Id) => void;
  children: ReactNode;
}) {
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
    onChange(sections[next]!.id);
    refs.current[sections[next]!.id]?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 print:hidden"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}tab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`${idPrefix}panel-${s.id}`}
            tabIndex={active === s.id ? 0 : -1}
            onClick={() => onChange(s.id)}
            className={`min-h-11 flex-1 border-b-2 px-2 text-center text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
              active === s.id ? "border-brand-strong text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${idPrefix}panel-${active}`} aria-labelledby={`${idPrefix}tab-${active}`}>
        {children}
      </div>
    </>
  );
}
