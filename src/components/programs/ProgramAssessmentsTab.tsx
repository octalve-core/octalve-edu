"use client";

import { useProgramBase } from "./program-base";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";
import { SectionTabs } from "@/components/forms/SectionTabs";
import type { AssessmentDetail, AssessmentList, AssessmentSummary, ResultRow, SheetRow } from "@/lib/programs/assessment-service";
import { CODE_TEXT, type AssessmentAction, type ScoreCode } from "@/lib/programs/assessment-rules";
import { dayText, when, type ProgramDetail } from "@/components/programs/model";
import {
  ACTION_TEXT,
  CODE_OPTIONS,
  STATUS_STYLE,
  STATUS_TEXT,
  draftProblem,
  missingCount,
  pendingScores,
  reasonNeeded,
  resultText,
  startingDraft,
  type ScoreDraft,
} from "@/components/programs/assessment-model";

// Assessments (task 0027, slice P3b): the list, one assessment's score sheet, and the results across the published ones. Presentation only: the API decides which assessments a person
// sees, who may enter which scores and when, and refuses a stale save - this screen shows what it is told and sends back the version it saw.

const say = (reply: Reply, fallback: string): string => (reply.ok ? fallback : failureText(reply.status, reply.message) || fallback);

const VIEWS = [
  { id: "list", label: "Assessments" },
  { id: "results", label: "Results" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

export function ProgramAssessmentsTab({ program }: { program: ProgramDetail }) {
  const [view, setView] = useState<ViewId>("list");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section aria-labelledby="program-assessments" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id="program-assessments" className="text-lg font-semibold text-fg">
        Assessments
      </h2>
      {openId ? (
        <SheetView key={openId} program={program} id={openId} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            An assessment is one dated sitting, given to the whole program or to chosen groups. Teachers and recorders enter scores for the
            people in their groups while it is open; a program admin publishes the results. Every score and every change is kept with who
            made it.
          </p>
          <SectionTabs label="Assessment views" idPrefix="assessments-" sections={VIEWS} active={view} onChange={setView}>
            <div className="space-y-4 pt-4">
              {view === "list" && <ListView program={program} onOpen={setOpenId} />}
              {view === "results" && <ResultsView program={program} />}
            </div>
          </SectionTabs>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The list

function StatusPill({ status }: { status: AssessmentSummary["status"] }) {
  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_TEXT[status]}</span>
  );
}

function ListView({ program, onOpen }: { program: ProgramDetail; onOpen: (id: string) => void }) {
  const programBase = useProgramBase();
  const base = `${programBase}/assessments`;
  const [list, setList] = useState<AssessmentList | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(base, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The assessments couldn't be loaded."));
      setFailed(null);
      setList(reply.data as unknown as AssessmentList);
    });
    return () => controller.abort();
  }, [base, version]);

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!list) return <p className="text-sm text-fg-muted">Loading…</p>;
  return (
    <div className="space-y-3">
      {notice && <Alert variant="success">{notice}</Alert>}
      {list.canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>New assessment</Button>
        </div>
      )}
      {list.assessments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          There is no assessment to show yet.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Assessments">
          {list.assessments.map((a) => (
            <li key={a.id} className="space-y-1 rounded-xl border border-line px-3 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-fg">
                    {a.title}
                    {a.kind ? (
                      <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-2">
                        {a.kind}
                      </span>
                    ) : null}
                  </p>
                  <p className="break-words text-fg-muted">
                    {dayText(a.date)} · out of {a.maxScore}
                    {a.passMark !== null ? ` · pass mark ${a.passMark}` : ""} ·{" "}
                    {a.whole ? "Whole program" : a.groups.map((g) => g.path).join(", ")}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {a.scored} {a.scored === 1 ? "score" : "scores"}
                    {a.required ? " · required for completion" : ""}
                  </p>
                </div>
                <StatusPill status={a.status} />
              </div>
              <Button variant="ghost" aria-label={`Open ${a.title}`} onClick={() => onOpen(a.id)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AssessmentDialog
        open={creating}
        program={program}
        initial={null}
        onClose={() => setCreating(false)}
        onSaved={(text) => {
          setCreating(false);
          setNotice(text);
          setVersion((n) => n + 1);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Making and changing an assessment

function AssessmentDialog({
  open,
  program,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  program: ProgramDetail;
  initial: AssessmentDetail | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? "Change the assessment" : "New assessment"}
      description={initial ? undefined : "It starts as a draft: open it when scores can be entered."}
    >
      {open && <AssessmentForm key={initial?.id ?? "new"} program={program} initial={initial} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function AssessmentForm({
  program,
  initial,
  onClose,
  onSaved,
}: {
  program: ProgramDetail;
  initial: AssessmentDetail | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const programBase = useProgramBase();
  const labelsOnly = initial?.rights.edit === "LABELS";
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "");
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [maxScore, setMaxScore] = useState(initial ? String(initial.maxScore) : "100");
  const [passMark, setPassMark] = useState(initial?.passMark != null ? String(initial.passMark) : "");
  const [weight, setWeight] = useState(initial ? String(initial.weight) : "1");
  const [required, setRequired] = useState(initial?.required ?? false);
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set(initial?.groups.map((g) => g.id) ?? []));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const live = program.groups.filter((g) => !g.archived);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const num = (text: string) => (text.trim() === "" ? null : Number(text.replace(",", ".")));
    const body = {
      title,
      kind,
      ...(labelsOnly ? {} : { date, maxScore: num(maxScore), groupIds: [...groupIds] }),
      passMark: num(passMark),
      weight: num(weight),
      required,
    };
    const base = `${programBase}/assessments`;
    const reply = initial ? await sendJson(`${base}/${encodeURIComponent(initial.id)}`, "PATCH", body) : await sendJson(base, "POST", body);
    setPending(false);
    if (reply.ok) return onSaved(initial ? "The assessment was changed." : "The assessment was made as a draft.");
    const errors: Record<string, string> = {};
    for (const field of ["title", "kind", "date", "maxScore", "passMark", "weight"]) {
      const message = problemFor(reply, field);
      if (message) errors[field] = message;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setError(say(reply, "That didn't save."));
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert variant="error">{error}</Alert>}
      <TextField label="Title" value={title} maxLength={120} error={fieldErrors.title} onChange={(e) => setTitle(e.target.value)} />
      <TextField
        label="Kind"
        value={kind}
        maxLength={40}
        placeholder="Test, Recitation, Practical…"
        error={fieldErrors.kind}
        onChange={(e) => setKind(e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Date"
          type="date"
          value={date}
          disabled={labelsOnly}
          error={fieldErrors.date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TextField
          label="Out of"
          inputMode="decimal"
          value={maxScore}
          disabled={labelsOnly}
          error={fieldErrors.maxScore}
          onChange={(e) => setMaxScore(e.target.value)}
        />
        <TextField
          label="Pass mark"
          inputMode="decimal"
          value={passMark}
          hint="Optional."
          error={fieldErrors.passMark}
          onChange={(e) => setPassMark(e.target.value)}
        />
        <TextField
          label="Weight"
          inputMode="decimal"
          value={weight}
          hint="How much it counts in the average."
          error={fieldErrors.weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>
      <CheckboxField label="Required for completion" checked={required} onChange={(e) => setRequired(e.target.checked)} />
      {!labelsOnly && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Who is it for?</legend>
          <p className="text-xs text-fg-muted">Tick none for the whole program. A group includes the groups inside it.</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label="Groups">
            {live.map((group) => (
              <li key={group.id}>
                <CheckboxField
                  label={group.path}
                  checked={groupIds.has(group.id)}
                  onChange={(e) =>
                    setGroupIds((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(group.id);
                      else next.delete(group.id);
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {initial ? "Save changes" : "Make assessment"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The score sheet

function SheetView({ program, id, onBack }: { program: ProgramDetail; id: string; onBack: () => void }) {
  const programBase = useProgramBase();
  const base = `${programBase}/assessments/${encodeURIComponent(id)}`;
  const [data, setData] = useState<AssessmentDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ScoreDraft>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ variant: "success" | "error"; text: string; reload?: boolean } | null>(null);
  const [reloads, setReloads] = useState(0);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [history, setHistory] = useState<SheetRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<AssessmentAction | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(base, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The assessment couldn't be loaded."));
      setFailed(null);
      setData(reply.data as unknown as AssessmentDetail);
    });
    return () => controller.abort();
  }, [base, reloads]);

  const draftOf = useCallback((row: SheetRow) => drafts[row.participantId] ?? startingDraft(row), [drafts]);
  const type = useCallback((row: SheetRow, patch: Partial<ScoreDraft[string]>) => {
    setOutcome(null);
    setDrafts((current) => ({ ...current, [row.participantId]: { ...(current[row.participantId] ?? startingDraft(row)), ...patch } }));
  }, []);

  if (failed)
    return (
      <div className="space-y-3">
        <Button variant="ghost" onClick={onBack}>
          Back to the assessments
        </Button>
        <Alert variant="error">{failed}</Alert>
      </div>
    );
  if (!data) return <p className="text-sm text-fg-muted">Loading…</p>;

  const max = data.maxScore;
  const pending = pendingScores(data.rows, drafts, max);
  const needReason = reasonNeeded(data.rights.reasonOnChange, pending);
  const reasonOk = !needReason || reason.trim().length >= 3;
  const missing = missingCount(data.rows, drafts, max);
  const invalid = data.rows.some((row) => draftProblem(row, drafts[row.participantId], max) !== null);

  async function save() {
    setSaving(true);
    setOutcome(null);
    const reply = await sendJson(`${base}/scores`, "PUT", { ...(needReason ? { reason: reason.trim() } : {}), entries: pending });
    setSaving(false);
    if (reply.ok) {
      const result = reply.data as unknown as { created: number; changed: number };
      setOutcome({ variant: "success", text: `Saved: ${result.created} entered, ${result.changed} changed.` });
      setDrafts({});
      setReason("");
      setCommenting(null);
      setReloads((n) => n + 1);
      return;
    }
    setOutcome({
      variant: "error",
      text: say(reply, "That didn't save."),
      reload: ["CHANGED", "NOT_ON_SHEET", "NOT_MARKABLE", "NOT_OPEN"].includes(reply.code ?? ""),
    });
  }

  async function act(action: AssessmentAction) {
    setActing(true);
    const reply = await sendJson(base, "POST", { action });
    setActing(false);
    setAsking(null);
    if (reply.ok) {
      setOutcome({ variant: "success", text: ACTION_TEXT[action].done });
      setDrafts({});
      setReloads((n) => n + 1);
    } else setOutcome({ variant: "error", text: say(reply, "That didn't work.") });
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack}>
        Back to the assessments
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-fg">
            {data.title}
            {data.kind ? ` · ${data.kind}` : ""}
          </h3>
          <p className="text-sm text-fg-muted">
            {dayText(data.date)} · out of {data.maxScore}
            {data.passMark !== null ? ` · pass mark ${data.passMark}` : ""} · weight {data.weight} ·{" "}
            {data.whole ? "Whole program" : data.groups.map((g) => g.path).join(", ")}
          </p>
        </div>
        <StatusPill status={data.status} />
      </div>
      {!data.state.on && <Alert variant="warning">Assessments are switched off, so this can only be read.</Alert>}
      {data.date > data.today && <Alert variant="info">This assessment has not taken place yet, so scores can&apos;t be entered.</Alert>}
      {data.rights.edit || data.rights.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.rights.edit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Change details
            </Button>
          )}
          {data.rights.actions.map((action) => (
            <Button
              key={action}
              variant={action === "archive" ? "danger" : "secondary"}
              onClick={() => (ACTION_TEXT[action].ask ? setAsking(action) : void act(action))}
              loading={acting && asking === null}
            >
              {ACTION_TEXT[action].button}
            </Button>
          ))}
        </div>
      ) : null}
      {outcome && (
        <Alert variant={outcome.variant}>
          {outcome.text}
          {outcome.reload && (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  setDrafts({});
                  setOutcome(null);
                  setReloads((n) => n + 1);
                }}
              >
                Reload the sheet
              </button>
            </>
          )}
        </Alert>
      )}
      <p className="text-xs text-fg-muted" aria-live="polite">
        {data.counts.expected} to score · {data.counts.entered} entered
        {data.counts.missing > 0 ? ` · ${data.counts.missing} still to do` : ""}
        {data.counts.average !== null ? ` · average ${data.counts.average}%` : ""}
      </p>
      {data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          No one is on this assessment.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Scores">
          {data.rows.map((row) => {
            const draft = draftOf(row);
            const problem = draftProblem(row, drafts[row.participantId], max);
            return (
              <li key={row.participantId} className="space-y-2 rounded-xl border border-line px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-fg">
                      {row.name}
                      {row.flag === "SUSPENDED" && (
                        <span className="ml-2 rounded-full border border-warn-line bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-fg">
                          Not sitting (suspended)
                        </span>
                      )}
                      {!row.listed && (
                        <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-2">
                          No longer on this assessment
                        </span>
                      )}
                      {row.campusOff && (
                        <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-2">
                          Campus has assessments off
                        </span>
                      )}
                    </p>
                    <p className="break-words text-xs text-fg-muted">{row.groupPath}</p>
                    {row.entry && (
                      <p className="text-xs text-fg-muted">
                        {resultText(row)} · entered by {row.entry.markedBy}
                        {row.entry.corrected ? ` · changed ${row.entry.version - 1} ${row.entry.version === 2 ? "time" : "times"}` : ""}
                      </p>
                    )}
                    {row.entry?.comment && <p className="break-words text-xs text-fg-2">Comment: {row.entry.comment}</p>}
                  </div>
                  {!row.canEdit && <span className="text-xs text-fg-muted">{row.entry ? "" : "No score"}</span>}
                </div>
                {row.canEdit && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextField
                      label={`Score for ${row.name}`}
                      inputMode="decimal"
                      value={draft.code === "" ? draft.score : ""}
                      disabled={draft.code !== ""}
                      hint={`Out of ${max}`}
                      error={problem}
                      onChange={(e) => type(row, { score: e.target.value, code: "" })}
                    />
                    <SelectField
                      label={`Result for ${row.name}`}
                      value={draft.code}
                      options={CODE_OPTIONS}
                      onChange={(e) =>
                        type(row, { code: e.target.value as "" | ScoreCode, score: e.target.value === "" ? draft.score : "" })
                      }
                    />
                  </div>
                )}
                {row.canEdit && commenting === row.participantId && (
                  <TextField
                    label={`Comment for ${row.name}`}
                    value={draft.comment}
                    maxLength={500}
                    onChange={(e) => type(row, { comment: e.target.value })}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {row.canEdit && commenting !== row.participantId && (
                    <Button
                      variant="ghost"
                      aria-label={`${draft.comment ? "Edit the comment of" : "Add a comment for"} ${row.name}`}
                      onClick={() => setCommenting(row.participantId)}
                    >
                      {draft.comment ? "Edit comment" : "Add comment"}
                    </Button>
                  )}
                  {row.entry && (
                    <Button variant="ghost" aria-label={`Score history of ${row.name}`} onClick={() => setHistory(row)}>
                      History
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.rights.enter && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
          {needReason && (
            <TextField
              label="Why is a published score being changed?"
              value={reason}
              maxLength={500}
              hint="Kept with the change. At least 3 characters."
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-2" aria-live="polite">
              {pending.length === 0 ? "Nothing to save." : `${pending.length} to save.`}
              {missing > 0 ? ` ${missing} not scored yet.` : ""}
            </p>
            <Button loading={saving} disabled={pending.length === 0 || !reasonOk || invalid} onClick={() => void save()}>
              Save scores
            </Button>
          </div>
        </div>
      )}
      <AssessmentDialog
        open={editing}
        program={program}
        initial={data}
        onClose={() => setEditing(false)}
        onSaved={(text) => {
          setEditing(false);
          setOutcome({ variant: "success", text });
          setReloads((n) => n + 1);
        }}
      />
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking ? `${ACTION_TEXT[asking].button}?` : ""}
        description={asking ? (ACTION_TEXT[asking].ask ?? undefined) : undefined}
      >
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={() => setAsking(null)}>
            Cancel
          </Button>
          <Button variant={asking === "archive" ? "danger" : "primary"} loading={acting} onClick={() => asking && void act(asking)}>
            {asking ? ACTION_TEXT[asking].button : ""}
          </Button>
        </div>
      </Dialog>
      <HistoryDialog base={base} row={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function HistoryDialog({ base, row, onClose }: { base: string; row: SheetRow | null; onClose: () => void }) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title={row ? `Score history of ${row.name}` : "Score history"}
      description="Newest first."
    >
      {row && <HistoryBody key={row.participantId} base={base} row={row} onClose={onClose} />}
    </Dialog>
  );
}

function HistoryBody({ base, row, onClose }: { base: string; row: SheetRow; onClose: () => void }) {
  const [changes, setChanges] = useState<
    { at: string; by: string; before: string | null; after: string | null; reason: string | null }[] | null
  >(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void getJson(`${base}/history?personId=${encodeURIComponent(row.participantId)}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The history couldn't be loaded."));
      setChanges((reply.data as unknown as { changes: typeof changes & object }).changes);
    });
    return () => controller.abort();
  }, [base, row.participantId]);
  const show = (value: string | null) => (value === null ? "nothing" : value in CODE_TEXT ? CODE_TEXT[value as ScoreCode] : value);
  return (
    <div className="mt-4 space-y-3">
      {failed && <Alert variant="error">{failed}</Alert>}
      {!changes && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {changes && (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto" aria-label="Changes">
          {changes.map((c) => (
            <li key={c.at + c.by} className="break-words rounded-xl border border-line px-3 py-2 text-sm text-fg">
              {when(c.at)}: {c.by} {c.before === null ? `entered ${show(c.after)}` : `changed ${show(c.before)} to ${show(c.after)}`}
              {c.reason ? ` (${c.reason})` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Results

function ResultsView({ program }: { program: ProgramDetail }) {
  const programBase = useProgramBase();
  const [groupId, setGroupId] = useState("");
  const [data, setData] = useState<{ assessments: { id: string; title: string }[]; rows: ResultRow[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const groups = program.groups.filter((g) => !g.archived);

  useEffect(() => {
    const controller = new AbortController();
    const query = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
    void getJson(`${programBase}/assessments/results${query}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The results couldn't be loaded."));
      setFailed(null);
      setData(reply.data as unknown as NonNullable<typeof data>);
    });
    return () => controller.abort();
  }, [program.id, groupId]);

  return (
    <div className="space-y-3">
      <SelectField
        label="Group"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        options={[{ value: "", label: "Every group" }, ...groups.map((g) => ({ value: g.id, label: g.path }))]}
      />
      {failed && <Alert variant="error">{failed}</Alert>}
      {!data && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {data && data.assessments.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          No assessment has been published yet.
        </p>
      )}
      {data && data.assessments.length > 0 && (
        <ul className="space-y-2" aria-label="Results">
          {data.rows.map((row) => (
            <li key={row.participantId} className="space-y-1 rounded-xl border border-line px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words font-semibold text-fg">
                  {row.name} <span className="text-xs font-normal text-fg-muted">{row.groupPath}</span>
                </p>
                <span className="rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-xs font-semibold text-fg-2">
                  {row.average === null ? "No average" : `${row.average}%${row.grade ? ` · ${row.grade}` : ""}`}
                </span>
              </div>
              <p className="break-words text-xs text-fg-muted">
                {row.cells
                  .map(
                    (c) =>
                      `${c.title}: ${c.code ? CODE_TEXT[c.code] : c.percent === null ? "no score" : `${c.percent}%${c.grade ? ` ${c.grade}` : ""}`}`,
                  )
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
