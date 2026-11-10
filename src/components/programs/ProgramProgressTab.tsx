"use client";

import { useProgramBase } from "./program-base";
import { say } from "./say";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";
import { offText } from "@/components/programs/attendance-model";
import { dayText, type ProgramDetail } from "@/components/programs/model";
import { PLACE_TEXT } from "@/components/programs/progress-model";
import { ProgressRecordView } from "@/components/programs/ProgressRecordView";
import type { Overview } from "@/lib/programs/progress-service";

// Progress records (task 0030): the people whose record the caller may see, and one person's record. Presentation only: the API decides who sees which record, who may write and verify, and
// refuses a stale save - this screen shows what it is told and sends back the version it saw.

export function ProgramProgressTab({ program }: { program: ProgramDetail }) {
  const programBase = useProgramBase();
  const base = `${programBase}/progress`;
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [groupId, setGroupId] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (openId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), ...(applied ? { q: applied } : {}), ...(groupId ? { groupId } : {}) });
    void getJson(`${base}?${query}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The progress records couldn't be loaded."));
      setFailed(null);
      setData(reply.data as unknown as Overview);
    });
    return () => controller.abort();
  }, [base, page, applied, groupId, openId, version]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setApplied(q.trim());
  }

  if (openId)
    return (
      <ProgressRecordView
        key={openId}
        program={program}
        personId={openId}
        onBack={() => {
          setOpenId(null);
          setVersion((v) => v + 1);
        }}
      />
    );

  return (
    <section aria-labelledby="program-progress" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id="program-progress" className="text-lg font-semibold text-fg">
        Progress records
      </h2>
      {failed && <Alert variant="error">{failed}</Alert>}
      {!data && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {data && (
        <>
          <p className="text-sm text-fg-muted">
            A running log kept for each person: dated entries by a teacher, handed in and verified when the program asks for it. Pupils and
            guardians see only what has been verified. {data.familyNote}
          </p>
          <Alert variant={data.state.on ? "success" : "warning"}>
            <span data-testid="progress-state">{offText(data.state, "Progress records are")}</span>
          </Alert>
          {!data.template && (
            <Alert variant="info">No template has been chosen yet. A program admin chooses one in the program&apos;s Settings.</Alert>
          )}
          {data.template && (
            <p className="text-xs text-fg-muted">
              Template: {data.template.name.en}
              {data.settings.requireVerification
                ? " · entries are verified before families see them"
                : " · entries are published as soon as they are saved"}
            </p>
          )}
          <form onSubmit={search} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" role="search" aria-label="Find a person">
            <TextField label="Search by name" value={q} maxLength={64} onChange={(e) => setQ(e.target.value)} />
            <SelectField
              label="Group"
              value={groupId}
              onChange={(e) => {
                setPage(1);
                setGroupId(e.target.value);
              }}
              options={[
                { value: "", label: "Every group" },
                ...program.groups.filter((g) => !g.archived).map((g) => ({ value: g.id, label: g.path })),
              ]}
            />
            <div className="flex items-end">
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </div>
          </form>
          {data.people.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
              There is no one to show.
            </p>
          ) : (
            <ul className="space-y-2" aria-label="People">
              {data.people.map((person) => (
                <li
                  key={person.participantId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-fg">{person.name}</p>
                    <p className="break-words text-fg-muted">
                      {person.groupPath} · {PLACE_TEXT[person.state] ?? person.state}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {person.entries === 0
                        ? "No entries yet"
                        : `${person.entries} ${person.entries === 1 ? "entry" : "entries"}, the last on ${dayText(person.lastEntryOn ?? "")}`}
                      {person.waiting > 0 ? ` · ${person.waiting} waiting to be verified` : ""}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    aria-label={`Open the progress record of ${person.name}`}
                    onClick={() => setOpenId(person.participantId)}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {(page > 1 || data.hasNext) && (
            <div className="flex items-center justify-between">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous page
              </Button>
              <span className="text-xs text-fg-muted">
                Page {page} · {data.total} {data.total === 1 ? "person" : "people"}
              </span>
              <Button variant="ghost" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}>
                Next page
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
