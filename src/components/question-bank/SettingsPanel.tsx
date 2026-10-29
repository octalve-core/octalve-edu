"use client";

import { useMemo, useState } from "react";
import { failureText, useApi } from "@/components/academics/useApi";
import { sendJson } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { StepUpModal, type StepUpChange } from "@/components/settings/StepUpModal";
import type { BankPanelProps } from "@/components/question-bank/QuestionBankSections";
import type { BankSettingRow } from "@/lib/question-bank/settings-service";

// The question bank's switches (task 0024 slice B). The school's administrator sets the school's values (and may look at any campus); a campus can only make a switch stricter than
// the school's, and "use the school's value" clears the campus's own. Every save asks for the fresh proof first. Presentation only: the API decides, and says in words what it
// refused.

type StepUp = { type: "totp" | "recovery" | "password"; value: string };
type Value = BankSettingRow["effective"];
/// What is typed for each switch: a flag is on or off, a list is one line of text, the rest a text field's contents; `null` = "use the school's value" (a campus only).
type Draft = boolean | string | null;

const SCHOOL = "school";
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const show = (row: BankSettingRow, value: Value | null): string => {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (Array.isArray(value)) return value.join(", ");
  if (row.kind === "choice") return row.choices?.find((c) => c.value === value)?.label ?? String(value);
  return `${value}${row.unit ? ` ${row.unit}` : ""}`;
};
const asText = (value: Value): string => (Array.isArray(value) ? value.join(", ") : String(value));
/// A typed value as the API takes it (the server checks it and says what is wrong: a number that is not one stays a string so it is refused, not guessed).
function parseDraft(row: BankSettingRow, draft: Draft): unknown {
  if (draft === null || typeof draft === "boolean") return draft;
  if (row.kind === "presets")
    return draft
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
  if (row.kind === "choice") return draft;
  return draft.trim() === "" ? draft : Number(draft);
}

export function SettingsPanel({ schoolCode, hasMfa, actorRole, ownCampusId, campuses }: BankPanelProps) {
  const isAdmin = actorRole === "ADMIN";
  const base = `/api/v1/schools/${schoolCode}/question-bank/settings`;
  const [where, setWhere] = useState(isAdmin ? SCHOOL : (ownCampusId ?? SCHOOL));
  const api = useApi(where === SCHOOL ? base : `${base}?campusId=${encodeURIComponent(where)}`);
  const rows = (api.reply?.data as { settings: BankSettingRow[] } | undefined)?.settings;
  const editingSchool = where === SCHOOL;
  const campusName = campuses.find((c) => c.id === where)?.name ?? "the campus";

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /// What is stored for the place being edited: the school's value, or the campus's own (null when it has none).
  const stored = (row: BankSettingRow): Value | null => (editingSchool ? row.school : row.override);
  /// What the control shows: the typed draft, else what is stored, else (a campus with no value of its own) what applies.
  const shown = (row: BankSettingRow): Draft => {
    if (Object.hasOwn(drafts, row.key)) return drafts[row.key];
    const value = stored(row) ?? row.effective;
    return typeof value === "boolean" ? value : asText(value);
  };

  const changes = useMemo(() => {
    const out: { row: BankSettingRow; value: unknown }[] = [];
    for (const row of rows ?? []) {
      if (!Object.hasOwn(drafts, row.key)) continue;
      const value = parseDraft(row, drafts[row.key]);
      if (value === null ? stored(row) !== null : !same(value, stored(row) ?? (editingSchool ? row.school : null)))
        out.push({ row, value });
    }
    return out;
    // `stored` only reads `editingSchool`, which is in the list
  }, [rows, drafts, editingSchool]); // eslint-disable-line react-hooks/exhaustive-deps

  const deltas: StepUpChange[] = changes.map(({ row, value }) => ({
    field: `${row.label}${editingSchool ? "" : ` (${campusName})`}`,
    fromValue: show(row, stored(row) ?? (editingSchool ? row.school : null)),
    toValue: value === null ? "the school's value" : show(row, value as Value),
    // showing a parent MORE of the bank is the one switch that widens what a person outside the staff can see
    isWeakeningSecurity: row.key === "bank.parents.view" && value !== null && ["SUMMARY", "FULL"].includes(String(value)),
  }));

  const set = (key: string, value: Draft) => {
    setDone(null);
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  const confirm = async (stepUp: StepUp) => {
    setSaving(true);
    setSaveError(null);
    const reply = await sendJson(base, "PUT", {
      scope: editingSchool ? "SCHOOL" : "CAMPUS",
      ...(editingSchool ? {} : { campusId: where }),
      changes: Object.fromEntries(changes.map(({ row, value }) => [row.key, value])),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      stepUp,
    });
    setSaving(false);
    if (!reply.ok) {
      const details = (reply.details ?? []).map((d) => d.message);
      return setSaveError(details.length > 0 ? details.join(" ") : failureText(reply.status, reply.message));
    }
    setAsking(false);
    setDrafts({});
    setReason("");
    const count = (reply.data?.changed as string[] | undefined)?.length ?? 0;
    setDone(count === 0 ? "Nothing needed to change." : `Saved ${count} ${count === 1 ? "setting" : "settings"}.`);
    await api.reload(true);
  };

  if (api.loading && !rows)
    return (
      <p className="text-sm text-fg-muted" aria-busy="true">
        Loading the settings…
      </p>
    );
  if (api.error || !rows) {
    return (
      <div className="space-y-3">
        <Alert variant="error">{api.error ?? "Couldn't load the settings."}</Alert>
        <Button variant="ghost" onClick={() => void api.reload(true)}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-2">
        {editingSchool
          ? "The school's values apply to every campus. A campus can make a switch stricter for itself, never looser."
          : `Values for ${campusName}. A switch you leave on "use the school's value" follows the school.`}{" "}
        Saving asks you to confirm who you are.
      </p>
      {isAdmin && campuses.length > 0 && (
        <SelectField
          label="Settings for"
          value={where}
          onChange={(e) => {
            setDrafts({});
            setDone(null);
            setWhere(e.target.value);
          }}
          options={[{ value: SCHOOL, label: "The school" }, ...campuses.map((c) => ({ value: c.id, label: c.name }))]}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {done && <Alert variant="success">{done}</Alert>}
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((row) => {
          const id = `bank-${row.key.replaceAll(".", "-")}`;
          const draft = shown(row);
          const hasOwn = !editingSchool && (row.override !== null || drafts[row.key] === null);
          return (
            <li key={row.key} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-fg" id={`${id}-label`}>
                    {row.label}
                  </p>
                  <p className="text-sm text-fg-2">{row.help}</p>
                  <p className="mt-1 text-xs text-fg-muted">{row.stricter}</p>
                </div>
                {row.kind === "flag" && (
                  <Switch id={id} aria-label={row.label} checked={draft === true} onChange={() => set(row.key, draft !== true)} />
                )}
              </div>
              {row.kind === "whole" && (
                <TextField
                  label={row.unit ? `${row.label} (${row.unit})` : row.label}
                  inputMode="numeric"
                  value={String(draft ?? "")}
                  onChange={(e) => set(row.key, e.target.value)}
                  hint={`From ${row.min} to ${row.max}.`}
                />
              )}
              {row.kind === "presets" && (
                <TextField
                  label={row.label}
                  value={String(draft ?? "")}
                  onChange={(e) => set(row.key, e.target.value)}
                  hint="Whole numbers in ascending order, separated by commas."
                />
              )}
              {row.kind === "images" && (
                <SelectField
                  label={row.label}
                  value={String(draft)}
                  onChange={(e) => set(row.key, e.target.value)}
                  options={[
                    { value: "3", label: "3 pictures" },
                    { value: "4", label: "4 pictures" },
                  ]}
                />
              )}
              {row.kind === "choice" && (
                <SelectField
                  label={row.label}
                  value={String(draft)}
                  onChange={(e) => set(row.key, e.target.value)}
                  options={(row.choices ?? []).map((c) => ({ value: c.value, label: c.label }))}
                />
              )}
              <p className="text-sm text-fg-muted">
                School: {show(row, row.school)}
                {!editingSchool && (
                  <>
                    {" "}
                    · {campusName}: {show(row, row.override)}
                  </>
                )}{" "}
                · Applies: {show(row, row.effective)}
              </p>
              {hasOwn && (
                <Button variant="ghost" onClick={() => set(row.key, null)} disabled={drafts[row.key] === null}>
                  Use the school&apos;s value<span className="sr-only"> for {row.label}</span>
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <TextField
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          hint="Kept with the change, so the next person knows why."
        />
        <Button
          disabled={changes.length === 0}
          onClick={() => {
            setSaveError(null);
            setAsking(true);
          }}
        >
          {changes.length === 0 ? "No changes to save" : `Review ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
        </Button>
      </div>

      <StepUpModal
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={confirm}
        hasMfa={hasMfa}
        deltas={deltas}
        saving={saving}
        error={saveError}
      />
    </div>
  );
}
