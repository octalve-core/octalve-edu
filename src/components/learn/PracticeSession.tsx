"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { AnswerFields, type AnswerValue } from "@/components/forms/AnswerFields";
import { useFormsApi } from "@/components/forms/FormsApi";
import { valueText, type QuestionType } from "@/components/forms/model";
import { practiceBase, type FinishedSession } from "@/components/learn/practiceModel";

// A practice session, one question at a time. With the answer shown after each question the pupil is told at once whether it was right, the key and the explanation (as the API sends
// them); with the answers at the end nothing is revealed until the session is finished. An answer is final once it is saved. "Finish now" ends the session: the questions not answered
// are given back to today's allowance. A refusal is said in the API's words with the pupil kept on the same question and the answer still chosen. Presentation only.

export type AskedPracticeQuestion = { id: string; type: QuestionType; prompt: string; options: unknown };
export type StartedSession = {
  session: { id: string; size: number; feedbackMode: "EACH" | "END"; subjectLabel: string | null; topic: string | null };
  questions: AskedPracticeQuestion[];
};
type Feedback = { correct: boolean | null; correctAnswer: unknown; explanation: string | null };

const GIVEN_BACK = "The questions you have not answered are given back to today's allowance.";

export function PracticeSession({ started, onFinished }: { started: StartedSession; onFinished: (result: FinishedSession) => void }) {
  const { api } = useFormsApi();
  const base = `${practiceBase(api)}/sessions/${encodeURIComponent(started.session.id)}`;
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<AnswerValue | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const q = started.questions[index]!;
  const total = started.questions.length;
  const last = index === total - 1;
  const each = started.session.feedbackMode === "EACH";
  const hasAnswer = value !== null && !(Array.isArray(value) && value.length === 0) && !(typeof value === "string" && value.trim() === "");

  async function save() {
    setBusy(true);
    setError(null);
    const reply = await sendJson(`${base}/answers`, "POST", { bankItemId: q.id, answer: value });
    setBusy(false);
    if (!reply.ok) return setError(say(reply, "Your answer couldn't be saved."));
    setFeedback({
      correct: typeof reply.data?.correct === "boolean" ? reply.data.correct : null,
      correctAnswer: reply.data?.correctAnswer ?? null,
      explanation: typeof reply.data?.explanation === "string" ? reply.data.explanation : null,
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const reply = await sendJson(`${base}/finish`, "POST", {});
    setBusy(false);
    setConfirming(false);
    if (!reply.ok) return setError(say(reply, "The result couldn't be loaded."));
    onFinished(reply.data as unknown as FinishedSession);
  }

  function next() {
    setIndex(index + 1);
    setValue(null);
    setFeedback(null);
    setError(null);
  }

  const where = [started.session.subjectLabel, started.session.topic].filter(Boolean).join(" · ");

  return (
    <section aria-label="Your practice" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-fg">
          Question {index + 1} of {total}
        </p>
        {where && <p className="text-sm break-words text-fg-muted">{where}</p>}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <fieldset disabled={feedback !== null} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <AnswerFields
          questions={[{ id: q.id, prompt: q.prompt, questionType: q.type, options: q.options }]}
          values={value === null ? {} : { [q.id]: value }}
          onChange={(_, next) => setValue(next)}
        />
      </fieldset>
      <div role="status" className="space-y-2">
        {feedback && each && (
          <div className="space-y-2 rounded-2xl border border-line-strong bg-surface-2 p-4">
            <p className="text-sm font-semibold text-fg">{feedback.correct ? "Correct" : "Not quite"}</p>
            {feedback.correct !== true && feedback.correctAnswer !== null && (
              <p className="text-sm text-fg-2">
                <span className="font-semibold text-fg">Correct answer: </span>
                <span className="break-words">{valueText(q.type, q.options, feedback.correctAnswer)}</span>
              </p>
            )}
            {feedback.explanation && (
              <p className="text-sm text-fg-2">
                <span className="font-semibold text-fg">Explanation: </span>
                <span className="break-words">{feedback.explanation}</span>
              </p>
            )}
          </div>
        )}
        {feedback && !each && <p className="text-sm font-medium text-fg">Answer saved.</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        {feedback === null ? (
          <Button onClick={save} loading={busy} disabled={!hasAnswer}>
            {each ? "Check answer" : "Save answer"}
          </Button>
        ) : last ? (
          <Button onClick={finish} loading={busy}>
            See my result
          </Button>
        ) : (
          <Button onClick={next}>Next question</Button>
        )}
        {!(last && feedback !== null) && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            Finish now
          </Button>
        )}
      </div>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Finish now?" description={GIVEN_BACK}>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" data-initial-focus onClick={() => setConfirming(false)}>
            Keep going
          </Button>
          <Button loading={busy} onClick={finish}>
            Finish now
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
