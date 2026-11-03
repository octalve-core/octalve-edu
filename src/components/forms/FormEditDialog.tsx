"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { KIND_PATH, useFormsApi } from "@/components/forms/FormsApi";
import type { ClassGroup } from "@/components/forms/useClassGroups";
import { classGroupIdsOf, instantOf, localInputValue, type FormDetail, type FormKindKey, type ListedForm } from "@/components/forms/model";

// Changing a form's title, instructions, dates, time limit and classes. What a form asks is not changed here. Presentation only: the API checks every field again and says who may.

export const NOT_YOURS = "Only the person who wrote this form, or an administrator, can change it.";

export function FormEditDialog({
  open,
  onClose,
  kind,
  detail,
  summary,
  classGroups,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  kind: FormKindKey;
  detail: FormDetail;
  summary: ListedForm | null;
  classGroups: ClassGroup[];
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit details" wide>
      {open && <Body kind={kind} detail={detail} summary={summary} classGroups={classGroups} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function Body({
  kind,
  detail,
  summary,
  classGroups,
  onClose,
  onSaved,
}: {
  kind: FormKindKey;
  detail: FormDetail;
  summary: ListedForm | null;
  classGroups: ClassGroup[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { api } = useFormsApi();
  const [title, setTitle] = useState(detail.title);
  const [instructions, setInstructions] = useState(detail.instructions ?? "");
  const [opens, setOpens] = useState(localInputValue(detail.opensAt));
  const [closes, setCloses] = useState(localInputValue(detail.closesAt));
  const [minutes, setMinutes] = useState(detail.maxDurationMinutes ? String(detail.maxDurationMinutes) : "");
  const [classIds, setClassIds] = useState<string[]>(summary ? classGroupIdsOf(summary) : []);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const hasTimeLimit = kind !== "QUESTIONNAIRE";
  const roles = Array.isArray(summary?.audience?.roles) ? (summary!.audience!.roles as string[]) : [];
  const showsClasses =
    summary !== null &&
    (kind !== "QUESTIONNAIRE" || (summary.audience?.kind === "MEMBERS" && (roles.length === 0 || roles.includes("STUDENT"))));
  const toggle = (id: string, on: boolean) => setClassIds(on ? [...classIds, id] : classIds.filter((x) => x !== id));

  function problemsOf(): string[] {
    const found: string[] = [];
    if (title.trim().length === 0) found.push("Give it a title.");
    if (kind === "PAPER_WORK" && showsClasses && classIds.length === 0) found.push("Choose at least one class for the paper work.");
    if (hasTimeLimit && minutes.trim() !== "" && !(Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440))
      found.push("The time limit is a whole number of minutes, from 1 to 1440.");
    const from = instantOf(opens);
    const until = instantOf(closes);
    if ((opens && !from) || (closes && !until)) found.push("Check the dates: one of them is not a date.");
    else if (from && until && new Date(until) <= new Date(from)) found.push("It must close after it opens.");
    return found;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found = problemsOf();
    if (found.length > 0) return setProblems(found);
    setProblems([]);
    setPending(true);
    const body: Record<string, unknown> = {
      title: title.trim(),
      instructions: instructions.trim() || null,
      opensAt: instantOf(opens),
      closesAt: instantOf(closes),
    };
    if (hasTimeLimit) body.maxDurationMinutes = minutes.trim() === "" ? null : Number(minutes);
    if (showsClasses) body.classGroupIds = classIds;
    const reply = await sendJson(`${api}/${KIND_PATH[kind]}/${encodeURIComponent(detail.id)}`, "PATCH", body);
    setPending(false);
    if (!reply.ok) {
      const details = (reply.details ?? []).map((d) => d.message);
      return setProblems(
        details.length > 0
          ? [...new Set(details)]
          : [reply.status === 404 || reply.status === 403 ? NOT_YOURS : say(reply, "The changes couldn't be saved.")],
      );
    }
    onSaved("Changes saved.");
    onClose();
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      {problems.length > 0 && (
        <Alert variant="error">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <TextAreaField
        label="Instructions"
        rows={3}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        maxLength={5000}
      />
      {showsClasses && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-fg">{kind === "QUESTIONNAIRE" ? "Pupils of these classes" : "Classes"}</legend>
          <p className="text-xs text-fg-muted">{kind === "PAPER_WORK" ? "Choose at least one." : "Leave all unticked for every class."}</p>
          {classGroups.length === 0 ? (
            <p className="text-sm text-fg-muted">There are no classes yet.</p>
          ) : (
            <div className="grid gap-x-6 sm:grid-cols-2">
              {classGroups.map((g) => (
                <CheckboxField
                  key={g.id}
                  label={g.name}
                  checked={classIds.includes(g.id)}
                  onChange={(e) => toggle(g.id, e.target.checked)}
                />
              ))}
            </div>
          )}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Opens" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
        <TextField label="Closes" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
        {hasTimeLimit && (
          <TextField
            label="Time limit (minutes)"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            hint="Leave empty for no limit."
          />
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
