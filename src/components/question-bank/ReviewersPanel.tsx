"use client";

import { useEffect, useState, type FormEvent } from "react";
import { failureText, useApi } from "@/components/academics/useApi";
import { getJson, sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { StepUpModal, type StepUpChange } from "@/components/settings/StepUpModal";
import type { BankPanelProps } from "@/components/question-bank/QuestionBankSections";

// Who may review question bank submissions (task 0024 slice B). The school's administrator manages any campus's reviewers and the school-wide ones; a campus administrator their own
// campus's. A reviewer is active staff of the school (never a pupil or a parent). Every change asks for the fresh proof in the step-up dialog first. Presentation only: the API
// decides who may do what and says why not.

type Reviewer = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  campusId: string | null;
  scope: "GENERAL" | "SUBJECT";
  subjectLabel: string | null;
  isExamApprover: boolean;
  inherited: boolean;
};
type Person = { userId: string; name: string | null; email: string | null };
type StepUp = { type: "totp" | "recovery" | "password"; value: string };
type Pending = { change: StepUpChange; send: (stepUp: StepUp) => Promise<Reply>; done: string; after?: () => void };

const ALL = "__all__";
const STAFF_ROLES = ["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const;
const PEOPLE_PER_ROLE = 100;
const who = (p: { name: string | null; email: string | null }) => p.name?.trim() || p.email || "Someone";

export function ReviewersPanel({ schoolCode, hasMfa, actorRole, ownCampusId, campuses }: BankPanelProps) {
  const isAdmin = actorRole === "ADMIN";
  const base = `/api/v1/schools/${schoolCode}`;
  const [where, setWhere] = useState(isAdmin ? ALL : (ownCampusId ?? ALL));
  const campusName = (id: string | null) => (id === null ? "Every campus" : (campuses.find((c) => c.id === id)?.name ?? "A campus"));
  const scopeQuery = where === ALL ? "" : `campusId=${encodeURIComponent(where)}`;
  const reviewersApi = useApi(`${base}/question-bank/reviewers${scopeQuery ? `?${scopeQuery}` : ""}`);
  const reviewers = (reviewersApi.reply?.data as { reviewers: Reviewer[] } | undefined)?.reviewers;

  const [people, setPeople] = useState<Person[]>([]);
  const [capped, setCapped] = useState(false);
  const [search, setSearch] = useState("");
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [personId, setPersonId] = useState("");
  const [covers, setCovers] = useState<"GENERAL" | "SUBJECT">("GENERAL");
  const [subject, setSubject] = useState("");
  const [examApprover, setExamApprover] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // The people to choose from: each staff role is read separately (the members list filters by one role) and capped at PEOPLE_PER_ROLE, so a large school finds someone by typing a
  // name or an address instead of scrolling. A short pause after typing avoids one request per key.
  useEffect(() => {
    let current = true;
    const text = search.trim();
    const timer = setTimeout(
      () => {
        void (async () => {
          const replies = await Promise.all(
            STAFF_ROLES.map((role) =>
              getJson(`${base}/members?role=${role}&limit=${PEOPLE_PER_ROLE}${text ? `&q=${encodeURIComponent(text)}` : ""}`),
            ),
          );
          if (!current) return;
          const bad = replies.find((r) => !r.ok);
          if (bad) return setPeopleError(failureText(bad.status, bad.message));
          setPeopleError(null);
          const seen = new Map<string, Person>();
          for (const r of replies) for (const m of r.data!.members as Person[]) if (!seen.has(m.userId)) seen.set(m.userId, m);
          setPeople([...seen.values()].sort((a, b) => who(a).localeCompare(who(b))));
          setCapped(replies.some((r) => (r.data!.members as Person[]).length >= PEOPLE_PER_ROLE));
        })();
      },
      text ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [base, search]);

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
    if (!reply.ok) return setSaveError(failureText(reply.status, reply.message));
    setPending(null);
    setDone(pending.done);
    pending.after?.();
    await reviewersApi.reload(true);
  };

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(null);
    if (!personId) return setProblem("Choose a person.");
    if (covers === "SUBJECT" && !subject.trim()) return setProblem("Type the subject they review.");
    setProblem(null);
    const person = people.find((p) => p.userId === personId);
    const name = person ? who(person) : "They";
    const campusId = where === ALL ? null : where;
    ask({
      change: {
        field: "Question bank reviewer",
        fromValue: "not a reviewer",
        toValue: `${name}: ${covers === "SUBJECT" ? subject.trim() : "every subject"}${examApprover ? ", exam approver" : ""} (${campusName(campusId)})`,
        isWeakeningSecurity: false,
      },
      send: (stepUp) =>
        sendJson(`${base}/question-bank/reviewers`, "POST", {
          campusId,
          userId: personId,
          scope: covers,
          ...(covers === "SUBJECT" ? { subjectLabel: subject.trim() } : {}),
          isExamApprover: examApprover,
          stepUp,
        }),
      done: `${name} can now review ${covers === "SUBJECT" ? subject.trim() : "every subject"}.`,
      after: () => {
        setPersonId("");
        setSubject("");
        setExamApprover(false);
      },
    });
  }

  function remove(reviewer: Reviewer) {
    setDone(null);
    ask({
      change: {
        field: "Question bank reviewer",
        fromValue: `${who(reviewer)}: ${reviewer.scope === "SUBJECT" ? reviewer.subjectLabel : "every subject"} (${campusName(reviewer.campusId)})`,
        toValue: "removed",
        isWeakeningSecurity: false,
      },
      send: (stepUp) => sendJson(`${base}/question-bank/reviewers/${encodeURIComponent(reviewer.id)}`, "DELETE", { stepUp }),
      done: `${who(reviewer)} is no longer a reviewer here.`,
    });
  }

  const canRemove = (r: Reviewer) => isAdmin || (r.campusId !== null && r.campusId === ownCampusId);
  const failure = reviewersApi.error;

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <p>
          <strong>What a reviewer does.</strong> A reviewer approves, edits or rejects the questions teachers submit. One who covers every
          subject reviews them all; one who covers a subject reviews that subject. An exam approver also sees overlap warnings and decides
          when pupils may see a question. Each change asks you to confirm who you are.
        </p>
      </Alert>
      {isAdmin && campuses.length > 0 && (
        <SelectField
          label="Reviewers for"
          value={where}
          onChange={(e) => {
            setDone(null);
            setProblem(null);
            setPersonId("");
            setWhere(e.target.value);
          }}
          options={[{ value: ALL, label: "Every campus (all reviewers)" }, ...campuses.map((c) => ({ value: c.id, label: c.name }))]}
        />
      )}
      <div aria-live="polite" className="empty:hidden">
        {done && <Alert variant="success">{done}</Alert>}
        {failure && <Alert variant="error">{failure}</Alert>}
        {peopleError && <Alert variant="error">{peopleError}</Alert>}
      </div>

      <section aria-labelledby="reviewers-heading" className="space-y-3">
        <h2 id="reviewers-heading" className="text-lg font-semibold text-fg">
          Current reviewers
        </h2>
        {reviewers === undefined ? (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : reviewers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            No reviewers yet. Until you add one, a submitted question has nobody to review it.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {reviewers.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{who(r)}</p>
                  {r.name && r.email && <p className="truncate text-sm text-fg-muted">{r.email}</p>}
                  <p className="mt-1 text-sm text-fg-2">
                    {r.scope === "SUBJECT" ? `Reviews ${r.subjectLabel}` : "Reviews every subject"}
                    {r.isExamApprover && " · Exam approver"}
                    {" · "}
                    {r.campusId === null ? "Every campus" : where === ALL ? campusName(r.campusId) : "This campus"}
                  </p>
                </div>
                {canRemove(r) ? (
                  <Button variant="secondary" onClick={() => remove(r)}>
                    Remove<span className="sr-only"> {who(r)}</span>
                  </Button>
                ) : (
                  r.inherited && <p className="text-sm text-fg-muted">Set for every campus</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-reviewer-heading" className="space-y-3">
        <h2 id="add-reviewer-heading" className="text-lg font-semibold text-fg">
          Add a reviewer
        </h2>
        <form onSubmit={add} className="space-y-4 rounded-2xl border border-line bg-surface p-4" noValidate>
          <TextField
            label="Search staff"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={64}
            hint={
              capped
                ? `Showing the first ${PEOPLE_PER_ROLE} of each kind of staff. Type part of a name or an address to narrow the list.`
                : "Type part of a name or an address to narrow the list."
            }
          />
          <SelectField
            label="Person"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            hint="Active staff only: administrators, teachers and other staff."
            error={problem === "Choose a person." ? problem : null}
            options={[
              {
                value: "",
                label: people.length === 0 ? (search.trim() ? "Nobody matches" : "No staff to choose from") : "Choose a person",
              },
              ...people.map((p) => ({ value: p.userId, label: p.email ? `${who(p)} (${p.email})` : who(p) })),
            ]}
          />
          <SelectField
            label="Covers"
            value={covers}
            onChange={(e) => setCovers(e.target.value as "GENERAL" | "SUBJECT")}
            options={[
              { value: "GENERAL", label: "Every subject" },
              { value: "SUBJECT", label: "One subject" },
            ]}
          />
          {covers === "SUBJECT" && (
            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={80}
              hint="For example Mathematics. Capital letters, spaces and hyphens do not matter when it is matched."
              error={problem === "Type the subject they review." ? problem : null}
            />
          )}
          <CheckboxField
            label="Exam approver (sees overlap warnings and decides when pupils may see a question)"
            checked={examApprover}
            onChange={(e) => setExamApprover(e.target.checked)}
          />
          <Button type="submit">Add reviewer</Button>
        </form>
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
