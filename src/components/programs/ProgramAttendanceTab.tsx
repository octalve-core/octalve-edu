"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";
import { SectionTabs } from "@/components/forms/SectionTabs";
import type { Roll, RollRow, SessionRow, Summary, PersonAttendance } from "@/lib/programs/attendance-service";
import { dayText, when, type ProgramDetail } from "@/components/programs/model";
import {
  STATUSES,
  STATUS_STYLE,
  STATUS_TEXT,
  allPresent,
  pendingMarks,
  percentText,
  reasonNeeded,
  remarksShown,
  rollNote,
  shiftDay,
  statusOf,
  unmarkedCount,
  type Draft,
  type StatusKey,
} from "@/components/programs/attendance-model";

// Attendance (task 0027, slice P3): the roll of one group on one day, a summary over a range, and the sessions of the week. Presentation only: the API decides which groups a person
// reaches, who may mark what and for which days, and refuses a stale save - this screen shows what it is told and sends back the version it saw.

const VIEWS = [
  { id: "roll", label: "Roll call" },
  { id: "summary", label: "Summary" },
  { id: "week", label: "This week" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const say = (reply: Reply, fallback: string): string => (reply.ok ? fallback : failureText(reply.status, reply.message) || fallback);

const todayDay = (): string => new Date().toISOString().slice(0, 10);

export function ProgramAttendanceTab({ program, base }: { program: ProgramDetail; base: string }) {
  const attendance = program.attendance;
  const groups = program.groups.filter((group) => attendance.readGroupIds.includes(group.id));
  const [view, setView] = useState<ViewId>("roll");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [date, setDate] = useState(todayDay);
  const [typed, setTyped] = useState("");
  const [label, setLabel] = useState("");

  // The session name applies a moment after typing stops (every change of it opens another roll).
  useEffect(() => {
    const timer = setTimeout(() => setLabel(typed.trim()), 400);
    return () => clearTimeout(timer);
  }, [typed]);

  if (groups.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
        There is no group you take attendance for yet.
      </p>
    );

  return (
    <section aria-labelledby="program-attendance" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id="program-attendance" className="text-lg font-semibold text-fg">
        Attendance
      </h2>
      <p className="text-sm text-fg-muted">
        A session is one group on one day. The roll lists the group and the groups inside it, once each. Today and the 6 days before can be
        marked by a teacher or a recorder; a program admin can mark any past day. Marks are kept with who made them, and a correction keeps
        what it replaced.
      </p>
      <SectionTabs label="Attendance views" idPrefix="attendance-" sections={VIEWS} active={view} onChange={setView}>
        <div className="space-y-4 pt-4">
          {view !== "week" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                options={groups.map((group) => ({ value: group.id, label: group.path }))}
              />
              {view === "roll" && (
                <>
                  <TextField
                    label="Date"
                    type="date"
                    value={date}
                    max={todayDay()}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                  <TextField
                    label="Session name"
                    value={typed}
                    maxLength={40}
                    placeholder="Optional, e.g. Morning"
                    hint="Two sessions on one day need different names."
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </>
              )}
            </div>
          )}
          {view === "roll" && (
            <RollView key={`${groupId}|${date}|${label}`} program={program} base={base} groupId={groupId} date={date} label={label} />
          )}
          {view === "summary" && <SummaryView program={program} base={base} groupId={groupId} />}
          {view === "week" && (
            <WeekView
              program={program}
              base={base}
              groups={groups}
              onOpen={(session) => {
                setGroupId(session.groupId);
                setDate(session.date);
                setTyped(session.label);
                setLabel(session.label);
                setView("roll");
              }}
            />
          )}
        </div>
      </SectionTabs>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Roll call

function RollView({
  program,
  base,
  groupId,
  date,
  label,
}: {
  program: ProgramDetail;
  base: string;
  groupId: string;
  date: string;
  label: string;
}) {
  const attendanceUrl = `${base}/attendance`;
  const [roll, setRoll] = useState<Roll | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ variant: "success" | "error"; text: string; reload?: boolean } | null>(null);
  const [reloads, setReloads] = useState(0);
  const [noting, setNoting] = useState<string | null>(null);
  const [history, setHistory] = useState<RollRow | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ groupId, date, label: label.trim() });
    void getJson(`${attendanceUrl}?${params.toString()}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The roll couldn't be loaded."));
      setFailed(null);
      setRoll(reply.data as unknown as Roll);
    });
    return () => controller.abort();
  }, [attendanceUrl, groupId, date, label, reloads]);

  const choose = useCallback((row: RollRow, status: StatusKey) => {
    setOutcome(null);
    setDrafts((current) => ({
      ...current,
      [row.participantId]: { status, remarks: current[row.participantId]?.remarks ?? row.mark?.remarks ?? "" },
    }));
  }, []);

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!roll) return <p className="text-sm text-fg-muted">Loading…</p>;

  const pending = pendingMarks(roll.rows, drafts);
  const needReason = reasonNeeded(roll, roll.rows, pending);
  const note = rollNote(roll);
  const open = roll.rights.create || roll.rights.change;
  const missing = unmarkedCount(roll.rows, drafts);
  const reasonOk = !needReason || reason.trim().length >= 3;

  async function save() {
    if (!roll) return;
    setSaving(true);
    setOutcome(null);
    const reply = await sendJson(attendanceUrl, "PUT", {
      groupId,
      date,
      label: label.trim(),
      ...(needReason ? { reason: reason.trim() } : {}),
      marks: pending,
    });
    setSaving(false);
    if (reply.ok) {
      const result = reply.data as unknown as { created: number; changed: number };
      setOutcome({ variant: "success", text: `Saved: ${result.created} marked, ${result.changed} corrected.` });
      setDrafts({});
      setReason("");
      setNoting(null);
      setReloads((n) => n + 1);
      return;
    }
    setOutcome({
      variant: "error",
      text: say(reply, "That didn't save."),
      reload: reply.code === "CHANGED" || reply.code === "NOT_ON_ROLL" || reply.code === "NOT_MARKABLE",
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-2">
        <span className="font-semibold text-fg">{roll.group.path}</span> · {dayText(roll.date)}
        {roll.label ? ` · ${roll.label}` : ""}
        {roll.sessionId ? "" : " · not taken yet"}
      </p>
      {note && <Alert variant={roll.attendance.on ? "info" : "warning"}>{note}</Alert>}
      {roll.attendance.on && roll.attendance.campusesOff.length > 0 && (
        <p className="text-xs text-fg-muted">
          Attendance is switched off in {roll.attendance.campusesOff.map((campus) => campus.name).join(", ")}: their people are not on this
          roll.
        </p>
      )}
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
                Reload the roll
              </button>
            </>
          )}
        </Alert>
      )}
      {roll.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          No one is on this roll for that day.
        </p>
      ) : (
        <>
          <p className="text-xs text-fg-muted" aria-live="polite">
            {roll.rows.filter((row) => row.listed).length} on the roll · {roll.marked} marked
            {roll.marked > 0
              ? ` (${STATUSES.map((status) => `${STATUS_TEXT[status]} ${roll.counts[status.toLowerCase() as "present"]}`).join(", ")})`
              : ""}
          </p>
          {open && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!roll.rights.create || missing === 0}
                onClick={() => setDrafts(allPresent(roll.rows, drafts))}
              >
                Mark everyone present
              </Button>
            </div>
          )}
          <ul className="space-y-2" aria-label="Roll">
            {roll.rows.map((row) => {
              const chosen = statusOf(row, drafts);
              const remarks = remarksShown(row, drafts);
              return (
                <li key={row.participantId} className="space-y-2 rounded-xl border border-line px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-fg">
                        {row.name}
                        {row.flag === "SUSPENDED" && (
                          <span className="ml-2 rounded-full border border-warn-line bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn-fg">
                            Suspended
                          </span>
                        )}
                        {!row.listed && (
                          <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-2">
                            No longer on this roll
                          </span>
                        )}
                        {row.campusOff && (
                          <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-fg-2">
                            Campus has attendance off
                          </span>
                        )}
                      </p>
                      {row.groupPath !== roll.group.path && <p className="break-words text-xs text-fg-muted">{row.groupPath}</p>}
                      {row.mark && (
                        <p className="text-xs text-fg-muted">
                          Marked by {row.mark.markedBy}, {when(row.mark.markedAt)}
                          {row.mark.corrected ? ` · corrected ${row.mark.version - 1} ${row.mark.version === 2 ? "time" : "times"}` : ""}
                        </p>
                      )}
                    </div>
                    <div role="group" aria-label={`Attendance of ${row.name}`} className="flex flex-wrap gap-1.5">
                      {STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          aria-pressed={chosen === status}
                          disabled={!row.canEdit}
                          onClick={() => choose(row, status)}
                          className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed ${
                            chosen === status
                              ? STATUS_STYLE[status]
                              : "border-line bg-surface text-fg-2 hover:bg-surface-2 disabled:text-fg-muted"
                          }`}
                        >
                          {STATUS_TEXT[status]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {noting === row.participantId && row.canEdit ? (
                    <TextField
                      label={`Note for ${row.name}`}
                      value={remarks}
                      maxLength={200}
                      onChange={(e) => {
                        const text = e.target.value;
                        setDrafts((current) => ({
                          ...current,
                          [row.participantId]: {
                            status: current[row.participantId]?.status ?? row.mark?.status ?? "PRESENT",
                            remarks: text,
                          },
                        }));
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {remarks && <p className="break-words text-xs text-fg-2">Note: {remarks}</p>}
                      {row.canEdit && (chosen !== null || remarks) && (
                        <Button
                          variant="ghost"
                          aria-label={`${remarks ? "Edit the note of" : "Add a note for"} ${row.name}`}
                          onClick={() => setNoting(row.participantId)}
                        >
                          {remarks ? "Edit note" : "Add note"}
                        </Button>
                      )}
                      <Button variant="ghost" aria-label={`Attendance history of ${row.name}`} onClick={() => setHistory(row)}>
                        History
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {open && (
            <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
              {needReason && (
                <TextField
                  label="Why are you correcting a mark?"
                  value={reason}
                  maxLength={500}
                  hint="Kept with the correction. At least 3 characters."
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg-2" aria-live="polite">
                  {pending.length === 0 ? "Nothing to save." : `${pending.length} to save.`}
                  {missing > 0 ? ` ${missing} not marked yet.` : ""}
                </p>
                <Button loading={saving} disabled={pending.length === 0 || !reasonOk} onClick={() => void save()}>
                  Save attendance
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <HistoryDialog base={base} row={history} onClose={() => setHistory(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Summary

function SummaryView({ program, base, groupId }: { program: ProgramDetail; base: string; groupId: string }) {
  const [to, setTo] = useState(todayDay);
  const [from, setFrom] = useState(() => shiftDay(todayDay(), -29));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [history, setHistory] = useState<{ participantId: string; name: string } | null>(null);

  useEffect(() => {
    if (from > to) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ groupId, from, to });
    void getJson(`${base}/attendance/summary?${params.toString()}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The summary couldn't be loaded."));
      setFailed(null);
      setSummary(reply.data as unknown as Summary);
    });
    return () => controller.abort();
  }, [base, groupId, from, to]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="From" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} max={todayDay()} onChange={(e) => e.target.value && setTo(e.target.value)} />
      </div>
      {from > to && <Alert variant="error">The first date comes after the last.</Alert>}
      {failed && <Alert variant="error">{failed}</Alert>}
      {!summary && !failed && from <= to && <p className="text-sm text-fg-muted">Loading…</p>}
      {summary && (
        <>
          <p className="text-sm text-fg-2" aria-live="polite">
            {summary.rows.length} {summary.rows.length === 1 ? "person" : "people"} · overall {percentText(summary.totals.percent)} over{" "}
            {summary.totals.held} marks. A person is flagged under {summary.threshold}%. Excused sessions are left out of the percentage.
          </p>
          {summary.truncated && <Alert variant="info">Only the first people are listed. Pick a smaller group to see everyone.</Alert>}
          {summary.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
              No one in this group yet.
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Attendance summary">
              {summary.rows.map((row) => (
                <li
                  key={row.participantId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-fg">{row.name}</p>
                    <p className="break-words text-xs text-fg-muted">
                      {row.groupPath} · Present {row.counts.present}, Late {row.counts.late}, Absent {row.counts.absent}, Excused{" "}
                      {row.counts.excused}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${row.low ? "border-danger-line bg-danger-bg text-danger-fg" : "border-line-strong bg-surface-2 text-fg-2"}`}
                    >
                      {percentText(row.percent)}
                      {row.low ? " · Low" : ""}
                    </span>
                    <Button
                      variant="ghost"
                      aria-label={`Attendance history of ${row.name}`}
                      onClick={() => setHistory({ participantId: row.participantId, name: row.name })}
                    >
                      History
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <HistoryDialog base={base} row={history} onClose={() => setHistory(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The week

function WeekView({
  base,
  groups,
  onOpen,
}: {
  program: ProgramDetail;
  base: string;
  groups: ProgramDetail["groups"];
  onOpen: (session: SessionRow) => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const to = todayDay();
    const params = new URLSearchParams({ from: shiftDay(to, -6), to });
    void getJson(`${base}/attendance/sessions?${params.toString()}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The week couldn't be loaded."));
      setFailed(null);
      setSessions((reply.data as unknown as { sessions: SessionRow[] }).sessions);
    });
    return () => controller.abort();
  }, [base]);

  const open = new Set(groups.map((group) => group.id));
  return (
    <div className="space-y-3">
      {failed && <Alert variant="error">{failed}</Alert>}
      {!sessions && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {sessions && sessions.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          No attendance has been taken in the last 7 days.
        </p>
      )}
      {sessions && sessions.length > 0 && (
        <ul className="space-y-2" aria-label="Sessions this week">
          {sessions
            .filter((session) => open.has(session.groupId))
            .map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold text-fg">
                    {session.groupPath} · {dayText(session.date)}
                    {session.label ? ` · ${session.label}` : ""}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {session.marked} marked: Present {session.counts.present}, Late {session.counts.late}, Absent {session.counts.absent},
                    Excused {session.counts.excused}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Open the roll of ${session.groupPath} on ${dayText(session.date)}${session.label ? `, ${session.label}` : ""}`}
                  onClick={() => onOpen(session)}
                >
                  Open roll
                </Button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// One person's history

function HistoryDialog({ base, row, onClose }: { base: string; row: { participantId: string; name: string } | null; onClose: () => void }) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title={row ? `Attendance of ${row.name}` : "Attendance"}
      description="Newest first, with every correction kept."
    >
      {row && <HistoryBody key={row.participantId} base={base} participantId={row.participantId} onClose={onClose} />}
    </Dialog>
  );
}

function HistoryBody({ base, participantId, onClose }: { base: string; participantId: string; onClose: () => void }) {
  const [data, setData] = useState<PersonAttendance | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(`${base}/attendance/people/${participantId}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The history couldn't be loaded."));
      setData(reply.data as unknown as PersonAttendance);
    });
    return () => controller.abort();
  }, [base, participantId]);

  return (
    <div className="mt-4 space-y-3">
      {failed && <Alert variant="error">{failed}</Alert>}
      {!data && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {data && (
        <>
          <p className="text-sm text-fg-2">
            {percentText(data.percent)}
            {data.low ? ` · under ${data.threshold}%` : ""} · Present {data.counts.present}, Late {data.counts.late}, Absent{" "}
            {data.counts.absent}, Excused {data.counts.excused}
          </p>
          {data.marks.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing has been marked yet.</p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto" aria-label="Marks">
              {data.marks.map((mark) => (
                <li key={mark.id} className="space-y-1 rounded-xl border border-line px-3 py-2 text-sm">
                  <p className="break-words text-fg">
                    <span className="font-semibold">{dayText(mark.date)}</span>
                    {mark.label ? ` · ${mark.label}` : ""} · {STATUS_TEXT[mark.status]}
                    {mark.remarks ? ` · ${mark.remarks}` : ""}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {mark.groupPath} · marked by {mark.markedBy}, {when(mark.markedAt)}
                  </p>
                  {mark.changes.map((change) => (
                    <p key={change.at} className="break-words text-xs text-fg-2">
                      {when(change.at)}: {change.by} changed {STATUS_TEXT[change.from]} to {STATUS_TEXT[change.to]}
                      {change.reason ? ` (${change.reason})` : ""}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {data.truncated && <p className="text-xs text-fg-muted">Only the latest marks are shown.</p>}
        </>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
