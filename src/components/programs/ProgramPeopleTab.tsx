"use client";

import { useEffect, useState, type FormEvent } from "react";
import { StatusPill } from "@/components/academics/parts";
import { failureText, useApi } from "@/components/academics/useApi";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { AddPersonDialog } from "./AddPersonDialog";
import { KIND_TEXT, PEOPLE_ACTION_TEXT, STATE_TEXT, STATE_TONE, type PeoplePage, type Person } from "./people-model";
import { dayText, type CampusOption, type ProgramDetail } from "./model";

// The People tab of a program (task 0027, slice P2): who is in it, in which group and through which campus, what state their place is in (read from the school's own records, never copied),
// and what the viewer may do about each. Presentation only: the API decides who sees whom and who may do what, and says why not.

type Act = (send: () => Promise<Reply>, done: string) => Promise<boolean>;
type Mode = "move" | "withdraw" | "reenrol" | "suspend" | "lift" | "expel" | "reinstate" | "edit" | "history";

const KIND_FILTER = [
  { value: "", label: "Everyone" },
  { value: "STUDENT", label: "Pupils" },
  { value: "STAFF", label: "Staff" },
  { value: "GUARDIAN", label: "Guardians" },
  { value: "ADULT", label: "Adults" },
  { value: "CHILD", label: "Children" },
];
const STATE_FILTER = [{ value: "", label: "Any state" }, ...Object.entries(STATE_TEXT).map(([value, label]) => ({ value, label }))];

export function ProgramPeopleTab({
  program,
  base,
  act,
  schoolCampuses,
}: {
  program: ProgramDetail;
  base: string;
  act: Act;
  schoolCampuses: CampusOption[];
}) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState<{ person: Person; mode: Mode } | null>(null);

  // The search waits for a pause in typing, and any filter takes the list back to its first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set("q", search);
  if (groupId) query.set("groupId", groupId);
  if (kind) query.set("kind", kind);
  if (state) query.set("state", state);
  const { reply, error, loading, reload } = useApi(`${base}/people?${query.toString()}`);
  const data = reply?.data as unknown as PeoplePage | undefined;
  const liveGroups = program.groups.filter((group) => !group.archived);
  const canManage = program.can.managePeople;
  const campusChoices = program.campuses.length > 0 ? program.campuses : schoolCampuses;

  const changed: Act = async (send, text) => {
    const ok = await act(send, text);
    if (ok) await reload(true);
    return ok;
  };

  return (
    <section aria-labelledby="people-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="people-heading" className="text-base font-semibold text-fg">
            People
          </h3>
          <p className="mt-1 text-sm text-fg-muted">
            Who is in this program. A pupil&apos;s or a member of staff&apos;s state is read from the school&apos;s own record, so it
            changes by itself when they are suspended, expelled or brought back there.
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={() => setAdding(true)}>
            Add people
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={64} />
        <SelectField
          label="Group"
          options={[{ value: "", label: "Every group" }, ...liveGroups.map((group) => ({ value: group.id, label: group.path }))]}
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="Who"
          options={KIND_FILTER}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label="State"
          options={STATE_FILTER}
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && !data && (
        <p role="status" className="text-sm text-fg-muted">
          Loading the people…
        </p>
      )}
      {data && (
        <>
          <p className="text-sm text-fg-muted" role="status">
            {data.total === 0 ? "No one matches." : `${data.total} ${data.total === 1 ? "person" : "people"}`}
          </p>
          {data.people.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="People of the program">
              {data.people.map((person) => (
                <li key={person.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium break-words text-fg">{person.name}</span>
                    <StatusPill tone={STATE_TONE[person.state]}>{STATE_TEXT[person.state]}</StatusPill>
                    {person.state === "SUSPENDED" && person.standingUntil && (
                      <span className="text-fg-muted">until {dayText(person.standingUntil)}</span>
                    )}
                  </div>
                  <p className="text-fg-muted">
                    {KIND_TEXT[person.kind]}
                    {person.admissionNo ? ` · ${person.admissionNo}` : ""} · {person.groupPath}
                    {` · ${person.campusName || "through the school"}`}
                    {person.phone ? ` · ${person.phone}` : ""}
                    {` · joined ${dayText(person.joinedOn)}`}
                    {person.endedOn ? `, left ${dayText(person.endedOn)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canManage && person.status === "ACTIVE" && (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Move ${person.name}`}
                          onClick={() => setActing({ person, mode: "move" })}
                        >
                          Move
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Withdraw ${person.name}`}
                          onClick={() => setActing({ person, mode: "withdraw" })}
                        >
                          Withdraw
                        </Button>
                      </>
                    )}
                    {canManage && person.status === "WITHDRAWN" && (
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Re-enrol ${person.name}`}
                        onClick={() => setActing({ person, mode: "reenrol" })}
                      >
                        Re-enrol
                      </Button>
                    )}
                    {canManage && !person.linked && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Edit ${person.name}`}
                        onClick={() => setActing({ person, mode: "edit" })}
                      >
                        Edit
                      </Button>
                    )}
                    {canManage && !person.linked && person.can.suspend && person.standing === "ACTIVE" && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Suspend ${person.name}`}
                        onClick={() => setActing({ person, mode: "suspend" })}
                      >
                        Suspend
                      </Button>
                    )}
                    {canManage && !person.linked && person.can.suspend && person.standing === "SUSPENDED" && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Lift the suspension of ${person.name}`}
                        onClick={() => setActing({ person, mode: "lift" })}
                      >
                        Lift the suspension
                      </Button>
                    )}
                    {canManage && !person.linked && person.can.remove && person.standing !== "EXPELLED" && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Expel ${person.name} from the program`}
                        onClick={() => setActing({ person, mode: "expel" })}
                      >
                        Expel
                      </Button>
                    )}
                    {canManage && !person.linked && person.can.remove && person.standing === "EXPELLED" && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Reinstate ${person.name}`}
                        onClick={() => setActing({ person, mode: "reinstate" })}
                      >
                        Reinstate
                      </Button>
                    )}
                    {person.linked && ["SUSPENDED", "EXPELLED", "TERMINATED"].includes(person.state) && (
                      <span className="self-center text-fg-muted">
                        {person.kind === "STUDENT" ? "Change this on the Students page." : "Change this on the Users page."}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`History of ${person.name}`}
                      onClick={() => setActing({ person, mode: "history" })}
                    >
                      History
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {(page > 1 || data.hasNext) && (
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-fg-muted">Page {page}</span>
              <Button type="button" variant="secondary" disabled={!data.hasNext} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddPersonDialog program={program} base={base} campusChoices={campusChoices} onClose={() => setAdding(false)} act={changed} />
      )}
      {acting && (
        <PersonDialog
          key={`${acting.person.id}-${acting.mode}`}
          person={acting.person}
          mode={acting.mode}
          program={program}
          base={base}
          onClose={() => setActing(null)}
          act={changed}
        />
      )}
    </section>
  );
}

const TITLE: Record<Mode, string> = {
  move: "Move",
  withdraw: "Withdraw",
  reenrol: "Re-enrol",
  suspend: "Suspend",
  lift: "Lift the suspension of",
  expel: "Expel from the program",
  reinstate: "Reinstate",
  edit: "Edit",
  history: "History of",
};

function PersonDialog({
  person,
  mode,
  program,
  base,
  onClose,
  act,
}: {
  person: Person;
  mode: Mode;
  program: ProgramDetail;
  base: string;
  onClose: () => void;
  act: Act;
}) {
  const liveGroups = program.groups.filter((group) => !group.archived);
  const [groupId, setGroupId] = useState(person.groupId);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState({
    firstName: person.name.split(" ")[0] ?? "",
    lastName: person.name.split(" ").slice(1).join(" "),
    dateOfBirth: person.dateOfBirth ?? "",
    phone: person.phone ?? "",
    email: person.email ?? "",
    guardianName: person.guardianName ?? "",
    guardianPhone: person.guardianPhone ?? "",
  });
  const history = useApi(mode === "history" ? `${base}/people/${person.id}` : null);
  const rows =
    (history.reply?.data?.history as { id: string; action: string; at: string; by: string; reason: string | null }[] | undefined) ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    const text = reason.trim();
    const needsReason = mode !== "move" && mode !== "edit";
    if (needsReason && text.length < 3) return setProblem("Say why (at least 3 characters).");
    setBusy(true);
    const url = `${base}/people/${person.id}`;
    const empty = (value: string) => (value.trim() === "" ? null : value.trim());
    const send = () =>
      mode === "move"
        ? sendJson(`${url}/move`, "POST", { groupId })
        : mode === "withdraw"
          ? sendJson(`${url}/place`, "POST", { action: "withdraw", reason: text })
          : mode === "reenrol"
            ? sendJson(`${url}/place`, "POST", { action: "reenrol", reason: text, groupId })
            : mode === "edit"
              ? sendJson(url, "PATCH", {
                  firstName: details.firstName,
                  lastName: details.lastName,
                  dateOfBirth: empty(details.dateOfBirth),
                  phone: empty(details.phone),
                  email: empty(details.email),
                  guardianName: empty(details.guardianName),
                  guardianPhone: empty(details.guardianPhone),
                })
              : sendJson(`${url}/standing`, "POST", { action: mode, reason: text, ...(mode === "suspend" && until ? { until } : {}) });
    const answer = await send();
    setBusy(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    const done: Record<Mode, string> = {
      move: "They are moved.",
      withdraw: "Their place is ended.",
      reenrol: "They are back in the program.",
      suspend: "The suspension is recorded.",
      lift: "The suspension is lifted.",
      expel: "The expulsion is recorded.",
      reinstate: "The reinstatement is recorded.",
      edit: "The details are saved.",
      history: "",
    };
    await act(async () => answer, done[mode]);
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title={`${TITLE[mode]} ${person.name}`}>
      {mode === "history" ? (
        <div className="space-y-3 pt-2">
          {history.error && <Alert variant="error">{history.error}</Alert>}
          {rows.length === 0 && !history.error ? (
            <p className="text-sm text-fg-muted">Nothing has been recorded yet.</p>
          ) : (
            <ol className="space-y-2" aria-label="History of this place">
              {rows.map((row) => (
                <li key={row.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                  <p className="font-medium text-fg">
                    {PEOPLE_ACTION_TEXT[row.action] ?? row.action}
                    <span className="font-normal text-fg-muted">
                      {" "}
                      · {row.by} · {new Date(row.at).toLocaleString()}
                    </span>
                  </p>
                  {row.reason && <p className="mt-1 text-fg-muted">{row.reason}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 pt-2" noValidate>
          {(mode === "move" || mode === "reenrol") && (
            <SelectField
              label="Group"
              options={liveGroups.map((group) => ({ value: group.id, label: group.path }))}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          )}
          {mode === "edit" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="First name"
                value={details.firstName}
                maxLength={60}
                onChange={(e) => setDetails({ ...details, firstName: e.target.value })}
              />
              <TextField
                label="Last name"
                value={details.lastName}
                maxLength={60}
                onChange={(e) => setDetails({ ...details, lastName: e.target.value })}
              />
              <TextField
                label="Date of birth"
                type="date"
                value={details.dateOfBirth}
                onChange={(e) => setDetails({ ...details, dateOfBirth: e.target.value })}
              />
              <TextField
                label="Phone"
                value={details.phone}
                maxLength={30}
                onChange={(e) => setDetails({ ...details, phone: e.target.value })}
              />
              <TextField
                label="E-mail"
                value={details.email}
                maxLength={120}
                onChange={(e) => setDetails({ ...details, email: e.target.value })}
              />
              {person.kind === "CHILD" && (
                <>
                  <TextField
                    label="Guardian's name"
                    value={details.guardianName}
                    maxLength={60}
                    onChange={(e) => setDetails({ ...details, guardianName: e.target.value })}
                  />
                  <TextField
                    label="Guardian's phone"
                    value={details.guardianPhone}
                    maxLength={30}
                    onChange={(e) => setDetails({ ...details, guardianPhone: e.target.value })}
                  />
                </>
              )}
            </div>
          )}
          {mode !== "move" && mode !== "edit" && (
            <TextAreaField
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              hint="Required (3 to 500 characters). It is kept in the history."
              rows={3}
              maxLength={500}
              required
            />
          )}
          {mode === "suspend" && (
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
            <Button type="submit" variant={mode === "expel" ? "danger" : "primary"} disabled={busy}>
              {mode === "edit" ? "Save" : TITLE[mode].replace(/ of$/, "")}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
