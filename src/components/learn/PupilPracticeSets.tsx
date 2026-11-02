"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { PracticeSetAttempt, type SetSummary } from "@/components/learn/PracticeSetAttempt";
import { PracticeSetResult } from "@/components/learn/PracticeSetResult";
import { plural } from "@/components/forms/model";

// The practice sets open for the pupil's class, with what each one needs next: start it, continue the attempt in progress, or look at the result of the one that is finished. The
// attempt and the result each take the whole section. Presentation only: the portal routes decide which sets are open for this pupil.

type Listed = SetSummary & {
  questionCount: number;
  closesAt: string | null;
  submission: { id: string; status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED" } | null;
};
type View = { kind: "list" } | { kind: "attempt"; set: Listed } | { kind: "result"; responseId: string };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function PupilPracticeSets() {
  const { api } = useFormsApi();
  const [view, setView] = useState<View>({ kind: "list" });
  const [sets, setSets] = useState<Listed[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(`${api}/portal/forms/practice-sets`, signal);
      if (signal?.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The practice sets couldn't be loaded."));
      setFailed(null);
      setSets((reply.data?.practiceSets ?? []) as Listed[]);
    },
    [api],
  );

  useEffect(() => {
    if (view.kind !== "list") return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the list when it is shown
    void load(controller.signal);
    return () => controller.abort();
  }, [load, view.kind]);

  if (view.kind === "attempt") {
    return (
      <PracticeSetAttempt
        set={view.set}
        onSubmitted={(responseId) => setView({ kind: "result", responseId })}
        onLeave={() => setView({ kind: "list" })}
      />
    );
  }
  if (view.kind === "result") {
    return <PracticeSetResult responseId={view.responseId} onBack={() => setView({ kind: "list" })} />;
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-fg">Practice sets</h2>
      {failed && <Alert variant="error">{failed}</Alert>}
      {sets === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : sets !== null && sets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          No practice sets are open for you right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {(sets ?? []).map((s) => {
            const state = s.submission?.status === "COMPLETED" ? "finished" : s.submission?.status === "IN_PROGRESS" ? "going" : "new";
            return (
              <li key={s.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-fg">{s.title}</p>
                    {s.instructions && <p className="mt-1 text-sm break-words text-fg-muted">{s.instructions}</p>}
                  </div>
                  <span className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-fg-2">
                    {state === "finished" ? "Finished" : state === "going" ? "In progress" : "Not started"}
                  </span>
                </div>
                <p className="text-sm text-fg-muted">
                  {[
                    plural(s.questionCount, "question"),
                    s.maxDurationMinutes ? plural(s.maxDurationMinutes, "minute") : "No time limit",
                    s.closesAt ? `Closes ${when.format(new Date(s.closesAt))}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {state === "finished" ? (
                  <Button variant="secondary" onClick={() => setView({ kind: "result", responseId: s.submission!.id })}>
                    See result<span className="sr-only"> of {s.title}</span>
                  </Button>
                ) : (
                  <Button onClick={() => setView({ kind: "attempt", set: s })}>
                    {state === "going" ? "Continue" : "Start"}
                    <span className="sr-only"> {s.title}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
