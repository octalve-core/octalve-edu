"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { StatusPill } from "@/components/academics/parts";
import { failureText, useApi } from "@/components/academics/useApi";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { buildTree, type TreeGroup } from "@/lib/programs/rules";
import { ACTION_TEXT, KIND_LABEL, STATUS_LABEL, STATUS_TONE, dayText, whenText, type CampusOption, type ProgramDetail } from "./model";

// One program (task 0027, slice P1): its details and campuses, its level names and tree of groups, who runs it, and the history of every change. Presentation only: what each button shows
// comes from `can`, which the server decides from the person's place in the program, and every action is checked again by the API, which says why not.

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "structure", label: "Structure" },
  { id: "admins", label: "Admins" },
  { id: "history", label: "History" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

type Notice = { variant: "success" | "error"; text: string } | null;
type Group = ProgramDetail["groups"][number];

export function ProgramView({
  schoolCode,
  programId,
  schoolCampuses,
}: {
  schoolCode: string;
  programId: string;
  schoolCampuses: CampusOption[];
}) {
  const base = `/api/v1/schools/${schoolCode}/programs/${programId}`;
  const { reply, error, loading, reload } = useApi(base);
  const [active, setActive] = useState<SectionId>("overview");
  const [notice, setNotice] = useState<Notice>(null);
  const program = reply?.data as unknown as ProgramDetail | undefined;

  if (loading && !program) return <p role="status">Loading the program…</p>;
  if (error || !program) return <Alert variant="error">{error ?? "The program could not be loaded."}</Alert>;

  /// Runs one change, says what happened in the live region, and reloads the program.
  async function act(send: () => Promise<Reply>, done: string): Promise<boolean> {
    setNotice(null);
    const answer = await send();
    if (!answer.ok) {
      setNotice({ variant: "error", text: failureText(answer.status, answer.message) });
      return false;
    }
    setNotice({ variant: "success", text: done });
    await reload(true);
    return true;
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/schools/${schoolCode}/programs`}
        className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-fg-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All programs
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight break-words text-fg">{program.name}</h2>
        <StatusPill tone={STATUS_TONE[program.status]}>{STATUS_LABEL[program.status]}</StatusPill>
      </div>
      {program.switchedOff && <Alert variant="warning">Programs are switched off for the school, so this program is read only.</Alert>}
      <div role="status" aria-live="polite">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      </div>
      <SectionTabs label="Program sections" idPrefix="prog" sections={SECTIONS} active={active} onChange={setActive}>
        {active === "overview" && <Overview program={program} base={base} schoolCampuses={schoolCampuses} act={act} />}
        {active === "structure" && <Structure program={program} base={base} act={act} />}
        {active === "admins" && <Admins program={program} base={base} act={act} />}
        {active === "history" && <History program={program} />}
      </SectionTabs>
    </div>
  );
}

type Act = (send: () => Promise<Reply>, done: string) => Promise<boolean>;

function Overview({
  program,
  base,
  schoolCampuses,
  act,
}: {
  program: ProgramDetail;
  base: string;
  schoolCampuses: CampusOption[];
  act: Act;
}) {
  const [editing, setEditing] = useState(false);
  const [campusToAdd, setCampusToAdd] = useState("");
  const linked = new Set(program.campuses.map((campus) => campus.id));
  const addable = schoolCampuses.filter((campus) => !linked.has(campus.id));

  return (
    <div className="space-y-6">
      <section aria-labelledby="details-heading" className="rounded-xl border border-line bg-surface p-5">
        <h3 id="details-heading" className="text-base font-semibold text-fg">
          Details
        </h3>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">How long</dt>
            <dd className="text-fg">
              {KIND_LABEL[program.kind]} · {whenText(program.startsOn, program.endsOn)}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Where it runs</dt>
            <dd className="text-fg">
              {program.schoolWide ? "The whole school" : program.campuses.map((campus) => campus.name).join(", ")}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-fg-muted">Description</dt>
            <dd className="whitespace-pre-wrap text-fg">{program.description ?? "None."}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {program.can.editDetails && (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )}
          {program.can.editDetails && program.status === "DRAFT" && (
            <Button
              type="button"
              onClick={() => void act(() => sendJson(`${base}/status`, "POST", { action: "activate" }), "The program is active.")}
            >
              Activate
            </Button>
          )}
          {program.can.editDetails && (program.status === "DRAFT" || program.status === "ACTIVE") && (
            <Button
              type="button"
              variant="danger"
              onClick={() => void act(() => sendJson(`${base}/status`, "POST", { action: "archive" }), "The program is archived.")}
            >
              Archive
            </Button>
          )}
          {program.can.restore && (
            <Button
              type="button"
              onClick={() => void act(() => sendJson(`${base}/status`, "POST", { action: "restore" }), "The program is back, as a draft.")}
            >
              Restore
            </Button>
          )}
        </div>
      </section>

      {!program.schoolWide && (
        <section aria-labelledby="campuses-heading" className="rounded-xl border border-line bg-surface p-5">
          <h3 id="campuses-heading" className="text-base font-semibold text-fg">
            Campuses
          </h3>
          <ul className="mt-3 divide-y divide-line">
            {program.campuses.map((campus) => (
              <li key={campus.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-fg">
                  {campus.name}
                  {!campus.takingPart && <span className="ml-2 text-fg-muted">(has switched programs off)</span>}
                </span>
                {program.can.administer && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove ${campus.name}`}
                    onClick={() => void act(() => sendJson(`${base}/campuses/${campus.id}`, "DELETE"), `${campus.name} was removed.`)}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {program.can.administer && addable.length > 0 && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <SelectField
                label="Add a campus"
                options={[{ value: "", label: "Choose a campus" }, ...addable.map((campus) => ({ value: campus.id, label: campus.name }))]}
                value={campusToAdd}
                onChange={(e) => setCampusToAdd(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!campusToAdd}
                onClick={async () => {
                  if (await act(() => sendJson(`${base}/campuses`, "POST", { campusId: campusToAdd }), "The campus was added."))
                    setCampusToAdd("");
                }}
              >
                Add
              </Button>
            </div>
          )}
        </section>
      )}

      {editing && <EditDetailsDialog program={program} base={base} onClose={() => setEditing(false)} act={act} />}
    </div>
  );
}

function EditDetailsDialog({ program, base, onClose, act }: { program: ProgramDetail; base: string; onClose: () => void; act: Act }) {
  const [name, setName] = useState(program.name);
  const [description, setDescription] = useState(program.description ?? "");
  const [startsOn, setStartsOn] = useState(program.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(program.endsOn ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (!name.trim()) return setProblem("Give the program a name.");
    setBusy(true);
    const body: Record<string, unknown> = { name, description: description.trim() || null, startsOn: startsOn || null };
    if (program.kind === "FIXED_TERM") body.endsOn = endsOn || null;
    const answer = await sendJson(base, "PATCH", body);
    setBusy(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    await act(async () => answer, "The details are saved.");
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title="Edit details" description="The kind of program (never ends, or for a period) does not change.">
      <form onSubmit={submit} className="space-y-4 pt-2" noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        <TextAreaField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
        <TextField label="Starts on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        {program.kind === "FIXED_TERM" && (
          <TextField label="Ends on (the last day)" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        )}
        {problem && <Alert variant="error">{problem}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Structure({ program, base, act }: { program: ProgramDetail; base: string; act: Act }) {
  const editable = program.can.editStructure;
  const live = program.groups.filter((group) => !group.archived);
  const archived = program.groups.filter((group) => group.archived);
  const tree = buildTree(live);
  const [levels, setLevels] = useState<string[]>(program.levelLabels);
  const [adding, setAdding] = useState<{ parent: Group | null } | null>(null);
  const [renaming, setRenaming] = useState<Group | null>(null);
  const [levelProblem, setLevelProblem] = useState<string | null>(null);
  const depth = program.levelLabels.length;

  return (
    <div className="space-y-6">
      <section aria-labelledby="levels-heading" className="rounded-xl border border-line bg-surface p-5">
        <h3 id="levels-heading" className="text-base font-semibold text-fg">
          Level names
        </h3>
        <p className="mt-1 text-sm text-fg-muted">
          What the program calls its levels, from the top. A level cannot be taken away while a group (live or archived) sits at it.
        </p>
        {editable ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setLevelProblem(null);
              const labels = levels.map((level) => level.trim()).filter(Boolean);
              if (labels.length === 0) return setLevelProblem("Give the program at least one level name.");
              const ok = await act(() => sendJson(`${base}/levels`, "PUT", { labels }), "The level names are saved.");
              if (ok) setLevels(labels);
            }}
            aria-label="Level names"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <TextField
                  key={index}
                  label={`Level ${index + 1}${index === 0 ? "" : " (optional)"}`}
                  value={levels[index] ?? ""}
                  maxLength={40}
                  onChange={(e) => setLevels([0, 1, 2, 3].map((i) => (i === index ? e.target.value : (levels[i] ?? ""))))}
                />
              ))}
            </div>
            {levelProblem && <Alert variant="error">{levelProblem}</Alert>}
            <Button type="submit" variant="secondary">
              Save the level names
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-fg">{program.levelLabels.join(" › ")}</p>
        )}
      </section>

      <section aria-labelledby="groups-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="groups-heading" className="text-base font-semibold text-fg">
            Groups
          </h3>
          {editable && (
            <Button type="button" onClick={() => setAdding({ parent: null })}>
              Add a {program.levelLabels[0]?.toLowerCase() ?? "group"}
            </Button>
          )}
        </div>
        {tree.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted">No groups yet.</p>
        ) : (
          <GroupList
            nodes={tree}
            program={program}
            base={base}
            act={act}
            editable={editable}
            depth={depth}
            onAdd={(parent) => setAdding({ parent })}
            onRename={setRenaming}
          />
        )}
        {archived.length > 0 && (
          <details className="rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold text-fg">Archived groups ({archived.length})</summary>
            <ul className="mt-3 space-y-2">
              {archived.map((group) => (
                <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-fg-muted">{group.path}</span>
                  {editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Restore ${group.path}`}
                      onClick={() =>
                        void act(() => sendJson(`${base}/groups/${group.id}`, "PATCH", { archived: false }), `${group.name} is back.`)
                      }
                    >
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {adding && (
        <AddGroupDialog
          parent={adding.parent}
          levelName={program.levelLabels[adding.parent ? adding.parent.levelIndex + 1 : 0] ?? "group"}
          base={base}
          act={act}
          onClose={() => setAdding(null)}
        />
      )}
      {renaming && <RenameDialog group={renaming} base={base} act={act} onClose={() => setRenaming(null)} />}
    </div>
  );
}

function GroupList({
  nodes,
  program,
  base,
  act,
  editable,
  depth,
  onAdd,
  onRename,
}: {
  nodes: TreeGroup<Group>[];
  program: ProgramDetail;
  base: string;
  act: Act;
  editable: boolean;
  depth: number;
  onAdd: (parent: Group) => void;
  onRename: (group: Group) => void;
}) {
  return (
    <ul className="space-y-2">
      {nodes.map((node, index) => (
        <li key={node.id} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-fg">
              {node.name} <span className="font-normal text-fg-muted">· {program.levelLabels[node.levelIndex] ?? "Level"}</span>
            </p>
            {editable && (
              <div className="flex flex-wrap gap-1">
                {node.levelIndex + 1 < depth && (
                  <Button type="button" variant="ghost" aria-label={`Add a group inside ${node.path}`} onClick={() => onAdd(node)}>
                    Add inside
                  </Button>
                )}
                <Button type="button" variant="ghost" aria-label={`Rename ${node.path}`} onClick={() => onRename(node)}>
                  Rename
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Move ${node.path} up`}
                  disabled={index === 0}
                  onClick={() => void act(() => sendJson(`${base}/groups/${node.id}`, "PATCH", { move: "up" }), `${node.name} moved up.`)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Move ${node.path} down`}
                  disabled={index === nodes.length - 1}
                  onClick={() =>
                    void act(() => sendJson(`${base}/groups/${node.id}`, "PATCH", { move: "down" }), `${node.name} moved down.`)
                  }
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Archive ${node.path}`}
                  onClick={() =>
                    void act(() => sendJson(`${base}/groups/${node.id}`, "PATCH", { archived: true }), `${node.name} is archived.`)
                  }
                >
                  Archive
                </Button>
              </div>
            )}
          </div>
          {node.children.length > 0 && (
            <div className="mt-2 border-l border-line pl-4">
              <GroupList
                nodes={node.children}
                program={program}
                base={base}
                act={act}
                editable={editable}
                depth={depth}
                onAdd={onAdd}
                onRename={onRename}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function AddGroupDialog({
  parent,
  levelName,
  base,
  act,
  onClose,
}: {
  parent: Group | null;
  levelName: string;
  base: string;
  act: Act;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (!name.trim()) return setProblem("Give the group a name.");
    setBusy(true);
    const answer = await sendJson(`${base}/groups`, "POST", { name, ...(parent ? { parentId: parent.id } : {}) });
    setBusy(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    await act(async () => answer, `${name.trim()} was added.`);
    onClose();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={parent ? `Add a ${levelName.toLowerCase()} inside ${parent.name}` : `Add a ${levelName.toLowerCase()}`}
    >
      <form onSubmit={submit} className="space-y-4 pt-2" noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required error={problem} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({ group, base, act, onClose }: { group: Group; base: string; act: Act; onClose: () => void }) {
  const [name, setName] = useState(group.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (!name.trim()) return setProblem("Give the group a name.");
    setBusy(true);
    const answer = await sendJson(`${base}/groups/${group.id}`, "PATCH", { name });
    setBusy(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    await act(async () => answer, "The group is renamed.");
    onClose();
  }
  return (
    <Dialog open onClose={onClose} title={`Rename ${group.name}`}>
      <form onSubmit={submit} className="space-y-4 pt-2" noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required error={problem} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Rename
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Candidate = { userId: string; name: string; email: string | null; role: string; campusName: string | null };

function Admins({ program, base, act }: { program: ProgramDetail; base: string; act: Act }) {
  const canName = program.can.administer;
  const candidates = useApi(canName ? `${base}/admins` : null);
  const list = (candidates.reply?.data?.candidates as Candidate[] | undefined) ?? [];
  const [chosen, setChosen] = useState("");

  return (
    <section aria-labelledby="admins-heading" className="space-y-4">
      <div>
        <h3 id="admins-heading" className="text-base font-semibold text-fg">
          Program admins
        </h3>
        <p className="mt-1 text-sm text-fg-muted">
          A program admin changes this program, its groups and its details. The school&apos;s administrator names and ends them. A member of
          staff counts only while their membership is active and their campus is one the program runs in.
        </p>
      </div>
      {program.admins.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted">
          Nobody has been named: the school&apos;s administrator runs it.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Program admins">
          {program.admins.map((admin) => (
            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="text-fg">
                {admin.name}
                <span className="text-fg-muted">
                  {admin.campusName ? ` · ${admin.campusName}` : " · the whole school"}
                  {admin.email ? ` · ${admin.email}` : ""}
                </span>
              </span>
              {canName && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`End ${admin.name}'s place`}
                  onClick={() =>
                    void act(() => sendJson(`${base}/admins/${admin.id}`, "DELETE"), `${admin.name} no longer runs the program.`)
                  }
                >
                  End
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canName && (
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Name a program admin"
            options={[
              { value: "", label: list.length === 0 ? "No one to name" : "Choose a member of staff" },
              ...list.map((person) => ({
                value: person.userId,
                label: `${person.name}${person.campusName ? ` (${person.campusName})` : ""}`,
              })),
            ]}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          />
          <Button
            type="button"
            disabled={!chosen}
            onClick={async () => {
              if (await act(() => sendJson(`${base}/admins`, "POST", { userId: chosen }), "The program admin is named.")) {
                setChosen("");
                await candidates.reload();
              }
            }}
          >
            Name
          </Button>
        </div>
      )}
    </section>
  );
}

function History({ program }: { program: ProgramDetail }) {
  if (!program.audit) return <p className="text-sm text-fg-muted">The history is shown to the people who manage the program.</p>;
  if (program.audit.length === 0) return <p className="text-sm text-fg-muted">Nothing has been recorded yet.</p>;
  return (
    <ol className="space-y-2" aria-label="History, newest first">
      {program.audit.map((entry) => (
        <li key={entry.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
          <p className="font-medium text-fg">
            {ACTION_TEXT[entry.action] ?? entry.action}
            <span className="font-normal text-fg-muted">
              {" "}
              · {entry.actor} · {dayText(entry.at.slice(0, 10))}
            </span>
          </p>
          {entry.reason && <p className="mt-1 text-fg-muted">{entry.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
