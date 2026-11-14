"use client";

import { useState, type FormEvent } from "react";
import { failureText, useApi } from "@/components/academics/useApi";
import { problemFor, sendJson } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

// Campuses (task 0063): the school's sites, and a field to add one. Until now a campus could only be made by calling the API, so a school that starts with none (the first-run wizard and the
// platform's onboarding both make one) could never give a campus administrator their campus. The page is the school administrator's (the route answers 403 to anyone else); the words of a refusal are
// the server's. There is no rename and no archive: the routes do not exist (ADR 0004: a thing is archived, never deleted), see the task file.

type CampusRow = { id: string; name: string };

/// The most the list asks for in one go (the route's own ceiling). A school with more campuses than this is told how many there are, not shown a page that stops without saying so.
const LIST_LIMIT = 100;

export function CampusesPanel({ schoolCode }: { schoolCode: string }) {
  const base = `/api/v1/schools/${schoolCode}/campuses`;
  const { reply, error, loading, reload } = useApi(`${base}?limit=${LIST_LIMIT}`);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [nameProblem, setNameProblem] = useState<string | null>(null);

  const campuses = (reply?.data?.campuses as CampusRow[] | undefined) ?? [];
  const total = typeof reply?.meta?.total === "number" ? reply.meta.total : campuses.length;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setDone(null);
    setProblem(null);
    setNameProblem(null);
    const answer = await sendJson(base, "POST", { name });
    setBusy(false);
    if (!answer.ok) {
      // A problem the server pins to the name (blank, too long, a character that cannot be used, a name the school already has) is shown beside the field; anything else is a sentence above it.
      const own = problemFor(answer, "name");
      if (own) setNameProblem(own);
      else setProblem(failureText(answer.status, answer.message));
      return;
    }
    const added = (answer.data?.campus as CampusRow | undefined)?.name ?? name.trim();
    setName("");
    setDone(`“${added}” was added.`);
    await reload(true);
  };

  return (
    <section aria-labelledby="campuses-heading" className="mt-10 space-y-4">
      <div>
        <h2 id="campuses-heading" className="text-lg font-semibold tracking-tight text-fg">
          Campuses
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">
          A campus is one site of the school. Classes, academic sessions and people can belong to a campus, and a campus administrator runs
          only their own. A school on one site needs none.
        </p>
      </div>
      {done && <Alert variant="success">{done}</Alert>}
      {problem && <Alert variant="error">{problem}</Alert>}

      <div className="rounded-xl border border-line bg-surface p-5">
        {loading && !reply ? (
          <p role="status" className="text-sm text-fg-muted">
            Loading the campuses…
          </p>
        ) : error || !reply ? (
          <Alert variant="error">{error ?? "The campuses could not be loaded."}</Alert>
        ) : campuses.length === 0 ? (
          <p className="text-sm text-fg-muted">This school has no campus yet.</p>
        ) : (
          <>
            <ul aria-label="Campuses" className="divide-y divide-line">
              {campuses.map((campus) => (
                <li key={campus.id} className="py-2 text-sm font-medium text-fg first:pt-0 last:pb-0">
                  {campus.name}
                </li>
              ))}
            </ul>
            {total > campuses.length && (
              <p className="mt-3 text-xs text-fg-muted">
                Showing the first {campuses.length} of {total} campuses.
              </p>
            )}
          </>
        )}
      </div>

      <form onSubmit={add} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="sm:w-80">
          <TextField
            label="Campus name"
            name="campusName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameProblem}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={busy} className="sm:mt-6">
          Add campus
        </Button>
      </form>
    </section>
  );
}
