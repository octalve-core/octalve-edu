"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson, sendJson } from "@/components/auth/postJson";
import { dayText } from "@/components/programs/model";
import { say } from "./say";
import { ColumnField } from "@/components/programs/ProgressEntryDialog";
import { blankDraft, draftOf, sameValues, valuesOf, type Draft } from "@/components/programs/progress-model";
import { addDays, weekDates, weekStartOf } from "@/lib/programs/progress-rules";
import type { EntryView, RecordView } from "@/lib/programs/progress-service";

// The week grid that mirrors the paper booklet: one row per day for each track that has one row a day. Nothing is saved until "Save the week", and then only the days that changed, in one
// save that is all or nothing.

type Props = {
  base: string;
  record: RecordView;
  today: string;
  onSaved: (message: string) => void;
};

export function ProgressWeekGrid({ base, record, today, onSaved }: Props) {
  const schema = record.template!.schema;
  const tracks = schema.tracks.filter((track) => track.kind === "table" && track.oneRowPerDay);
  const [weekStart, setWeekStart] = useState(weekStartOf(today, schema.weekStart));
  const days = useMemo(() => weekDates(weekStart, schema), [weekStart, schema]);
  const [entries, setEntries] = useState<EntryView[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "submit" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const mayWrite = record.rights.write;

  useEffect(() => {
    const controller = new AbortController();
    void getJson(`${base}?from=${weekStart}&to=${addDays(weekStart, 6)}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The week couldn't be loaded."));
      const loaded = (reply.data as unknown as RecordView).entries;
      setFailed(null);
      setEntries(loaded);
      const next: Record<string, Draft> = {};
      for (const track of tracks)
        for (const day of days) {
          const found = loaded.find((e) => e.trackKey === track.key && e.entryDate === day);
          next[`${track.key}|${day}`] = found ? draftOf(track, found.values) : blankDraft(track);
        }
      setDrafts(next);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, weekStart, version]);

  const changed = useMemo(() => {
    if (!entries) return [];
    const rows: { id?: string; trackKey: string; entryDate: string; values: Record<string, unknown>; version?: number }[] = [];
    for (const track of tracks)
      for (const day of days) {
        const draft = drafts[`${track.key}|${day}`];
        if (!draft) continue;
        const values = valuesOf(track, draft);
        const found = entries.find((e) => e.trackKey === track.key && e.entryDate === day);
        if (Object.keys(values).length === 0) continue;
        if (found && sameValues(values, found.values)) continue;
        rows.push({ ...(found ? { id: found.id, version: found.version } : {}), trackKey: track.key, entryDate: day, values });
      }
    return rows;
  }, [drafts, entries, days, tracks]);

  const waiting = (entries ?? []).filter((e) => e.status === "SUBMITTED");
  const mayVerify = record.rights.verify && waiting.some((e) => e.canVerify);

  async function save(submit: boolean) {
    setSaving(submit ? "submit" : "save");
    setNotice(null);
    setFailed(null);
    const reply = await sendJson(`${base}/week`, "PUT", { rows: changed, submit });
    setSaving(null);
    if (!reply.ok) return setFailed(say(reply, "The week didn't save."));
    setNotice(`${changed.length} ${changed.length === 1 ? "day was" : "days were"} saved.`);
    setVersion((v) => v + 1);
    onSaved("The week was saved.");
  }

  async function verify() {
    setSaving("save");
    const reply = await sendJson(`${base}/verify-week`, "POST", { weekStart });
    setSaving(null);
    if (!reply.ok) return setFailed(say(reply, "The week couldn't be verified."));
    setNotice(`${(reply.data as { verified: number }).verified} entries were verified.`);
    setVersion((v) => v + 1);
    onSaved("The week was verified.");
  }

  const label = (day: string) => dayText(day);
  return (
    <section aria-label="Week grid" className="space-y-4 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">Week of {label(weekStart)}</h3>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            Earlier week
          </Button>
          <Button variant="ghost" disabled={addDays(weekStart, 7) > today} onClick={() => setWeekStart((w) => addDays(w, 7))}>
            Later week
          </Button>
        </div>
      </div>
      {failed && <Alert variant="error">{failed}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {!entries && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {entries &&
        tracks.map((track) => (
          <div key={track.key} className="space-y-2">
            <h4 className="text-sm font-semibold text-fg">{track.label.en}</h4>
            <ul className="space-y-2" aria-label={`${track.label.en} this week`}>
              {days.map((day) => {
                const key = `${track.key}|${day}`;
                const found = entries.find((e) => e.trackKey === track.key && e.entryDate === day);
                const blocked = !mayWrite || day > today || (found ? !found.canEdit : false);
                return (
                  <li key={key} className="space-y-2 rounded-lg border border-line px-3 py-2">
                    <p className="text-sm font-medium text-fg">
                      {label(day)}
                      {found ? (
                        <span className="ml-2 text-xs text-fg-muted">
                          ({found.status === "VERIFIED" ? "verified" : found.status === "SUBMITTED" ? "handed in" : "draft"})
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-start gap-3">
                      {track.columns.map((column) => (
                        <ColumnField
                          key={column.key}
                          column={column}
                          schema={schema}
                          compact
                          prefix={`${track.label.en} ${label(day)} `}
                          draft={drafts[key] ?? blankDraft(track)}
                          disabled={blocked}
                          set={(k, v) =>
                            setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? blankDraft(track)), [k]: v } }))
                          }
                        />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      {tracks.length === 0 && (
        <p className="text-sm text-fg-muted">This template has no part with one row a day, so there is no week grid.</p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {mayVerify && (
          <Button variant="secondary" loading={saving === "save"} onClick={() => void verify()}>
            Verify the week
          </Button>
        )}
        {mayWrite && (
          <Button disabled={changed.length === 0} loading={saving === "save"} onClick={() => void save(false)}>
            Save the week
          </Button>
        )}
        {mayWrite && record.settings.requireVerification && (
          <Button variant="secondary" disabled={changed.length === 0} loading={saving === "submit"} onClick={() => void save(true)}>
            Save and hand in the week
          </Button>
        )}
      </div>
    </section>
  );
}
