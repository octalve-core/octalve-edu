"use client";

import { useState, type FormEvent } from "react";
import { failureText, useApi } from "@/components/academics/useApi";
import { getJson, sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { SKIPPED_TEXT, type Candidate, type ClassOption, type ClassPlan } from "./people-model";
import type { CampusOption, ProgramDetail } from "./model";

// Adding people to a program (task 0027, slice P2): a pupil, a member of staff or a guardian from the school's records, a whole class of pupils (shown first, then confirmed), or a new
// person typed in (an adult or a child). Presentation only: the API checks who may add whom and says why not.

type Act = (send: () => Promise<Reply>, done: string) => Promise<boolean>;
type Way = "record" | "class" | "new";

const WAYS = [
  { value: "record", label: "A pupil, member of staff or guardian from the school's records" },
  { value: "class", label: "A whole class of pupils" },
  { value: "new", label: "A new person (an adult or a child with no school record)" },
];
const RECORD_KINDS = [
  { value: "STUDENT", label: "A pupil" },
  { value: "STAFF", label: "A member of staff" },
  { value: "GUARDIAN", label: "A guardian" },
];

export function AddPersonDialog({
  program,
  base,
  campusChoices,
  onClose,
  act,
}: {
  program: ProgramDetail;
  base: string;
  campusChoices: CampusOption[];
  onClose: () => void;
  act: Act;
}) {
  const groups = program.groups.filter((group) => !group.archived);
  const [way, setWay] = useState<Way>("record");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add people"
      description="Choose how, then the group they go into. Nothing is copied: a pupil's or a member of staff's details stay on the school's record."
    >
      <div className="space-y-4 pt-2">
        {groups.length === 0 ? (
          <Alert variant="warning">Make a group on the Structure tab first: everyone goes into a group.</Alert>
        ) : (
          <>
            <SelectField label="How" options={WAYS} value={way} onChange={(e) => setWay(e.target.value as Way)} />
            <SelectField
              label="Into this group"
              options={groups.map((group) => ({ value: group.id, label: group.path }))}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
            {problem && <Alert variant="error">{problem}</Alert>}
            {way === "record" && <FromRecords base={base} groupId={groupId} act={act} onClose={onClose} setProblem={setProblem} />}
            {way === "class" && <FromClass base={base} groupId={groupId} act={act} onClose={onClose} setProblem={setProblem} />}
            {way === "new" && (
              <NewPerson base={base} groupId={groupId} campusChoices={campusChoices} act={act} onClose={onClose} setProblem={setProblem} />
            )}
          </>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type Shared = { base: string; groupId: string; act: Act; onClose: () => void; setProblem: (text: string | null) => void };

function FromRecords({ base, groupId, act, onClose, setProblem }: Shared) {
  const [kind, setKind] = useState("STUDENT");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (q.trim().length < 2) return setProblem("Type at least 2 letters of the name.");
    const answer = await getJson(`${base}/people/candidates?kind=${kind}&q=${encodeURIComponent(q.trim())}`);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    setFound(answer.data as unknown as Candidate[]);
  }
  async function add(candidate: Candidate) {
    setBusy(true);
    setProblem(null);
    const body =
      kind === "STUDENT"
        ? { kind, studentId: candidate.id, groupId }
        : kind === "STAFF"
          ? { kind, staffRecordId: candidate.id, groupId }
          : { kind, guardianId: candidate.id, groupId };
    const ok = await act(() => sendJson(`${base}/people`, "POST", body), `${candidate.name} is added.`);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end" aria-label="Find a record">
        <SelectField
          label="Who"
          options={RECORD_KINDS}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setFound(null);
          }}
        />
        <TextField label="Name or admission number" value={q} onChange={(e) => setQ(e.target.value)} maxLength={64} />
        <Button type="submit" variant="secondary">
          Find
        </Button>
      </form>
      {found && found.length === 0 && <p className="text-sm text-fg-muted">No one was found in the campuses you can add from.</p>}
      {found && found.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Records found">
          {found.map((candidate) => (
            <li key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="text-fg">
                {candidate.name}
                <span className="text-fg-muted">
                  {` · ${candidate.detail}`}
                  {candidate.campusName ? ` · ${candidate.campusName}` : ""}
                  {candidate.note ? ` · ${candidate.note}` : ""}
                </span>
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  busy ||
                  (candidate.note?.startsWith("Already") ?? false) ||
                  candidate.note === "Expelled" ||
                  (candidate.note?.startsWith("Has left") ?? false)
                }
                aria-label={`Add ${candidate.name}`}
                onClick={() => void add(candidate)}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FromClass({ base, groupId, act, onClose, setProblem }: Shared) {
  const options = useApi(`${base}/people/classes`);
  const classes = (options.reply?.data as unknown as ClassOption[] | undefined) ?? [];
  const [classArmId, setClassArmId] = useState("");
  const [plan, setPlan] = useState<ClassPlan | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setProblem(null);
    setBusy(true);
    const answer = await sendJson(`${base}/people/class`, "POST", { classArmId, groupId, confirm: false });
    setBusy(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    setPlan(answer.data as unknown as ClassPlan);
  }
  async function confirm() {
    setBusy(true);
    const ok = await act(() => sendJson(`${base}/people/class`, "POST", { classArmId, groupId, confirm: true }), "The class is added.");
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="space-y-3">
      <SelectField
        label="Class"
        options={[
          { value: "", label: classes.length === 0 ? "No class to add from" : "Choose a class" },
          ...classes.map((c) => ({ value: c.id, label: `${c.label}${c.campusName ? ` (${c.campusName})` : ""} · ${c.pupils} pupils` })),
        ]}
        value={classArmId}
        onChange={(e) => {
          setClassArmId(e.target.value);
          setPlan(null);
        }}
      />
      {!plan && (
        <Button type="button" variant="secondary" disabled={!classArmId || busy} onClick={() => void preview()}>
          See who would be added
        </Button>
      )}
      {plan && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-3 text-sm" aria-label="Who would be added">
          <p className="font-medium text-fg">
            {plan.willAdd.length} to add{plan.skipped.length > 0 ? `, ${plan.skipped.length} skipped` : ""}
          </p>
          {plan.skipped.length > 0 && (
            <ul className="list-disc pl-5 text-fg-muted">
              {plan.skipped.map((entry, index) => (
                <li key={`${entry.name}-${index}`}>
                  {entry.name}: {SKIPPED_TEXT[entry.reason]}
                </li>
              ))}
            </ul>
          )}
          {plan.willAdd.some((entry) => entry.note) && (
            <p className="text-fg-muted">
              {plan.willAdd.filter((entry) => entry.note).length} of them are suspended and are added as they are.
            </p>
          )}
          <Button type="button" disabled={plan.willAdd.length === 0 || busy} onClick={() => void confirm()}>
            Add {plan.willAdd.length} {plan.willAdd.length === 1 ? "pupil" : "pupils"}
          </Button>
        </div>
      )}
    </div>
  );
}

function NewPerson({ base, groupId, campusChoices, act, onClose, setProblem }: Shared & { campusChoices: CampusOption[] }) {
  const [kind, setKind] = useState<"ADULT" | "CHILD">("ADULT");
  const [v, setV] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    guardianName: "",
    guardianPhone: "",
    campusId: "",
  });
  const [confirmNamesake, setConfirmNamesake] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [key]: e.target.value });
  const blank = (x: string) => (x.trim() === "" ? undefined : x.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    setNeedsConfirm(null);
    setBusy(true);
    const body = {
      kind,
      firstName: v.firstName,
      lastName: v.lastName,
      dateOfBirth: blank(v.dateOfBirth),
      phone: blank(v.phone),
      email: blank(v.email),
      ...(kind === "CHILD" ? { guardianName: blank(v.guardianName), guardianPhone: blank(v.guardianPhone) } : {}),
      ...(v.campusId ? { campusId: v.campusId } : {}),
      groupId,
      ...(confirmNamesake ? { confirmNamesake: true } : {}),
    };
    const answer = await sendJson(`${base}/people`, "POST", body);
    if (!answer.ok) {
      setBusy(false);
      if (answer.status === 409 && answer.message?.includes("same birth date or phone")) return setNeedsConfirm(answer.message);
      return setProblem(failureText(answer.status, answer.message));
    }
    const ok = await act(async () => answer, `${v.firstName} ${v.lastName} is added.`);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate aria-label="A new person">
      <SelectField
        label="Kind"
        options={[
          { value: "ADULT", label: "An adult" },
          { value: "CHILD", label: "A child (needs a birth date and a guardian)" },
        ]}
        value={kind}
        onChange={(e) => setKind(e.target.value as "ADULT" | "CHILD")}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="First name" value={v.firstName} maxLength={60} onChange={set("firstName")} required />
        <TextField label="Last name" value={v.lastName} maxLength={60} onChange={set("lastName")} required />
        <TextField
          label={kind === "CHILD" ? "Date of birth" : "Date of birth (optional)"}
          type="date"
          value={v.dateOfBirth}
          onChange={set("dateOfBirth")}
        />
        <TextField label="Phone (optional)" value={v.phone} maxLength={30} onChange={set("phone")} />
        <TextField label="E-mail (optional)" value={v.email} maxLength={120} onChange={set("email")} />
        {kind === "CHILD" && (
          <>
            <TextField label="Guardian's name" value={v.guardianName} maxLength={60} onChange={set("guardianName")} />
            <TextField label="Guardian's phone" value={v.guardianPhone} maxLength={30} onChange={set("guardianPhone")} />
          </>
        )}
        {campusChoices.length > 0 && (
          <SelectField
            label="Through campus"
            options={[
              { value: "", label: "The campus I administer, or the school" },
              ...campusChoices.map((c) => ({ value: c.id, label: c.name })),
            ]}
            value={v.campusId}
            onChange={set("campusId")}
          />
        )}
      </div>
      {needsConfirm && (
        <Alert variant="warning">
          {needsConfirm}
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirmNamesake} onChange={(e) => setConfirmNamesake(e.target.checked)} />
            This is a different person
          </label>
        </Alert>
      )}
      <Button type="submit" disabled={busy}>
        Add
      </Button>
    </form>
  );
}
