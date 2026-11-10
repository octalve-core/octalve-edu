"use client";

import { useState, type FormEvent } from "react";
import { StatusPill } from "@/components/academics/parts";
import { failureText, useApi } from "@/components/academics/useApi";
import { sendJson } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";

// Standing (task 0028): where a pupil, a member of staff or a user stands - taking part, suspended (until a day, or until someone lifts it), expelled (pupils) or terminated (staff and
// users) - the reasons and who decided, kept as a history nobody can edit. The buttons shown are the ones that fit the person's role and the current standing; the API decides again
// and says why not (a campus administrator suspends only while the school allows it, only the school's administrator expels, terminates and reinstates). Presentation only.

export type StandingSubject = "student" | "staff" | "member";
type Action = "suspend" | "lift" | "expel" | "terminate" | "reinstate";
type Entry = { id: string; action: string; reason: string; startsOn: string; endsOn: string | null; decidedBy: string; at: string };
type View = { standing: string; until: string | null; events: Entry[] };

const WORDS: Record<StandingSubject, { ends: Action; endedPill: string; endedVerb: string; endedHeading: string }> = {
  student: { ends: "expel", endedPill: "Expelled", endedVerb: "Expel", endedHeading: "Expel this pupil" },
  staff: { ends: "terminate", endedPill: "Terminated", endedVerb: "Terminate", endedHeading: "Terminate this member of staff" },
  member: { ends: "terminate", endedPill: "Terminated", endedVerb: "Terminate", endedHeading: "Terminate this user" },
};
const EVENT_LABEL: Record<string, string> = {
  SUSPENDED: "Suspended",
  EXPELLED: "Expelled",
  TERMINATED: "Terminated",
  LIFTED: "Suspension lifted",
  REINSTATED: "Reinstated",
};
const REASON_HINT =
  "Required (3 to 500 characters). It is kept in the history and is never shown to the pupil, their guardians or the person themselves.";

const dayText = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function StandingPanel({
  schoolCode,
  path,
  subject,
  name,
  canSuspend,
  canDecide,
  onChanged,
}: {
  schoolCode: string;
  /// The route after `/api/v1/schools/<code>/`: `people/students/<id>/standing`, `people/staff/<id>/standing` or `members/<userId>/standing`.
  path: string;
  subject: StandingSubject;
  /// The person's name, for the dialogs.
  name: string;
  /// May suspend and lift (the school's administrator, or a campus administrator): the API checks the campus and the school's switch.
  canSuspend: boolean;
  /// May expel or terminate, and reinstate (the school's administrator only).
  canDecide: boolean;
  onChanged?: () => void;
}) {
  const url = `/api/v1/schools/${schoolCode}/${path}`;
  const { reply, error, loading, reload } = useApi(url);
  const [dialog, setDialog] = useState<Action | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const words = WORDS[subject];
  const view = reply?.data as unknown as View | undefined;

  const heading = (
    <h2 id="standing-heading" className="text-lg font-semibold tracking-tight text-fg">
      Standing
    </h2>
  );
  if (loading && !view)
    return (
      <section aria-labelledby="standing-heading">
        {heading}
        <p role="status" className="mt-2 text-sm text-fg-muted">
          Loading…
        </p>
      </section>
    );
  if (error || !view)
    return (
      <section aria-labelledby="standing-heading" className="space-y-3">
        {heading}
        <Alert variant="error">{error ?? "The standing could not be loaded."}</Alert>
      </section>
    );

  const standing = view.standing;
  const suspended = standing === "SUSPENDED";
  const ended = standing === "EXPELLED" || standing === "TERMINATED";
  const pill = ended ? (
    <StatusPill tone="warn">{words.endedPill}</StatusPill>
  ) : suspended ? (
    <StatusPill tone="warn">Suspended</StatusPill>
  ) : (
    <StatusPill tone="ok">Taking part</StatusPill>
  );

  return (
    <section aria-labelledby="standing-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {heading}
        {pill}
        {suspended && (
          <span className="text-sm text-fg-muted">
            {view.until ? `until ${dayText(view.until)} (the last day)` : "until someone lifts it"}
          </span>
        )}
      </div>
      {done && <Alert variant="success">{done}</Alert>}

      <div className="flex flex-wrap gap-2">
        {canSuspend && !suspended && !ended && (
          <Button type="button" variant="secondary" onClick={() => setDialog("suspend")}>
            Suspend
          </Button>
        )}
        {canSuspend && suspended && (
          <Button type="button" variant="secondary" onClick={() => setDialog("lift")}>
            Lift the suspension
          </Button>
        )}
        {canDecide && !ended && (
          <Button type="button" variant="danger" onClick={() => setDialog(words.ends)}>
            {words.endedVerb}
          </Button>
        )}
        {canDecide && ended && (
          <Button type="button" variant="secondary" onClick={() => setDialog("reinstate")}>
            Reinstate
          </Button>
        )}
      </div>

      {view.events.length === 0 ? (
        <p className="text-sm text-fg-muted">Nothing has been recorded: this person has always been taking part.</p>
      ) : (
        <ol className="space-y-2" aria-label="Standing history, newest first">
          {view.events.map((event) => (
            <li key={event.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
              <p className="font-medium text-fg">
                {EVENT_LABEL[event.action] ?? event.action}
                <span className="font-normal text-fg-muted">
                  {" "}
                  on {dayText(event.startsOn)}
                  {event.endsOn ? `, until ${dayText(event.endsOn)}` : ""} · decided by {event.decidedBy}
                </span>
              </p>
              <p className="mt-1 text-fg-muted">{event.reason}</p>
            </li>
          ))}
        </ol>
      )}

      {dialog && (
        <ChangeDialog
          key={dialog}
          action={dialog}
          name={name}
          subject={subject}
          url={url}
          onClose={() => setDialog(null)}
          onDone={async (text) => {
            setDialog(null);
            setDone(text);
            await reload(true);
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

const TITLE: Record<Action, (name: string, subject: StandingSubject) => string> = {
  suspend: (name) => `Suspend ${name}`,
  lift: (name) => `Lift the suspension of ${name}`,
  expel: (name) => `Expel ${name}`,
  terminate: (name) => `Terminate ${name}`,
  reinstate: (name) => `Reinstate ${name}`,
};
const EFFECT: Record<StandingSubject, Record<Action, string>> = {
  student: {
    suspend: "While suspended the pupil can read their portal but cannot take a quiz, practise or hand in work.",
    lift: "The pupil can take part again at once.",
    expel:
      "The pupil's enrolment ends and they come off every list that selects pupils by an active enrolment (attendance, invoices, results). They can no longer sign in.",
    terminate: "",
    reinstate: "The pupil's enrolment is active again and they can sign in.",
  },
  staff: {
    suspend: "While suspended the member of staff cannot use the school's pages or the API.",
    lift: "The member of staff can take part again at once.",
    expel: "",
    terminate: "Their account is closed to this school. Their records stay.",
    reinstate: "Their account is open to this school again.",
  },
  member: {
    suspend: "While suspended the user cannot use the school's pages or the API.",
    lift: "The user can take part again at once.",
    expel: "",
    terminate: "Their account is closed to this school. Their records stay.",
    reinstate: "Their account is open to this school again.",
  },
};
const DONE: Record<Action, string> = {
  suspend: "The suspension is recorded.",
  lift: "The suspension is lifted.",
  expel: "The expulsion is recorded.",
  terminate: "The termination is recorded.",
  reinstate: "The reinstatement is recorded.",
};

function ChangeDialog({
  action,
  name,
  subject,
  url,
  onClose,
  onDone,
}: {
  action: Action;
  name: string;
  subject: StandingSubject;
  url: string;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [reasonProblem, setReasonProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    setReasonProblem(null);
    const text = reason.trim();
    if (text.length < 3) return setReasonProblem("Give the reason (at least 3 characters).");
    if (text.length > 500) return setReasonProblem("The reason is at most 500 characters.");
    setBusy(true);
    const answer = await sendJson(url, "POST", { action, reason: text, ...(action === "suspend" && until ? { until } : {}) });
    setBusy(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    await onDone(DONE[action]);
  }

  return (
    <Dialog open onClose={onClose} title={TITLE[action](name, subject)} description={EFFECT[subject][action]}>
      <form onSubmit={submit} className="space-y-4 pt-2" noValidate>
        <TextAreaField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={REASON_HINT}
          error={reasonProblem}
          rows={3}
          maxLength={500}
          required
        />
        {action === "suspend" && (
          <TextField
            label="Last day of the suspension (optional)"
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            hint="Leave it empty to suspend until someone lifts it."
          />
        )}
        {problem && <Alert variant="error">{problem}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={action === "expel" || action === "terminate" ? "danger" : "primary"} disabled={busy}>
            {action === "suspend"
              ? "Suspend"
              : action === "lift"
                ? "Lift the suspension"
                : action === "expel"
                  ? "Expel"
                  : action === "terminate"
                    ? "Terminate"
                    : "Reinstate"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
