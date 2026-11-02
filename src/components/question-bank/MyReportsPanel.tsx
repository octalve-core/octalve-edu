"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import { REPORT_OUTCOME_LABEL, REPORT_STATUS_LABEL, snippet, whenText, type ApiReport } from "@/components/question-bank/model";

// The reports the signed-in member of staff filed, each with where it stands and, once a reviewer has answered, the outcome and the reason the reviewer gave. A person sees only their
// own: the API filters by who is signed in. Presentation only.

type Mine = Pick<ApiReport, "id" | "reason" | "status" | "outcome" | "outcomeReason" | "createdAt"> & {
  questionPrompt: string;
  subjectLabel: string | null;
  topic: string | null;
};

export function MyReportsPanel() {
  const api = useBankApi();
  const [reports, setReports] = useState<Mine[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`${api}/my-reports`, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "Your reports couldn't be loaded."));
      setReports((reply.data?.reports ?? []) as Mine[]);
    })();
    return () => controller.abort();
  }, [api]);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-fg">My reports</h2>
      {failed && <Alert variant="error">{failed}</Alert>}
      {reports === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : reports !== null && reports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          You have not reported a question.
        </p>
      ) : (
        <ul aria-label="Your reports" className="space-y-3">
          {(reports ?? []).map((r) => (
            <li key={r.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold break-words text-fg">{snippet(r.questionPrompt)}</p>
                <span className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-fg-2">
                  {REPORT_STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="text-xs text-fg-muted">
                {[r.subjectLabel, r.topic].filter(Boolean).join(" · ") || "No subject"} · Sent {whenText(r.createdAt)}
              </p>
              <p className="text-sm break-words whitespace-pre-wrap text-fg-2">
                <span className="font-semibold text-fg">What you wrote: </span>
                {r.reason}
              </p>
              {r.outcome && <p className="text-sm font-medium text-fg">{REPORT_OUTCOME_LABEL[r.outcome]}</p>}
              {r.outcomeReason && (
                <p className="text-sm break-words whitespace-pre-wrap text-fg-2">
                  <span className="font-semibold text-fg">Reason: </span>
                  {r.outcomeReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
