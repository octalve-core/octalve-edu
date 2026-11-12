"use client";

import { useProgramBase } from "./program-base";
import { say } from "./say";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";
import { dayText, when, type ProgramDetail } from "@/components/programs/model";
import { ProgressEntryDialog } from "@/components/programs/ProgressEntryDialog";
import { ProgressWeekGrid } from "@/components/programs/ProgressWeekGrid";
import { DisplayControls, Shown, useProgressDisplay } from "@/components/programs/ProgressDisplay";
import { ProgressPrintSheet } from "@/components/programs/ProgressPrintSheet";
import { STATUS_STYLE, rowPartsBi, trackLabelBi } from "@/components/programs/progress-model";
import { MESSAGES, PLACE_BI, STATUS_BI, bi, dateBi } from "@/lib/programs/progress-display";
import { addDays, sameJson } from "@/lib/programs/progress-rules";
import type { EntryView, RecordView, RevisionView } from "@/lib/programs/progress-service";
import type { Track } from "@/lib/programs/progress-templates";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";

// One person's progress record: the profile, the entries of each track, the week grid, and - for the people who may - handing in, verifying and returning. Presentation only: the API decides
// everything, and every save carries the version this screen saw.

type Props = { program: ProgramDetail; personId: string; onBack: () => void };
type Editing = { track: Track; entry: EntryView | null } | null;

export function ProgressRecordView({ program, personId, onBack }: Props) {
  const programBase = useProgramBase();
  const base = `${programBase}/progress/people/${encodeURIComponent(personId)}`;
  const [record, setRecord] = useState<RecordView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [grid, setGrid] = useState(false);
  const [history, setHistory] = useState<{ entry: EntryView; rows: RevisionView[] } | null>(null);
  const [returning, setReturning] = useState<EntryView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [display, setDisplay] = useProgressDisplay();

  useEffect(() => {
    const controller = new AbortController();
    void getJson(from ? `${base}?from=${from}` : base, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The record couldn't be loaded."));
      setFailed(null);
      setRecord(reply.data as unknown as RecordView);
    });
    return () => controller.abort();
  }, [base, from, version]);

  const reload = (message?: string) => {
    if (message) setNotice(message);
    setEditing(null);
    setVersion((v) => v + 1);
  };

  async function act(entry: EntryView, body: Record<string, unknown>, done: string) {
    setBusy(entry.id);
    setNotice(null);
    const reply = await sendJson(`${base}/entries/${encodeURIComponent(entry.id)}`, "POST", { ...body, version: entry.version });
    setBusy(null);
    if (!reply.ok) return setFailed(say(reply, "That didn't work."));
    setFailed(null);
    reload(done);
  }

  async function showHistory(entry: EntryView) {
    const reply = await getJson(`${base}/entries/${encodeURIComponent(entry.id)}/history`);
    if (!reply.ok) return setFailed(say(reply, "The history couldn't be loaded."));
    setHistory({ entry, rows: reply.data as unknown as RevisionView[] });
  }

  if (failed && !record)
    return (
      <div className="space-y-3">
        <Alert variant="error">{failed}</Alert>
        <Button variant="ghost" onClick={onBack}>
          Back to the people
        </Button>
      </div>
    );
  if (!record) return <p className="text-sm text-fg-muted">Loading…</p>;
  const schema = record.template?.schema;
  const today = new Date().toISOString().slice(0, 10);
  const hasGrid = !!schema?.tracks.some((track) => track.kind === "table" && track.oneRowPerDay);
  const adjust = record.settings.hijriAdjust;
  const dt = (iso: string) => dateBi(iso, { calendar: display.calendar, adjust });
  const place = PLACE_BI[record.person.placeState] ?? bi(record.person.placeState);
  const joined = dt(record.person.joinedOn);
  const personLine = bi(
    `${record.person.groupPath} · ${place.en} · joined ${joined.en}`,
    `${record.person.groupPath} · ${place.ar ?? place.en} · انضم في ${joined.ar ?? joined.en}`,
  );
  const shownFrom = dt(record.from);
  const shownTo = dt(record.to);

  return (
    <>
      <section aria-labelledby="progress-person" className="space-y-4 rounded-2xl border border-line bg-surface p-4 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="progress-person" className="break-words text-lg font-semibold text-fg">
              {record.person.name}
            </h2>
            <p className="break-words text-sm text-fg-muted">
              <Shown value={personLine} display={display} />
            </p>
            {record.person.guardianName || record.person.guardianPhone ? (
              <p className="break-words text-xs text-fg-muted">
                Guardian: {[record.person.guardianName, record.person.guardianPhone].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {schema && (
              <Button variant="secondary" onClick={() => window.print()}>
                Print
              </Button>
            )}
            <Button variant="ghost" onClick={onBack}>
              Back to the people
            </Button>
          </div>
        </div>
        {schema && <DisplayControls display={display} onChange={setDisplay} />}
        {failed && <Alert variant="error">{failed}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
        {!record.rights.write && record.rights.whyNot && <Alert variant="info">{record.rights.whyNot}</Alert>}
        {schema && (
          <>
            {schema.profile.length > 0 && <ProfileForm base={base} record={record} onSaved={reload} />}
            {hasGrid && (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setGrid((g) => !g)}>
                  {grid ? "Hide the week grid" : "Week grid"}
                </Button>
              </div>
            )}
            {grid && <ProgressWeekGrid base={base} record={record} today={today} onSaved={(m) => reload(m)} />}
            {schema.tracks.map((track) => {
              const entries = record.entries.filter((e) => e.trackKey === track.key);
              return (
                <section key={track.key} aria-label={track.label.en} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-fg">
                      <Shown value={trackLabelBi(track)} display={display} />
                    </h3>
                    {record.rights.write && (
                      <Button variant="secondary" onClick={() => setEditing({ track, entry: null })}>
                        Add to {track.label.en.toLowerCase()}
                      </Button>
                    )}
                  </div>
                  {entries.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-fg-muted">
                      <Shown value={MESSAGES.nothingYet} display={display} />
                    </p>
                  ) : (
                    <ul className="space-y-2" aria-label={`${track.label.en} entries`}>
                      {entries.map((entry) => (
                        <li key={entry.id} className="space-y-1 rounded-xl border border-line px-3 py-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 font-semibold text-fg">
                              <Shown value={dt(entry.entryDate)} display={display} />
                            </div>
                            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[entry.status]}`}>
                              <Shown value={STATUS_BI[entry.status]} display={display} />
                            </span>
                          </div>
                          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                            {rowPartsBi(track, entry.values, schema).map((part) => (
                              <div key={part.key} className="min-w-0">
                                <dt className="text-xs text-fg-muted">
                                  <Shown value={part.label} display={display} />
                                </dt>
                                <dd className="break-words whitespace-pre-line text-fg">
                                  <Shown value={part.text} display={display} />
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <p className="text-xs text-fg-muted">
                            Last saved by {entry.lastEditedBy}, {when(entry.lastEditedAt)}
                            {entry.verifiedBy ? ` · verified by ${entry.verifiedBy}` : ""}
                            {entry.status !== "VERIFIED" && entry.published ? " · families still see the last verified copy" : ""}
                          </p>
                          {entry.returnComment && <p className="text-xs text-warn-fg">Returned: {entry.returnComment}</p>}
                          {entry.lock && !entry.lock.mine && (
                            <p className="text-xs text-fg-muted">{entry.lock.holder} is editing this entry.</p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {entry.canEdit && (
                              <Button
                                variant="secondary"
                                aria-label={`Change the ${track.label.en.toLowerCase()} entry of ${dayText(entry.entryDate)}`}
                                onClick={() => setEditing({ track, entry })}
                              >
                                Change
                              </Button>
                            )}
                            {entry.canEdit && record.settings.requireVerification && entry.status === "DRAFT" && (
                              <Button
                                variant="secondary"
                                loading={busy === entry.id}
                                aria-label={`Hand in the ${track.label.en.toLowerCase()} entry of ${dayText(entry.entryDate)}`}
                                onClick={() => void act(entry, { action: "submit" }, "The entry was handed in.")}
                              >
                                Hand in
                              </Button>
                            )}
                            {entry.canVerify && (
                              <>
                                <Button
                                  loading={busy === entry.id}
                                  aria-label={`Verify the ${track.label.en.toLowerCase()} entry of ${dayText(entry.entryDate)}`}
                                  onClick={() => void act(entry, { action: "verify" }, "The entry was verified.")}
                                >
                                  Verify
                                </Button>
                                <Button
                                  variant="secondary"
                                  aria-label={`Return the ${track.label.en.toLowerCase()} entry of ${dayText(entry.entryDate)}`}
                                  onClick={() => setReturning(entry)}
                                >
                                  Return
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              aria-label={`History of the ${track.label.en.toLowerCase()} entry of ${dayText(entry.entryDate)}`}
                              onClick={() => void showHistory(entry)}
                            >
                              History
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
              <span>
                <Shown
                  value={bi(
                    `Showing ${shownFrom.en} to ${shownTo.en}.`,
                    `يُعرض من ${shownFrom.ar ?? shownFrom.en} إلى ${shownTo.ar ?? shownTo.en}.`,
                  )}
                  display={display}
                />
                {record.truncated ? " Some entries are not shown; narrow the dates." : ""}
              </span>
              <Button variant="ghost" onClick={() => setFrom(addDays(record.from, -28))}>
                Show 4 earlier weeks
              </Button>
            </div>
            {record.seen.length > 0 && (
              <p className="text-xs text-fg-muted">
                Seen by the family:{" "}
                {record.seen
                  .slice(0, 4)
                  .map((s) => `${s.actor === "PUPIL" ? "pupil" : "guardian"}, week of ${dayText(s.weekStart)}`)
                  .join("; ")}
                .
              </p>
            )}
          </>
        )}
        {editing && schema && (
          <ProgressEntryDialog
            key={editing.entry?.id ?? `new-${editing.track.key}`}
            base={base}
            schema={schema}
            track={editing.track}
            entry={editing.entry}
            next={record.next[editing.track.key] ?? null}
            today={today}
            requireVerification={record.settings.requireVerification}
            onClose={() => reload()}
            onSaved={(message) => reload(message)}
            onOpenExisting={(id) => {
              const found = record.entries.find((e) => e.id === id);
              if (found) setEditing({ track: editing.track, entry: found });
              else reload("That day already has an entry. It is in the list below.");
            }}
          />
        )}
        <ReturnDialog
          entry={returning}
          onClose={() => setReturning(null)}
          onReturn={async (comment) => {
            const target = returning!;
            const reply = await sendJson(`${base}/entries/${encodeURIComponent(target.id)}`, "POST", {
              action: "return",
              version: target.version,
              comment,
            });
            if (!reply.ok) return problemFor(reply, "comment") ?? say(reply, "That didn't work.");
            setReturning(null);
            reload("The entry was returned.");
            return null;
          }}
        />
        <Dialog open={history !== null} onClose={() => setHistory(null)} title="History of this entry" wide>
          {history && (
            <div className="space-y-3">
              <ul className="space-y-2" aria-label="Changes">
                {history.rows.map((row) => (
                  <li key={row.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <p className="font-medium text-fg">
                      {row.action.toLowerCase()} · {row.by} · {when(row.at)}
                    </p>
                    {row.note && <p className="text-xs text-fg-muted">{row.note}</p>}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button variant="ghost" data-initial-focus onClick={() => setHistory(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </section>
      {schema && <ProgressPrintSheet programName={program.name} record={record} display={display} />}
    </>
  );
}

function ReturnDialog({
  entry,
  onClose,
  onReturn,
}: {
  entry: EntryView | null;
  onClose: () => void;
  onReturn: (comment: string) => Promise<string | null>;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(await onReturn(comment));
    setPending(false);
  }
  return (
    <Dialog
      open={entry !== null}
      onClose={onClose}
      title="Return this entry"
      description="It goes back to its writer as a draft, with your comment."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        <TextAreaField
          label="Comment for the writer"
          rows={3}
          value={comment}
          maxLength={300}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Return entry
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ProfileForm({ base, record, onSaved }: { base: string; record: RecordView; onSaved: (message?: string) => void }) {
  const schema = record.template!.schema;
  const [values, setValues] = useState<Record<string, string>>(record.record?.profile ?? {});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const may = record.rights.write;
  const unchanged = sameJson(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== "")), record.record?.profile ?? {});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const reply = await sendJson(base, "PUT", { values, ...(record.record ? { version: record.record.version } : {}) });
    setPending(false);
    if (reply.ok) return onSaved("The profile was saved.");
    setError(say(reply, "The profile didn't save."));
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line p-3" aria-label="Profile" noValidate>
      <h3 className="text-base font-semibold text-fg">Profile</h3>
      <p className="text-xs text-fg-muted">
        What the school does not already know. The name, class and guardian come from the person&apos;s own record.
      </p>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        {schema.profile.map((field) =>
          field.type === "choice" ? (
            <SelectField
              key={field.key}
              label={field.label.en}
              value={values[field.key] ?? ""}
              disabled={!may}
              options={[{ value: "", label: "Not chosen" }, ...(field.options ?? []).map((o) => ({ value: o.value, label: o.en }))]}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            />
          ) : (
            <TextField
              key={field.key}
              label={field.label.en}
              value={values[field.key] ?? ""}
              maxLength={field.max ?? 80}
              disabled={!may}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            />
          ),
        )}
      </div>
      {may && (
        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={unchanged}>
            Save profile
          </Button>
        </div>
      )}
    </form>
  );
}
