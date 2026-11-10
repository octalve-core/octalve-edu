"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { say } from "./say";
import {
  SURAH_OPTIONS,
  blankDraft,
  draftOf,
  lockText,
  ratingOptions,
  sameValues,
  valuesOf,
  type Draft,
} from "@/components/programs/progress-model";
import type { Column, TemplateSchema, Track } from "@/lib/programs/progress-templates";
import type { EntryView } from "@/lib/programs/progress-service";

// One entry, added or changed. Opening an existing entry to change it takes its lock (the holder's name is shown to everyone else, who can only read); a heartbeat keeps it while the dialog is
// open and "Viewing" is sent when it closes. The save carries the version the dialog opened at; the server refuses a stale one.

const HEARTBEAT_MS = 30_000;

type Props = {
  base: string;
  schema: TemplateSchema;
  track: Track;
  entry: EntryView | null;
  next: { surah: number; ayah: number } | null;
  today: string;
  requireVerification: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onOpenExisting: (entryId: string) => void;
};

export function ProgressEntryDialog({
  base,
  schema,
  track,
  entry,
  next,
  today,
  requireVerification,
  onClose,
  onSaved,
  onOpenExisting,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => (entry ? draftOf(track, entry.values) : blankDraft(track, next)));
  const [date, setDate] = useState(entry?.entryDate ?? today);
  const [pending, setPending] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lockedBy, setLockedBy] = useState<string | null>(
    entry?.lock && !entry.lock.mine ? lockText(entry.lock.holder, entry.lock.releasing) : null,
  );
  const held = useRef(false);
  const lockUrl = entry ? `${base}/entries/${encodeURIComponent(entry.id)}/lock` : null;

  useEffect(() => {
    if (!lockUrl) return;
    let alive = true;
    const hold = async () => {
      const reply = await sendJson(lockUrl, "POST", { action: "take" });
      if (!alive) return;
      if (reply.ok) {
        held.current = true;
        setLockedBy(null);
      } else if (reply.code === "LOCKED") setLockedBy(reply.message ?? "Someone else is editing this entry.");
    };
    void hold();
    const timer = setInterval(() => void hold(), HEARTBEAT_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      if (held.current) void sendJson(lockUrl, "POST", { action: "viewing" });
    };
  }, [lockUrl]);

  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>, hand: boolean) {
    event.preventDefault();
    setPending(hand ? "submit" : "save");
    setError(null);
    const values = valuesOf(track, draft);
    let reply: Reply;
    if (entry) {
      if (sameValues(values, entry.values) && !hand) {
        setPending(null);
        return onSaved("Nothing was changed.");
      }
      reply = await sendJson(`${base}/entries/${encodeURIComponent(entry.id)}`, "PATCH", { values, version: entry.version, submit: hand });
    } else reply = await sendJson(`${base}/entries`, "POST", { trackKey: track.key, entryDate: date, values, submit: hand });
    setPending(null);
    if (reply.ok) return onSaved(entry ? "The entry was changed." : "The entry was added.");
    if (reply.code === "EXISTS") {
      const id = reply.details?.find((d) => d.path === "entryId")?.message;
      if (id) return onOpenExisting(id);
    }
    const errors: Record<string, string> = {};
    for (const column of track.columns) {
      const message = problemFor(reply, `values.${column.key}`);
      if (message) errors[column.key] = message;
    }
    const dateProblem = problemFor(reply, "entryDate");
    if (dateProblem) errors.entryDate = dateProblem;
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setError(say(reply, "That didn't save."));
  }

  const readOnly = lockedBy !== null;
  return (
    <Dialog open onClose={onClose} title={`${entry ? "Change" : "Add"} ${track.label.en.toLowerCase()}`} wide>
      <form onSubmit={(e) => submit(e, false)} className="space-y-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}
        {lockedBy && <Alert variant="warning">{lockedBy}</Alert>}
        {entry?.returnComment && <Alert variant="info">Returned with a comment: {entry.returnComment}</Alert>}
        <TextField
          label="Date"
          type="date"
          value={date}
          max={today}
          disabled={Boolean(entry) || readOnly}
          error={fieldErrors.entryDate}
          onChange={(e) => setDate(e.target.value)}
        />
        {track.columns.map((column) => (
          <ColumnField
            key={column.key}
            column={column}
            schema={schema}
            draft={draft}
            set={set}
            disabled={readOnly}
            error={fieldErrors[column.key]}
          />
        ))}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button type="submit" loading={pending === "save"}>
              {entry ? "Save changes" : "Add entry"}
            </Button>
          )}
          {!readOnly && requireVerification && (!entry || entry.status === "DRAFT") && (
            <Button
              variant="secondary"
              loading={pending === "submit"}
              onClick={() => void submit({ preventDefault() {} } as FormEvent<HTMLFormElement>, true)}
            >
              {entry ? "Save and hand in" : "Add and hand in"}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export function ColumnField({
  column,
  schema,
  draft,
  set,
  disabled,
  error,
  compact = false,
  prefix = "",
}: {
  column: Column;
  schema: TemplateSchema;
  draft: Draft;
  set: (key: string, value: string) => void;
  disabled?: boolean;
  error?: string;
  compact?: boolean;
  /// Names the control for a screen reader where the visible label is shared by many rows (the week grid).
  prefix?: string;
}) {
  const name = `${prefix}${column.label.en}`;
  const hide = compact ? { hideLabel: true as const } : {};
  switch (column.type) {
    case "range":
      return (
        <fieldset className="space-y-2" disabled={disabled}>
          {!compact && <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">{column.label.en}</legend>}
          <div className={compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2"}>
            <SelectField
              {...hide}
              label={`${prefix}From surah`}
              value={draft[`${column.key}.fromSurah`] ?? ""}
              options={SURAH_OPTIONS}
              onChange={(e) => set(`${column.key}.fromSurah`, e.target.value)}
            />
            <TextField
              {...hide}
              label={`${prefix}From ayah`}
              inputMode="numeric"
              maxLength={3}
              value={draft[`${column.key}.fromAyah`] ?? ""}
              onChange={(e) => set(`${column.key}.fromAyah`, e.target.value.replace(/\D/g, ""))}
            />
            <SelectField
              {...hide}
              label={`${prefix}To surah`}
              value={draft[`${column.key}.toSurah`] ?? ""}
              options={SURAH_OPTIONS}
              onChange={(e) => set(`${column.key}.toSurah`, e.target.value)}
            />
            <TextField
              {...hide}
              label={`${prefix}To ayah`}
              inputMode="numeric"
              maxLength={3}
              value={draft[`${column.key}.toAyah`] ?? ""}
              onChange={(e) => set(`${column.key}.toAyah`, e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {error && <p className="text-xs text-danger-fg">{error}</p>}
        </fieldset>
      );
    case "note":
      return compact ? (
        <TextField
          hideLabel
          label={name}
          value={draft[column.key] ?? ""}
          maxLength={column.max ?? 500}
          disabled={disabled}
          error={error}
          onChange={(e) => set(column.key, e.target.value)}
        />
      ) : (
        <TextAreaField
          label={name}
          rows={3}
          value={draft[column.key] ?? ""}
          maxLength={column.max ?? 500}
          disabled={disabled}
          error={error}
          onChange={(e) => set(column.key, e.target.value)}
        />
      );
    case "rating":
      return (
        <SelectField
          {...hide}
          label={name}
          value={draft[column.key] ?? ""}
          options={ratingOptions(schema)}
          disabled={disabled}
          error={error}
          onChange={(e) => set(column.key, e.target.value)}
        />
      );
    case "surah":
      return (
        <SelectField
          {...hide}
          label={name}
          value={draft[column.key] ?? ""}
          options={SURAH_OPTIONS}
          disabled={disabled}
          error={error}
          onChange={(e) => set(column.key, e.target.value)}
        />
      );
    case "choice":
      return (
        <SelectField
          {...hide}
          label={name}
          value={draft[column.key] ?? ""}
          options={[{ value: "", label: "Not chosen" }, ...(column.options ?? []).map((o) => ({ value: o.value, label: o.en }))]}
          disabled={disabled}
          error={error}
          onChange={(e) => set(column.key, e.target.value)}
        />
      );
    default:
      return (
        <TextField
          {...hide}
          label={name}
          value={draft[column.key] ?? ""}
          maxLength={column.max ?? 80}
          disabled={disabled}
          error={error}
          onChange={(e) => set(column.key, e.target.value)}
        />
      );
  }
}
