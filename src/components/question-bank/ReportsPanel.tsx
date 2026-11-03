"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, type Reply } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import {
  REPORT_OUTCOME_LABEL,
  REPORT_STATUS_LABEL,
  snippet,
  whenText,
  type ApiItem,
  type ApiReport,
  type CorrectionSummary,
} from "@/components/question-bank/model";
import type { Campus } from "@/components/question-bank/QuestionBankSections";
import { AnswerReportDialog } from "@/components/question-bank/AnswerReportDialog";
import { QuestionDetail } from "@/components/question-bank/QuestionDetail";
import { QuestionForm } from "@/components/question-bank/QuestionForm";

// The reports on questions, for the people who review them (the same people as the Review queue). Presentation only: the list is exactly what the server answered, which has already
// left out the reports on questions this person may not review, and has masked the reporter to a role and a campus (a pupil's campus only once enough pupils have reported the
// question). Nothing here asks for a name.

type Notice = { variant: "success" | "error"; text: string } | null;
type Filter = "OPEN" | "RESOLVED" | "DISMISSED" | "ALL";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "OPEN", label: "Waiting" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
  { value: "ALL", label: "All" },
];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/// What a correction did, in a sentence: the numbers the server counted, and the ones it left alone.
function correctionText(c: CorrectionSummary): string {
  const archived =
    c.skippedArchived > 0
      ? `${count(c.skippedArchived, "copy in an archived quiz was", "copies in archived quizzes were")} left as they were.`
      : "";
  if (c.copiesCorrected === 0) return ["No copy needed correcting.", archived].filter(Boolean).join(" ");
  return [
    `Corrected ${count(c.copiesCorrected, "copy", "copies")} in assessments; checked ${count(c.attemptsChecked, "attempt", "attempts")}, scored ${c.attemptsChanged} again.`,
    c.attemptsUnreadable > 0
      ? `${count(c.attemptsUnreadable, "attempt", "attempts")} could not be read and ${c.attemptsUnreadable === 1 ? "was" : "were"} left alone.`
      : "",
    archived,
  ]
    .filter(Boolean)
    .join(" ");
}

export function ReportsPanel({ writeCampuses, wholeSchool }: { writeCampuses: Campus[]; wholeSchool: boolean }) {
  const api = useBankApi();
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [reports, setReports] = useState<ApiReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [version, setVersion] = useState(0);
  const [answering, setAnswering] = useState<ApiReport | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApiItem | null>(null);

  // The list is read again whenever the filter changes or something was answered; an older answer never overwrites a newer one.
  useEffect(() => {
    let current = true;
    void (async () => {
      const reply = await getJson(`${api}/reports?status=${filter}`);
      if (!current) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the reports."));
      setError(null);
      setReports(reply.data!.reports as ApiReport[]);
    })();
    return () => {
      current = false;
    };
  }, [api, filter, version]);

  function answered(reply: Reply) {
    setAnswering(null);
    if (!reply.ok) setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    else {
      const correction = reply.data?.regrade as CorrectionSummary | null | undefined;
      setNotice({ variant: "success", text: `Report answered.${correction ? ` ${correctionText(correction)}` : ""}` });
    }
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-2">
        Problems that staff and pupils reported on the questions you review. You see a role and a campus, never a name.
      </p>
      <div className="sm:w-56">
        <SelectField label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} options={FILTERS} />
      </div>

      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
                Try again
              </Button>
            </div>
          </Alert>
        )}
      </div>

      {reports === null ? (
        !error && (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        )
      ) : reports.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {filter === "OPEN" ? "No report is waiting for you." : "No reports to show."}
        </p>
      ) : (
        <ul aria-label="Reports" className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {reports.map((r) => (
            <li key={r.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-line-strong px-3 py-1 font-semibold text-fg">
                  {REPORT_STATUS_LABEL[r.status]}
                </span>
                <span className="text-fg">{r.reporter}</span>
                <span className="text-fg-2">· {whenText(r.createdAt)}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(r.item.id)}
                className="min-h-11 w-full text-left font-medium text-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {snippet(r.item.prompt)}
              </button>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{r.reason}</p>
              {r.status === "OPEN" && r.regradeImpact && <p className="text-sm text-fg-2">{r.regradeImpact.offerMessage}</p>}
              {r.status !== "OPEN" && r.outcome && (
                <p className="text-sm text-fg">
                  <strong>{REPORT_OUTCOME_LABEL[r.outcome]}.</strong> {r.outcomeReason}
                  {r.resolvedAt ? <span className="text-fg-2"> ({whenText(r.resolvedAt)})</span> : null}
                </p>
              )}
              {r.status === "OPEN" && (
                <Button variant="secondary" onClick={() => setAnswering(r)}>
                  Answer this report
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AnswerReportDialog report={answering} onClose={() => setAnswering(null)} onDone={answered} />
      <QuestionDetail
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={(message) => {
          if (message) setNotice({ variant: "success", text: message });
          setVersion((v) => v + 1);
        }}
        onEdit={(item) => {
          setOpenId(null);
          setEditing(item);
        }}
        onOpen={setOpenId}
      />
      <QuestionForm
        open={editing !== null}
        item={editing}
        writeCampuses={writeCampuses}
        wholeSchool={wholeSchool}
        onClose={() => setEditing(null)}
        onSaved={(_item, message) => {
          setNotice({ variant: "success", text: message });
          setVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
