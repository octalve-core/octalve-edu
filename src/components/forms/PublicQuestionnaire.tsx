"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { GENERIC_ERROR, NETWORK_ERROR, getJson, sendJson, type Reply } from "@/components/auth/postJson";
import { AnswerFields, type AnswerValue, type AskedQuestion } from "@/components/forms/AnswerFields";

// The public questionnaire page's screen: read the questionnaire by its link, answer, send. Nothing about the school is shown, only the form. A link that cannot be answered says so in a
// sentence (never a status code, never an empty page). A public link cannot tell who is answering and cannot truly stop one person answering twice. It asks each browser to answer once (the
// API remembers that, holding no identity) and says so when this browser has; it never claims more than that, because anyone can clear it or use another browser. Presentation only: the public API decides whether the link can be answered, and checks every answer again.

type Loaded = { title: string; instructions: string | null; isAnonymous: boolean; questions: AskedQuestion[]; answeredHere?: boolean };

/// What the person is told when the API refuses, by the reason it gives. The API's own sentence says "closed" for a questionnaire that has not opened yet, which would mislead.
function sentenceFor(reply: Reply, fallback: string): string {
  if (reply.status === 0) return NETWORK_ERROR;
  if (reply.status === 429) return reply.message ?? "Too many requests. Please wait a few minutes and try again.";
  if (reply.status === 404) return "This link doesn't match a questionnaire. Check that you copied all of it.";
  if (reply.code === "NOT_YET_OPEN") return "This questionnaire has not opened yet.";
  if (reply.code === "CLOSED" || reply.code === "NOT_PUBLISHED") return "This questionnaire is closed.";
  if (reply.code === "RESTRICTED" || reply.code === "FORBIDDEN") return "This questionnaire is not open to the public.";
  if (reply.code === "ALREADY_SUBMITTED") return "You have already answered this questionnaire from this browser.";
  return reply.status >= 500 ? GENERIC_ERROR : (reply.message ?? fallback);
}

export function PublicQuestionnaire({ schoolCode, token }: { schoolCode: string; token: string }) {
  const base = `/api/v1/schools/${encodeURIComponent(schoolCode)}/forms/public/${encodeURIComponent(token)}`;
  const [form, setForm] = useState<Loaded | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(base, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) return setRefused(sentenceFor(reply, GENERIC_ERROR));
      setForm(reply.data as unknown as Loaded);
    })();
    return () => controller.abort();
  }, [base]);

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
    const reply = await sendJson(`${base}/submit`, "POST", { answers });
    setPending(false);
    if (!reply.ok) return setProblem(sentenceFor(reply, "Your answers couldn't be sent."));
    setSent(true);
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 py-8 sm:py-12">
      {refused ? (
        <>
          <h1 className="text-xl font-bold text-fg">Questionnaire</h1>
          <Alert variant="info">{refused}</Alert>
        </>
      ) : form === null ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : sent ? (
        <>
          <h1 className="text-xl font-bold break-words text-fg">{form.title}</h1>
          <Alert variant="success">Thank you. Your answers were sent.</Alert>
        </>
      ) : form.answeredHere ? (
        <>
          <h1 className="text-xl font-bold break-words text-fg">{form.title}</h1>
          <Alert variant="info">You have already answered this questionnaire from this browser. Thank you.</Alert>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold break-words text-fg">{form.title}</h1>
          {form.instructions && <p className="text-sm break-words whitespace-pre-wrap text-fg-2">{form.instructions}</p>}
          <p className="text-sm text-fg-muted">Your answers are sent without your name.</p>
          <form onSubmit={send} noValidate className="space-y-5">
            {problem && <Alert variant="error">{problem}</Alert>}
            <div className="space-y-5 rounded-2xl border border-line bg-surface p-4">
              <AnswerFields questions={form.questions} values={values} onChange={set} />
            </div>
            <Button type="submit" loading={pending}>
              Send my answers
            </Button>
          </form>
        </>
      )}
    </main>
  );
}
