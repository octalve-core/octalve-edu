"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { dayText } from "@/components/programs/model";
import { DisplayControls, Shown, useProgressDisplay } from "@/components/programs/ProgressDisplay";
import { ratingBi, rowPartsBi, surahBi, trackLabelBi } from "@/components/programs/progress-model";
import type { FamilyOverview, FamilyProgram } from "@/lib/programs/progress-family";
import { MESSAGES, bi, dateBi, type Bi, type Display } from "@/lib/programs/progress-display";
import type { Summary } from "@/lib/programs/progress-rules";

// The Progress tab in the portal (task 0027, slice R3). Read only, and showing ONLY what has been verified: a pupil sees their own entries; a guardian sees the summary, or every entry when the
// program allows it. "Seen" stands in for a signature and is required for nothing. Presentation only: the API applies the switches and decides what is sent at all.

export function PortalProgressTab({
  schoolCode,
  studentId,
  data,
  actor,
  onChanged,
}: {
  schoolCode: string;
  studentId: string;
  data: FamilyOverview;
  actor: string;
  onChanged: () => void;
}) {
  const [display, setDisplay] = useProgressDisplay();
  return (
    <div className="space-y-6">
      <div className="space-y-3 print:hidden">
        <DisplayControls display={display} onChange={setDisplay} />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      {data.programs.map((program) => (
        <ProgramCard
          key={program.participantId}
          schoolCode={schoolCode}
          studentId={studentId}
          program={program}
          actor={actor}
          display={display}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function SummaryBlock({ summary, program, title, display }: { summary: Summary; program: FamilyProgram; title: Bi; display: Display }) {
  const empty = summary.daysRecorded === 0 && summary.latest.length === 0;
  const day = (iso: string) => dateBi(iso, { calendar: display.calendar, adjust: program.template.hijriAdjust });
  const place = (at: { surah: number; ayah: number }): Bi => {
    const surah = surahBi(at.surah);
    return bi(`${surah.en} ${at.ayah}`, `${surah.ar ?? surah.en} ${at.ayah}`);
  };
  return (
    <div className="space-y-1 rounded-xl border border-line px-3 py-3 text-sm">
      <p className="font-semibold text-fg">
        <Shown value={title} display={display} />
      </p>
      {empty ? (
        <p className="text-fg-muted">
          <Shown value={MESSAGES.nothingVerified} display={display} />
        </p>
      ) : (
        <>
          <p className="text-fg-muted">
            <Shown value={MESSAGES.daysRecorded(summary.daysRecorded)} display={display} />
          </p>
          {summary.tracks.map((track) =>
            track.days === 0 ? null : (
              <p key={track.trackKey} className="break-words text-fg">
                <Shown
                  value={MESSAGES.trackLine(trackLabelBi(track), {
                    days: track.days,
                    ayat: track.ayat,
                    from: track.from ? place(track.from) : null,
                    to: track.to ? place(track.to) : null,
                    average: track.average,
                  })}
                  display={display}
                />
              </p>
            ),
          )}
          {summary.latest.map((latest) => {
            const date = day(latest.date);
            const grade = latest.grade !== null ? ratingBi(program.template, latest.grade) : null;
            const label = trackLabelBi(latest);
            return (
              <div key={latest.trackKey} className="break-words text-fg">
                <Shown
                  value={bi(
                    `${label.en} (${date.en})${grade ? `: ${grade.en}` : ""}`,
                    `${label.ar ?? label.en} (${date.ar ?? date.en})${grade ? `: ${grade.ar ?? grade.en}` : ""}`,
                  )}
                  display={display}
                />
                {latest.note ? <Shown value={bi(latest.note)} display={display} className="text-fg-muted" /> : null}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function ProgramCard({
  schoolCode,
  studentId,
  program,
  actor,
  display,
  onChanged,
}: {
  schoolCode: string;
  studentId: string;
  program: FamilyProgram;
  actor: string;
  display: Display;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seen = new Set(program.seen);
  const day = (iso: string) => dateBi(iso, { calendar: display.calendar, adjust: program.template.hijriAdjust });
  const weeks = program.summary.weeks.filter((w) => w.daysRecorded > 0 || w.latest.length > 0).slice(0, 4);

  async function markSeen(weekStart: string) {
    setBusy(weekStart);
    setError(null);
    try {
      const res = await fetch(`/api/v1/schools/${schoolCode}/portal/progress/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ studentId, programId: program.programId, weekStart }),
      });
      if (!res.ok) setError("That didn't save. Please try again.");
      else onChanged();
    } catch {
      setError("Can't reach the server. Check your internet connection and try again.");
    }
    setBusy(null);
  }

  return (
    <section aria-label={`Progress in ${program.programName}`} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <div>
        <h2 className="break-words text-lg font-semibold text-fg">{program.programName}</h2>
        <p className="break-words text-sm text-fg-muted">
          {program.groupName} · <Shown value={bi(program.template.name.en, program.template.name.ar)} display={display} />
        </p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <SummaryBlock summary={program.summary.month} program={program} title={MESSAGES.thisMonth} display={display} />
      {weeks.length > 0 && (
        <ul className="space-y-2" aria-label="Weeks">
          {weeks.map((week) => (
            <li key={week.from} className="space-y-2">
              <SummaryBlock summary={week} program={program} title={MESSAGES.weekOf(day(week.from))} display={display} />
              <div className="flex justify-end">
                {seen.has(week.from) ? (
                  <span className="text-xs text-fg-muted">You marked this week as seen.</span>
                ) : (
                  <Button
                    variant="secondary"
                    loading={busy === week.from}
                    aria-label={`Mark the week of ${dayText(week.from)} as seen`}
                    onClick={() => void markSeen(week.from)}
                  >
                    Mark as seen
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {program.detail === "SUMMARY" && actor === "GUARDIAN" && (
        <p className="text-xs text-fg-muted">This is a summary of what the teacher has recorded and the school has verified.</p>
      )}
      {program.detail === "FULL" && program.entries && (
        <div className="space-y-4">
          {program.profile && Object.keys(program.profile).length > 0 && (
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2" aria-label="Profile">
              {program.template.profile.flatMap((field) => {
                const value = program.profile?.[field.key];
                if (!value) return [];
                const option = field.options?.find((o) => o.value === value);
                return [
                  <div key={field.key}>
                    <dt className="text-xs text-fg-muted">
                      <Shown value={bi(field.label.en, field.label.ar)} display={display} />
                    </dt>
                    <dd className="text-fg">
                      <Shown value={option ? bi(option.en, option.ar) : bi(value)} display={display} />
                    </dd>
                  </div>,
                ];
              })}
            </dl>
          )}
          {program.template.tracks.map((track) => {
            const rows = program.entries!.filter((entry) => entry.trackKey === track.key);
            if (rows.length === 0) return null;
            return (
              <section key={track.key} aria-label={`${track.label.en} entries`} className="space-y-2">
                <h3 className="text-base font-semibold text-fg">
                  <Shown value={trackLabelBi(track)} display={display} />
                </h3>
                <ul className="space-y-2">
                  {rows.map((entry) => (
                    <li key={entry.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                      <div className="font-medium text-fg">
                        <Shown value={day(entry.entryDate)} display={display} />
                      </div>
                      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {rowPartsBi(track, entry.values, program.template).map((part) => (
                          <div key={part.key}>
                            <dt className="text-xs text-fg-muted">
                              <Shown value={part.label} display={display} />
                            </dt>
                            <dd className="break-words whitespace-pre-line text-fg">
                              <Shown value={part.text} display={display} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
