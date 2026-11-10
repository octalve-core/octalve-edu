"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { StatusPill } from "@/components/academics/parts";
import { failureText, useApi } from "@/components/academics/useApi";
import { sendJson } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { PlusIcon } from "@/components/ui/icons";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, whenText, type CampusOption, type ProgramSummary } from "./model";

// The programs this person has a place in (task 0027, slice P1), and - for the school's administrator - the way to make one. Presentation only: the API decides who may do what.

export function ProgramsList({ schoolCode, canCreate, campuses }: { schoolCode: string; canCreate: boolean; campuses: CampusOption[] }) {
  const { reply, error, loading } = useApi(`/api/v1/schools/${schoolCode}/programs`);
  const [creating, setCreating] = useState(false);
  const data = reply?.data as unknown as { enabled: boolean; programs: ProgramSummary[] } | undefined;

  if (loading && !data) return <p role="status">Loading the programs…</p>;
  if (error || !data) return <Alert variant="error">{error ?? "The programs could not be loaded."}</Alert>;

  return (
    <div className="space-y-6">
      {!data.enabled && (
        <Alert variant="warning">
          Programs are switched off for the school. Nothing can be made or changed until they are switched on again
          {canCreate ? " (Settings, Programs)" : ""}.
        </Alert>
      )}
      {canCreate && data.enabled && (
        <div>
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon className="h-4 w-4" />
            New program
          </Button>
        </div>
      )}
      {data.programs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-sm text-fg-muted">
          {canCreate
            ? "No program has been made yet. A program is learning that is not a normal class: it has its own levels and groups, and its own people."
            : data.enabled
              ? "You have no place in a program. The school's administrator can name you a program admin."
              : "Programs are switched off."}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Programs">
          {data.programs.map((program) => (
            <li key={program.id} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-fg">
                  <Link
                    href={`/schools/${schoolCode}/programs/${program.id}`}
                    className="underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {program.name}
                  </Link>
                </h2>
                <StatusPill tone={STATUS_TONE[program.status]}>{STATUS_LABEL[program.status]}</StatusPill>
              </div>
              <p className="mt-1 text-sm text-fg-muted">
                {KIND_LABEL[program.kind]} · {whenText(program.startsOn, program.endsOn)}
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                {program.campuses.length === 0 ? "The whole school" : program.campuses.map((campus) => campus.name).join(", ")} ·{" "}
                {program.groupCount} {program.groupCount === 1 ? "group" : "groups"}
              </p>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateProgramDialog schoolCode={schoolCode} campuses={campuses} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProgramDialog({ schoolCode, campuses, onClose }: { schoolCode: string; campuses: CampusOption[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"ONGOING" | "FIXED_TERM">("ONGOING");
  const [startsOn, setStartsOn] = useState("");
  const [months, setMonths] = useState("6");
  const [unit, setUnit] = useState<"MONTHS" | "YEARS">("MONTHS");
  const [campusIds, setCampusIds] = useState<string[]>([]);
  const [levels, setLevels] = useState(["", "", "", ""]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    const labels = levels.map((level) => level.trim()).filter(Boolean);
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Give the program a name.";
    if (labels.length === 0) found.levelLabels = "Give the program at least one level name.";
    if (kind === "FIXED_TERM" && !startsOn) found.startsOn = "A program for a period needs a start date.";
    if (kind === "FIXED_TERM" && !(Number(months) >= 1)) found.duration = "Say how long it runs.";
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const answer = await sendJson(`/api/v1/schools/${schoolCode}/programs`, "POST", {
      name,
      description: description.trim() || null,
      kind,
      ...(kind === "FIXED_TERM" ? { startsOn, duration: { value: Number(months), unit } } : startsOn ? { startsOn } : {}),
      campusIds,
      levelLabels: labels,
    });
    setBusy(false);
    if (!answer.ok) {
      const mapped: Record<string, string> = {};
      for (const detail of answer.details ?? []) mapped[detail.path.replace(/^body\./, "")] = detail.message;
      setProblems(mapped);
      return setFailure(Object.keys(mapped).length > 0 ? null : failureText(answer.status, answer.message));
    }
    router.push(`/schools/${schoolCode}/programs/${answer.data?.id as string}`);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title="New program"
      description="A draft is made first: give it its groups and its people, then activate it."
    >
      <form onSubmit={submit} className="space-y-4 pt-2" noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={problems.name} maxLength={80} required />
        <TextAreaField
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
          error={problems.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="How long it runs"
            options={[
              { value: "ONGOING", label: "It never ends" },
              { value: "FIXED_TERM", label: "For a period" },
            ]}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          />
          <TextField
            label={kind === "FIXED_TERM" ? "Starts on" : "Starts on (optional)"}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            error={problems.startsOn}
          />
        </div>
        {kind === "FIXED_TERM" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Lasts"
              type="number"
              min="1"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              error={problems.duration ?? problems.endsOn}
            />
            <SelectField
              label="In"
              options={[
                { value: "MONTHS", label: "Months" },
                { value: "YEARS", label: "Years" },
              ]}
              value={unit}
              onChange={(e) => setUnit(e.target.value as typeof unit)}
            />
          </div>
        )}
        {campuses.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-fg-2 uppercase">Campuses</legend>
            <p className="text-xs text-fg-muted">
              Choose where it runs, or none to run it across the whole school. This is not changed to or from school-wide later.
            </p>
            {campuses.map((campus) => (
              <CheckboxField
                key={campus.id}
                label={campus.name}
                checked={campusIds.includes(campus.id)}
                onChange={(e) => setCampusIds(e.target.checked ? [...campusIds, campus.id] : campusIds.filter((id) => id !== campus.id))}
              />
            ))}
            {problems.campusIds && <p className="text-xs text-danger-fg">{problems.campusIds}</p>}
          </fieldset>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-semibold tracking-wide text-fg-2 uppercase">Level names</legend>
          <p className="text-xs text-fg-muted">
            What the program calls its levels, from the top (for example Section, Class, Group). One to four.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {levels.map((level, index) => (
              <TextField
                key={index}
                label={`Level ${index + 1}${index === 0 ? "" : " (optional)"}`}
                value={level}
                maxLength={40}
                onChange={(e) => setLevels(levels.map((current, i) => (i === index ? e.target.value : current)))}
                error={index === 0 ? problems.levelLabels : undefined}
              />
            ))}
          </div>
        </fieldset>
        {failure && <Alert variant="error">{failure}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Make the program
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
