"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useAfterChange, useApi, failureText } from "@/components/academics/useApi";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import type { ApproverView, ClassGroupView, SectionView } from "@/lib/results/approver-settings";
import { describeScope, describeScopes, placementTargets, roleLabel } from "@/lib/results/approver-view";
import type { ScopeEntry } from "@/lib/results/section-rules";
import { ScopeEditor } from "./ScopeEditor";
import { StepUpModal, type StepUpChange } from "./StepUpModal";

// The Results approval tab of the school's settings (ADR 0018, task 0020 slice 3): the sections of the school and which class is in which, and for each person who may approve
// results, where they approve. Every change is one call to a route of slice 2b, and each asks for the fresh proof, so each opens the step-up dialog first.

type StepUp = { type: "totp" | "recovery" | "password"; value: string };
type Campus = { id: string; name: string };
type SectionsData = { sections: SectionView[]; unplacedClassGroups: ClassGroupView[]; campuses: Campus[] };
type ApproversData = { approvers: ApproverView[] };
/// A change waiting for the proof: what the dialog shows, how to send it, and what to say when it worked.
type Pending = { change: StepUpChange; send: (stepUp: StepUp) => Promise<Reply>; done: string; after?: () => void };

const NO_SECTION = "none";
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const change = (field: string, fromValue: string, toValue: string): StepUpChange => ({
  field,
  fromValue,
  toValue,
  isWeakeningSecurity: false,
});

export function ResultsApprovalPanel({ schoolCode, hasMfa }: { schoolCode: string; hasMfa: boolean }) {
  const base = `/api/v1/schools/${schoolCode}/settings`;
  const sectionsApi = useApi(`${base}/sections`);
  const approversApi = useApi(`${base}/approvers`);
  const { summaryRef, afterChange } = useAfterChange(async () => {
    await sectionsApi.reload(true);
    await approversApi.reload(true);
  });

  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /// Bumped after a section is added, so the form starts empty again; until then a refused name is still there to correct.
  const [addFormKey, setAddFormKey] = useState(0);

  const data = sectionsApi.reply?.data as SectionsData | undefined;
  const approvers = (approversApi.reply?.data as ApproversData | undefined)?.approvers;

  const campuses = data?.campuses;
  const campusNames = useMemo(() => new Map((campuses ?? []).map((campus) => [campus.id, campus.name])), [campuses]);
  const allClassGroups = useMemo(() => {
    if (!data) return [];
    const byId = new Map<string, ClassGroupView>();
    for (const group of [...data.sections.flatMap((section) => section.classGroups), ...data.unplacedClassGroups])
      byId.set(group.id, group);
    return [...byId.values()];
  }, [data]);

  const ask = (next: Pending) => {
    setSaveError(null);
    setPending(next);
  };

  const confirm = async (stepUp: StepUp) => {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    const reply = await pending.send(stepUp);
    setSaving(false);
    if (!reply.ok) {
      setSaveError(failureText(reply.status, reply.message));
      return;
    }
    setPending(null);
    setDone(pending.done);
    pending.after?.();
    await afterChange();
  };

  if ((sectionsApi.loading || approversApi.loading) && !data) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-line bg-surface" role="status">
        <p className="text-sm text-fg-muted">Loading sections and approvers...</p>
      </div>
    );
  }
  const failure = sectionsApi.error ?? approversApi.error;
  if (failure || !data || !approvers) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-6">
        <Alert variant="error">{failure ?? "Could not load the sections and approvers."}</Alert>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void sectionsApi.reload(true);
            void approversApi.reload(true);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const live = data.sections.filter((section) => !section.archived);
  const archivedCount = data.sections.length - live.length;

  return (
    <div className="space-y-8">
      <div>
        <p ref={summaryRef} tabIndex={-1} className="text-sm text-fg-muted focus:outline-none">
          {plural(live.length, "section", "sections")}
          {archivedCount > 0 ? ` (${archivedCount} archived)` : ""}, {plural(data.unplacedClassGroups.length, "class", "classes")} in no
          section, {plural(approvers.length, "person", "people")} who may approve results.
        </p>
        <div role="status" className="mt-3 empty:hidden">
          {done && (
            <Alert variant="success" announce={false}>
              {done}
            </Alert>
          )}
        </div>
      </div>

      <section aria-labelledby="sections-heading" className="space-y-4">
        <div>
          <h2 id="sections-heading" className="text-base font-bold text-fg">
            Sections
          </h2>
          <p className="text-sm text-fg-muted">
            A section groups classes (for example Primary, JSS and SSS), so an approver can be given a whole section at once. A class is in
            one section at most, on its own campus.
          </p>
        </div>

        <AddSectionForm
          key={addFormKey}
          campuses={data.campuses}
          disabled={saving}
          onAsk={(name, campusId) =>
            ask({
              change: change("New section", "—", `${name}${campusId ? ` (${campusNames.get(campusId) ?? "campus"})` : ""}`),
              send: (stepUp) => sendJson(`${base}/sections`, "POST", { name, campusId, stepUp }),
              done: `Added the section ${name}.`,
              after: () => setAddFormKey((key) => key + 1),
            })
          }
        />

        {data.sections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-sm text-fg-muted">
            There are no sections yet. Add the first one above, then put classes in it.
          </p>
        ) : (
          <ul className="space-y-4">
            {data.sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                sections={data.sections}
                disabled={saving}
                onRename={(name) =>
                  ask({
                    change: change("Rename section", section.name, name),
                    send: (stepUp) => sendJson(`${base}/sections/${section.id}`, "PATCH", { name, stepUp }),
                    done: `Renamed the section ${section.name} to ${name}.`,
                  })
                }
                onArchive={(archived) =>
                  ask({
                    change: change(archived ? "Archive section" : "Restore section", section.name, archived ? "archived" : "in use"),
                    send: (stepUp) => sendJson(`${base}/sections/${section.id}`, "PATCH", { archived, stepUp }),
                    done: archived ? `Archived the section ${section.name}.` : `Restored the section ${section.name}.`,
                  })
                }
                onMove={(group, target) =>
                  ask({
                    change: change(`Section of ${group.name}`, section.name, target?.name ?? "no section"),
                    send: (stepUp) =>
                      sendJson(`${base}/class-groups/${group.id}/section`, "PUT", { sectionId: target?.id ?? null, stepUp }),
                    done: target ? `Moved ${group.name} to ${target.name}.` : `Took ${group.name} out of ${section.name}.`,
                  })
                }
              />
            ))}
          </ul>
        )}

        {data.unplacedClassGroups.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <h3 className="text-sm font-bold text-fg">Classes in no section</h3>
            <p className="mb-2 text-xs text-fg-muted">An approver can still be given any of these by name, or Everything.</p>
            <ul className="divide-y divide-line">
              {data.unplacedClassGroups.map((group) => (
                <ClassRow
                  key={group.id}
                  group={group}
                  targets={placementTargets(group, data.sections)}
                  promptLabel="Choose a section"
                  actionLabel="Place"
                  disabled={saving}
                  campusLabel={campusNames.size > 1 && group.campusId ? campusNames.get(group.campusId) : undefined}
                  onMove={(target) =>
                    target &&
                    ask({
                      change: change(`Section of ${group.name}`, "no section", target.name),
                      send: (stepUp) => sendJson(`${base}/class-groups/${group.id}/section`, "PUT", { sectionId: target.id, stepUp }),
                      done: `Put ${group.name} in ${target.name}.`,
                    })
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="approvers-heading" className="space-y-4">
        <div>
          <h2 id="approvers-heading" className="text-base font-bold text-fg">
            Approvers
          </h2>
          <p className="text-sm text-fg-muted">
            Each person who may approve results does so only where you say here. Someone with nowhere to approve approves nothing.
          </p>
        </div>
        {approvers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-sm text-fg-muted">
            Nobody may approve results yet. Give a person the permission on the{" "}
            <Link href={`/schools/${schoolCode}/users`} className="font-semibold text-brand-fg underline">
              Users page
            </Link>
            , then say here where they approve.
          </p>
        ) : (
          <ul className="space-y-4">
            {approvers.map((approver) => (
              <ApproverCard
                key={approver.userId}
                approver={approver}
                sections={data.sections}
                classGroups={allClassGroups}
                campusNames={campusNames}
                busy={saving}
                onSave={(entries: ScopeEntry[], toWords: string) =>
                  ask({
                    change: change(`Where ${approver.name ?? approver.email ?? "they"} approves`, describeScopes(approver.scopes), toWords),
                    send: (stepUp) => sendJson(`${base}/approvers/${approver.userId}/scopes`, "PUT", { scopes: entries, stepUp }),
                    done: `Saved where ${approver.name ?? approver.email ?? "the person"} approves: ${toWords}.`,
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <StepUpModal
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        hasMfa={hasMfa}
        deltas={pending ? [pending.change] : []}
        saving={saving}
        error={saveError}
      />
    </div>
  );
}

function AddSectionForm({
  campuses,
  disabled,
  onAsk,
}: {
  campuses: Campus[];
  disabled: boolean;
  onAsk: (name: string, campusId: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [campusId, setCampusId] = useState(campuses.length === 1 ? campuses[0].id : "");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return setProblem("Give the section a name.");
    if (clean.length > 80) return setProblem("A section's name is at most 80 characters.");
    setProblem(null);
    onAsk(clean, campusId || null);
  };

  return (
    <form
      onSubmit={submit}
      className="grid items-start gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs sm:grid-cols-[1fr_14rem_auto]"
      noValidate
    >
      <TextField
        label="New section"
        name="sectionName"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={problem}
        placeholder="For example Primary"
        maxLength={400}
        autoComplete="off"
      />
      <SelectField
        label="Campus"
        value={campusId}
        onChange={(event) => setCampusId(event.target.value)}
        options={[{ value: "", label: "All campuses" }, ...campuses.map((campus) => ({ value: campus.id, label: campus.name }))]}
      />
      <div className="sm:pt-[1.625rem]">
        <Button type="submit" variant="primary" disabled={disabled} className="w-full sm:w-auto">
          Add section
        </Button>
      </div>
    </form>
  );
}

function SectionCard({
  section,
  sections,
  disabled,
  onRename,
  onArchive,
  onMove,
}: {
  section: SectionView;
  sections: readonly SectionView[];
  disabled: boolean;
  onRename: (name: string) => void;
  onArchive: (archived: boolean) => void;
  onMove: (group: ClassGroupView, target: SectionView | null) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const [problem, setProblem] = useState<string | null>(null);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const clean = draft.replace(/\s+/g, " ").trim();
    if (!clean) return setProblem("Give the section a name.");
    if (clean.length > 80) return setProblem("A section's name is at most 80 characters.");
    if (clean === section.name) return setRenaming(false);
    setProblem(null);
    setRenaming(false);
    onRename(clean);
  };

  return (
    <li className={`rounded-2xl border bg-surface p-5 shadow-xs ${section.archived ? "border-dashed border-fg-muted" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
            <span className="break-words">{section.name}</span>
            {section.archived && (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-fg-muted">Archived</span>
            )}
          </h3>
          <p className="text-xs text-fg-muted">{section.campusName ?? "All campuses"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!section.archived && (
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-2 text-xs"
              disabled={disabled}
              aria-label={`Rename ${section.name}`}
              onClick={() => {
                setDraft(section.name);
                setProblem(null);
                setRenaming((open) => !open);
              }}
            >
              Rename
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-2 text-xs"
            disabled={disabled}
            aria-label={`${section.archived ? "Restore" : "Archive"} ${section.name}`}
            onClick={() => onArchive(!section.archived)}
          >
            {section.archived ? "Restore" : "Archive"}
          </Button>
        </div>
      </div>

      {renaming && (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-start gap-3" noValidate>
          <div className="min-w-0 flex-1">
            <TextField
              label={`New name for ${section.name}`}
              name="renameSection"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              error={problem}
              maxLength={400}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="flex gap-2 sm:pt-[1.625rem]">
            <Button type="submit" variant="primary" disabled={disabled}>
              Save name
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {section.classGroups.length === 0 ? (
        <p className="mt-3 text-xs text-fg-muted">
          No classes in this section yet. Put a class in it from the list of classes in no section, or move one here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {section.classGroups.map((group) => (
            <ClassRow
              key={group.id}
              group={group}
              targets={placementTargets(group, sections)}
              promptLabel="Move to..."
              actionLabel="Move"
              disabled={disabled}
              onMove={(target) => onMove(group, target)}
              allowNone
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/// One class and the select-and-button that moves it. The button, not the select, sends: a select fires `change` on every arrow key, and a dialog must not open under someone who is only reading the list.
function ClassRow({
  group,
  targets,
  promptLabel,
  actionLabel,
  disabled,
  allowNone = false,
  campusLabel,
  onMove,
}: {
  group: ClassGroupView;
  targets: SectionView[];
  promptLabel: string;
  actionLabel: string;
  disabled: boolean;
  allowNone?: boolean;
  campusLabel?: string;
  onMove: (target: SectionView | null) => void;
}) {
  const [value, setValue] = useState("");
  // The first option is the prompt and sends nothing, so a move is always a choice. For a class that is in a section, "No section" is a choice of its own.
  const options = [
    { value: "", label: promptLabel },
    ...targets.map((section) => ({ value: section.id, label: section.name })),
    ...(allowNone ? [{ value: NO_SECTION, label: "No section" }] : []),
  ];
  const noTarget = targets.length === 0 && !allowNone;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2">
      <span className="min-w-0 text-sm text-fg">
        {group.name}
        {campusLabel && <span className="text-fg-muted"> · {campusLabel}</span>}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
        {noTarget ? (
          <span className="text-xs text-fg-muted">No section on this campus to put it in.</span>
        ) : (
          <>
            <div className="min-w-0 sm:w-56">
              <SelectField
                label={`Section for ${group.name}`}
                hideLabel
                value={value}
                onChange={(event) => setValue(event.target.value)}
                options={options}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-2 text-xs"
              disabled={disabled || value === ""}
              aria-label={`${actionLabel} ${group.name}`}
              onClick={() => {
                onMove(targets.find((section) => section.id === value) ?? null);
                setValue("");
              }}
            >
              {actionLabel}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function ApproverCard({
  approver,
  sections,
  classGroups,
  campusNames,
  busy,
  onSave,
}: {
  approver: ApproverView;
  sections: readonly SectionView[];
  classGroups: readonly ClassGroupView[];
  campusNames: ReadonlyMap<string, string>;
  busy: boolean;
  onSave: (entries: ScopeEntry[], toWords: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const who = approver.name ?? approver.email ?? "Unnamed person";

  return (
    <li className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold break-words text-fg">{who}</h3>
          <p className="text-xs break-words text-fg-muted">
            {approver.name && approver.email ? `${approver.email} · ` : ""}
            {roleLabel(approver.role)} · {approver.campusName ?? "All campuses"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="px-3 py-2 text-xs"
          disabled={busy}
          aria-expanded={editing}
          aria-label={`${editing ? "Close the editor for" : "Change where"} ${who}${editing ? "" : " approves"}`}
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? "Close" : "Change where they approve"}
        </Button>
      </div>

      {approver.scopes.length === 0 ? (
        <p className="mt-3 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs text-warn-fg">
          Approves nothing yet. Choose where they approve.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Where ${who} approves`}>
          {approver.scopes.map((scope) => (
            <li
              key={`${scope.kind}:${scope.sectionId ?? scope.classGroupId ?? ""}`}
              className="rounded-full border border-line bg-field/30 px-3 py-1 text-xs font-medium text-fg"
            >
              {describeScope(scope)}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ScopeEditor
          key={approver.scopes.map((scope) => `${scope.kind}${scope.sectionId ?? scope.classGroupId ?? ""}`).join("|")}
          approver={approver}
          sections={sections}
          classGroups={classGroups}
          campusNames={campusNames}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(entries, toWords) => {
            setEditing(false);
            onSave(entries, toWords);
          }}
        />
      )}
    </li>
  );
}
