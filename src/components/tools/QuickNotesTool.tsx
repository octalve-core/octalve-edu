"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon, TrashIcon } from "@/components/ui/icons";

const STORAGE_KEY = "octalve_quick_notes";

export function QuickNotesTool() {
  const [notes, setNotes] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);

  const handleChange = (val: string) => {
    setNotes(val);
    setSaved(false);
    try {
      localStorage.setItem(STORAGE_KEY, val);
      setSaved(true);
    } catch {
      // Ignore
    }
  };

  const handleCopy = async () => {
    if (!notes.trim()) return;
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleClear = () => {
    setNotes("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>Quick Scratchpad (auto-saved locally)</span>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] text-emerald-600">Saved</span>}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2 transition-colors"
            title="Copy notes"
          >
            {copied ? <CheckIcon className="h-3 w-3 text-emerald-600" /> : <CopyIcon className="h-3 w-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Clear notes"
          >
            <TrashIcon className="h-3 w-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="quick-scratchpad-area" className="sr-only">
          Scratchpad notes
        </label>
        <textarea
          id="quick-scratchpad-area"
          rows={10}
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Jot down quick parent phone numbers, memos, admission inquiries, or reminders here..."
          className="w-full rounded-2xl border border-line bg-canvas p-4 text-xs font-mono text-fg placeholder:text-fg-muted focus:border-brand-strong focus:outline-none"
        />
      </div>

      <div className="flex justify-between items-center text-[11px] text-fg-muted font-mono">
        <span>{notes.length} characters</span>
        <span>{notes.trim().split(/\s+/).filter(Boolean).length} words</span>
      </div>
    </div>
  );
}
