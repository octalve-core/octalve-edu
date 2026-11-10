"use client";

import { useSyncExternalStore } from "react";
import { SelectField } from "@/components/ui/SelectField";
import {
  DEFAULT_DISPLAY,
  DISPLAY_STORAGE_KEY,
  arabicText,
  parseDisplay,
  type Bi,
  type CalendarMode,
  type Display,
  type DigitMode,
  type Lang,
} from "@/lib/programs/progress-display";

// Progress records, slice R4 (task 0030, section 10): the viewer's choice of language, calendar and digits, kept on this device, and the pieces that show a text in that choice. Nothing here
// reaches the server: what is stored does not change, only how it is shown.

let memory: Display | null = null;
let current: Display = DEFAULT_DISPLAY;
const listeners = new Set<() => void>();

const same = (a: Display, b: Display) => a.lang === b.lang && a.calendar === b.calendar && a.digits === b.digits;

/// The stored choice, as the same object while it has not changed (what useSyncExternalStore needs).
function read(): Display {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY);
  } catch {
    raw = null;
  }
  const next = raw !== null ? parseDisplay(raw) : (memory ?? DEFAULT_DISPLAY);
  if (!same(next, current)) current = next;
  return current;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DISPLAY_STORAGE_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function setDisplay(next: Display) {
  memory = next;
  try {
    window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private window or blocked storage: the choice still holds for this visit, held in memory
  }
  for (const listener of listeners) listener();
}

/// The viewer's choice (English, Gregorian and 0-9 until they make one) and a way to change it.
export function useProgressDisplay(): [Display, (next: Display) => void] {
  const display = useSyncExternalStore(subscribe, read, () => DEFAULT_DISPLAY);
  return [display, setDisplay];
}

/// One text in the viewer's language(s): English, Arabic (right to left, in the chosen digits) or both side by side on a wide screen and stacked on a phone.
/// Words somebody typed have no Arabic side: they are shown once, as typed, whatever the language.
export function Shown({ value, display, className = "" }: { value: Bi; display: Display; className?: string }) {
  if (value.ar === null)
    return (
      <span className={`block ${className}`} dir="auto">
        {value.en}
      </span>
    );
  if (display.lang === "en") return <span className={`block ${className}`}>{value.en}</span>;
  const arabic = (
    <span className={`block ${className}`} dir="rtl" lang="ar">
      {arabicText(value.ar, display.digits)}
    </span>
  );
  if (display.lang === "ar") return arabic;
  return (
    <span className="block gap-x-6 sm:grid sm:grid-cols-2">
      <span className={`block ${className}`}>{value.en}</span>
      {arabic}
    </span>
  );
}

/// The same, as a plain string for a place that takes text (a label of a button, a title): the first language shown.
export const plain = (value: Bi, display: Display): string =>
  display.lang === "ar" && value.ar !== null ? arabicText(value.ar, display.digits) : value.en;

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "both", label: "English and Arabic" },
];
const CALENDAR_OPTIONS = [
  { value: "gregorian", label: "Gregorian" },
  { value: "hijri", label: "Hijri" },
  { value: "both", label: "Both" },
];
const DIGIT_OPTIONS = [
  { value: "western", label: "0 1 2 3" },
  { value: "arabic", label: "٠ ١ ٢ ٣" },
];

/// The three choices. Digits are offered only when Arabic is shown (English always uses 0-9).
export function DisplayControls({ display, onChange }: { display: Display; onChange: (next: Display) => void }) {
  return (
    <div role="group" aria-label="How this record is shown" className="grid gap-3 sm:grid-cols-3 print:hidden">
      <SelectField
        label="Language"
        options={LANG_OPTIONS}
        value={display.lang}
        onChange={(e) => onChange({ ...display, lang: e.target.value as Lang })}
      />
      <SelectField
        label="Dates"
        options={CALENDAR_OPTIONS}
        value={display.calendar}
        onChange={(e) => onChange({ ...display, calendar: e.target.value as CalendarMode })}
      />
      {display.lang !== "en" && (
        <SelectField
          label="Digits"
          options={DIGIT_OPTIONS}
          value={display.digits}
          onChange={(e) => onChange({ ...display, digits: e.target.value as DigitMode })}
        />
      )}
    </div>
  );
}
