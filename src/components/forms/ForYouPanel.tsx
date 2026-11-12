"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { AnswerFields, type AnswerValue, type AskedQuestion } from "@/components/forms/AnswerFields";
import { plural, windowText, type Notice } from "@/components/forms/model";

// Questionnaires addressed to the signed-in member of staff or guardian, answered in place. Presentation only: the API decides who is addressed (the audience names their role, their
// campus), whether it is open, and whether an answer has already been given; an anonymous questionnaire is stored with no link to the person, and this screen says so before it is answered.

type Available = {
  id: string;
  title: string;
  instructions: string | null;
  isAnonymous: boolean;
  questionCount: number;
  opensAt: string | null;
  closesAt: string | null;
  hasSubmitted: boolean;
};

export function ForYouPanel() {
  const { api } = useFormsApi();
  const base = `${api}/forms/for-you`;
  const [list, setList] = useState<Available[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [answering, setAnswering] = useState<Available | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(base, signal);
      if (signal?.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The questionnaires couldn't be loaded."));
      setFailed(null);
      setList((reply.data?.questionnaires ?? []) as Available[]);
    },
    [base],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the section opens
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-fg">For you</h2>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {failed && <Alert variant="error">{failed}</Alert>}
      {list === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : list !== null && list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          Nothing is waiting for you.
        </p>
      ) : (
        <ul className="space-y-3">
          {(list ?? []).map((q) => (
            <li key={q.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words text-fg">{q.title}</p>
                  {q.instructions && <p className="mt-1 text-sm break-words text-fg-muted">{q.instructions}</p>}
                </div>
                {q.hasSubmitted ? (
                  <span className="shrink-0 rounded-full border border-ok-line bg-ok-bg px-3 py-1 text-xs font-semibold text-ok-fg">
                    Answered
                  </span>
                ) : (
                  <Button onClick={() => setAnswering(q)}>
                    Answer<span className="sr-only"> {q.title}</span>
                  </Button>
                )}
              </div>
              <p className="text-sm text-fg-muted">
                {[windowText(q.opensAt, q.closesAt), plural(q.questionCount, "question"), q.isAnonymous ? "Anonymous" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={answering !== null} onClose={() => setAnswering(null)} title={answering?.title ?? "Questionnaire"} wide>
        {answering && (
          <AnswerBody
            key={answering.id}
            base={base}
            form={answering}
            onClose={() => setAnswering(null)}
            onSent={() => {
              setNotice({ variant: "success", text: "Thank you. Your answers were sent." });
              void load();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AnswerBody({ base, form, onClose, onSent }: { base: string; form: Available; onClose: () => void; onSent: () => void }) {
  const [questions, setQuestions] = useState<AskedQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`${base}/${encodeURIComponent(form.id)}`, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) return setLoadError(say(reply, "The questions couldn't be loaded."));
      setQuestions(((reply.data as { questions?: AskedQuestion[] } | undefined)?.questions ?? []) as AskedQuestion[]);
    })();
    return () => controller.abort();
  }, [base, form.id]);

  const set = (id: string, value: AnswerValue | null) =>
    setValues((current) => {
      const next = { ...current };
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[id];
      else next[id] = value;
      return next;
    });

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const answers = Object.entries(values).map(([formQuestionId, value]) => ({ formQuestionId, value }));
    if (answers.length === 0) return setProblem("Answer at least one question.");
    setProblem(null);
    setPending(true);
    const reply = await sendJson(`${base}/${encodeURIComponent(form.id)}/submit`, "POST", { answers });
    setPending(false);
    if (!reply.ok) return setProblem(say(reply, "Your answers couldn't be sent."));
    onSent();
    onClose();
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;
  if (questions === null) return <p className="text-sm text-fg-muted">Loading…</p>;

  return (
    <form onSubmit={send} className="space-y-5" noValidate>
      {form.instructions && <p className="text-sm text-fg-2">{form.instructions}</p>}
      <p className="text-sm text-fg-muted">
        {form.isAnonymous
          ? "This questionnaire is anonymous: nobody, including whoever set it, can see who gave which answer."
          : "Whoever set this questionnaire can see who gave which answer."}
      </p>
      {problem && <Alert variant="error">{problem}</Alert>}
      <AnswerFields questions={questions} values={values} onChange={set} />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Send my answers
        </Button>
      </div>
    </form>
  );
}
