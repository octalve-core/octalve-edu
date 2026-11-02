"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { downloadBlob, getForPdf } from "@/components/question-bank/pdf";
import { useFormsApi } from "@/components/forms/FormsApi";
import { plural, type Notice } from "@/components/forms/model";
import { PracticeAnswerItem } from "@/components/learn/PracticeAnswers";
import type { StartedSession } from "@/components/learn/PracticeSession";
import { ReportQuestionDialog } from "@/components/learn/ReportQuestionDialog";
import { REPORT_SENT, practiceBase, printAddress, when, type PracticedAnswer } from "@/components/learn/practiceModel";

// The history of the pupil's practice. A pupil sees every session and, once it is finished, its answers (archive or restore one, report a problem with its question, download a PDF);
// a session left open can be finished, which gives its unanswered questions back. A session set to show answers at the end keeps that promise: its answers are not listed until it is
// finished. Whoever has only the summary level (a guardian by default) is shown how practice is going and never a question; a guardian given the full history sees it and can change
// nothing. Presentation only: the API decides which of these a person gets.

type Session = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  subjectLabel: string | null;
  topic: string | null;
  totalAttempted: number;
  totalCorrect: number;
  attempts: (PracticedAnswer & { archivedAt: string | null })[];
};
type Summary = {
  totalSessions: number;
  totalAttempted: number;
  totalCorrect: number;
  overallAccuracy: number;
  topics: { subjectLabel: string; topic: string; attempted: number; correct: number; accuracy: number }[];
};
type History = { mode: "FULL"; sessions: Session[] } | { mode: "SUMMARY"; summary: Summary };

// `pupilId` is set only when a guardian looks at one of their children; a pupil's own history names nobody.
export function PracticeHistory({
  pupilId,
  canAct,
  onResume,
}: {
  pupilId?: string;
  canAct: boolean;
  /** Carry on with a session left open: given the questions still to answer, the owner shows them. Without it the history only offers to finish the session. */
  onResume?: (started: StartedSession) => void;
}) {
  const { api } = useFormsApi();
  const base = practiceBase(api);
  const [archivedView, setArchivedView] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{ bankItemId: string; prompt: string } | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const query = new URLSearchParams();
      if (pupilId) query.set("studentId", pupilId);
      if (archivedView) query.set("archived", "1");
      const qs = query.toString();
      const reply = await getJson(`${base}/history${qs ? `?${qs}` : ""}`, signal);
      if (signal?.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The history couldn't be loaded."));
      setFailed(null);
      setHistory(reply.data as unknown as History);
    },
    [base, archivedView, pupilId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the history when it is shown or the archive switch changes
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function act(id: string, what: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(id);
    setNotice(null);
    const done = await what();
    setBusy(null);
    if (!done.ok) return setNotice({ variant: "error", text: done.message });
    await load();
  }

  const archive = (attemptId: string, archived: boolean) =>
    act(attemptId, async () => {
      const reply = await sendJson(`${base}/history`, "PATCH", { attemptId, archived });
      return { ok: reply.ok, message: say(reply, "That couldn't be changed.") };
    });
  const finishIt = (sessionId: string) =>
    act(sessionId, async () => {
      const reply = await sendJson(`${base}/sessions/${encodeURIComponent(sessionId)}/finish`, "POST", {});
      return { ok: reply.ok, message: say(reply, "The session couldn't be finished.") };
    });
  const carryOn = (sessionId: string) =>
    act(sessionId, async () => {
      const reply = await getJson(`${base}/sessions/${encodeURIComponent(sessionId)}`);
      if (!reply.ok) return { ok: false, message: say(reply, "The session couldn't be opened.") };
      const started = reply.data as unknown as StartedSession;
      if (started.questions.length === 0) {
        return { ok: false, message: "No question is left to answer in this session. Finish it to see how you did." };
      }
      onResume?.(started);
      return { ok: true, message: "" };
    });
  const download = (sessionId: string) =>
    act(sessionId, async () => {
      const pdf = await getForPdf(printAddress(api, sessionId));
      if (pdf.ok) downloadBlob(pdf.blob, pdf.name);
      return { ok: pdf.ok, message: pdf.ok ? "" : say(pdf.reply, "The PDF couldn't be made.") };
    });

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (history === null) return <p className="text-sm text-fg-muted">Loading…</p>;

  if (history.mode === "SUMMARY") {
    const s = history.summary;
    return (
      <section aria-label="How practice is going" className="space-y-4">
        <h2 className="text-lg font-semibold text-fg">How practice is going</h2>
        <p className="text-sm text-fg-2">This shows how many questions were practised and how it went, never the questions themselves.</p>
        {s.totalAttempted === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
            Nothing has been practised yet.
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-sm text-fg">
              <li>Sessions: {s.totalSessions}</li>
              <li>Questions answered: {s.totalAttempted}</li>
              <li>
                Right: {s.totalCorrect} of {s.totalAttempted} ({s.overallAccuracy}%)
              </li>
            </ul>
            <ul aria-label="By subject and topic" className="space-y-2">
              {s.topics.map((t) => (
                <li key={`${t.subjectLabel}:::${t.topic}`} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                  <p className="font-semibold break-words text-fg">
                    {t.subjectLabel} · {t.topic}
                  </p>
                  <p className="text-fg-2">
                    {t.correct} of {t.attempted} right ({t.accuracy}%)
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }

  // In the archive switch only the finished sessions that have archived answers are listed; otherwise every session, so one left open can be finished.
  const shown = archivedView ? history.sessions.filter((s) => s.finishedAt && s.attempts.length > 0) : history.sessions;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">History</h2>
        {canAct && (
          <CheckboxField label="Show archived answers" checked={archivedView} onChange={(e) => setArchivedView(e.target.checked)} />
        )}
      </div>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {archivedView ? "You have no archived answers." : "You have not practised yet."}
        </p>
      ) : (
        <ul aria-label="Practice sessions" className="space-y-3">
          {shown.map((s) => {
            const finished = s.finishedAt !== null;
            return (
              <li key={s.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-fg">
                      {[s.subjectLabel, s.topic].filter(Boolean).join(" · ") || "Mixed questions"}
                    </p>
                    <p className="text-sm text-fg-muted">{when.format(new Date(s.startedAt))}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-fg-2">
                    {finished ? "Finished" : "Not finished"}
                  </span>
                </div>
                <p className="text-sm text-fg-2">
                  {!finished
                    ? `${s.totalAttempted} answered so far. Finish it to see how you did.`
                    : archivedView
                      ? plural(s.attempts.length, "archived answer")
                      : s.totalAttempted === 0
                        ? "No question was answered."
                        : `${s.totalCorrect} of ${s.totalAttempted} right`}
                </p>
                {finished && s.attempts.length > 0 && (
                  <details>
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      Show answers
                    </summary>
                    <ol aria-label="Answers" className="mt-3 space-y-3">
                      {s.attempts.map((a, i) => (
                        <PracticeAnswerItem
                          key={a.id}
                          n={i + 1}
                          answer={a}
                          actions={
                            canAct && (
                              <>
                                <Button variant="ghost" loading={busy === a.id} onClick={() => archive(a.id, a.archivedAt === null)}>
                                  {a.archivedAt === null ? "Archive" : "Restore"}
                                  <span className="sr-only"> question {i + 1}</span>
                                </Button>
                                <Button variant="ghost" onClick={() => setReporting({ bankItemId: a.bankItemId, prompt: a.prompt })}>
                                  Report a problem<span className="sr-only"> with question {i + 1}</span>
                                </Button>
                              </>
                            )
                          }
                        />
                      ))}
                    </ol>
                  </details>
                )}
                {canAct && finished && s.totalAttempted + s.attempts.length > 0 && !archivedView && (
                  <Button variant="secondary" loading={busy === s.id} onClick={() => download(s.id)}>
                    Download PDF
                  </Button>
                )}
                {canAct && !finished && (
                  <div className="flex flex-wrap gap-2">
                    {onResume && (
                      <Button loading={busy === s.id} onClick={() => carryOn(s.id)}>
                        Continue<span className="sr-only"> this session</span>
                      </Button>
                    )}
                    <Button variant="secondary" loading={busy === s.id} onClick={() => finishIt(s.id)}>
                      Finish it
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ReportQuestionDialog
        key={reporting?.bankItemId ?? "closed"}
        question={reporting}
        onClose={() => setReporting(null)}
        onSent={() => {
          setReporting(null);
          setNotice({ variant: "success", text: REPORT_SENT });
        }}
      />
    </div>
  );
}
