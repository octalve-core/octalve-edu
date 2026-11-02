"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { AnswerFields, type AnswerValue, type AskedQuestion } from "@/components/forms/AnswerFields";

// A pupil's attempt of a practice set, on its own screen: the questions of each kind, the time left counted from the moment the attempt STARTED (so leaving and coming back does not
// give more time) and against the SCHOOL's clock (the start answers with the server's time, so a device clock that is wrong does not change it), and Submit. The server decides: it
// allows a minute more than the limit, and a refusal is said in words with the pupil's answers left where they are. Presentation only: the portal routes check who the pupil is,
// that the set is for them, and the time.

export type SetSummary = { id: string; title: string; instructions: string | null; maxDurationMinutes: number | null };

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export function PracticeSetAttempt({
  set,
  onSubmitted,
  onLeave,
}: {
  set: SetSummary;
  onSubmitted: (responseId: string) => void;
  onLeave: () => void;
}) {
  const { api } = useFormsApi();
  const base = `${api}/portal/forms/practice-sets/${encodeURIComponent(set.id)}`;
  const [questions, setQuestions] = useState<AskedQuestion[] | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | null>(set.maxDurationMinutes);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [values, setValues] = useState<Record<string, AnswerValue>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startedOnce = useRef(false);
  const autoSent = useRef(false);

  // open (or resume) the attempt, then read the questions
  useEffect(() => {
    if (startedOnce.current) return;
    startedOnce.current = true;
    void (async () => {
      const started = await sendJson(`${base}/start`, "POST", {});
      if (!started.ok) return setProblem(say(started, "The practice set couldn't be started."));
      const loaded = await getJson(base);
      if (!loaded.ok) return setProblem(say(loaded, "The questions couldn't be loaded."));
      const loadedSet = loaded.data as unknown as { maxDurationMinutes: number | null; questions: AskedQuestion[] };
      setQuestions(loadedSet.questions);
      setResponseId(String(started.data?.responseId));
      setLimit(loadedSet.maxDurationMinutes);
      if (loadedSet.maxDurationMinutes) {
        // how far this device's clock is from the school's, taken when the answer arrived; a missing time counts as no difference
        const serverNow = Date.parse(String(started.data?.serverTime));
        const offset = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
        setDeadline(Date.parse(String(started.data?.startedAt)) + loadedSet.maxDurationMinutes * 60_000 - offset);
      }
    })();
  }, [base]);

  // the clock, once a second
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const remaining = deadline === null ? null : Math.max(0, deadline - now);

  // said aloud (politely) only when a threshold is crossed, not every second
  const band = remaining === null ? null : remaining <= 0 ? 0 : remaining <= 60_000 ? 1 : remaining <= 300_000 ? 5 : 9;
  const announce = band === 0 ? "Time is up." : band === 1 ? "One minute left." : band === 5 ? "Five minutes left." : "";

  const set_ = (id: string, value: AnswerValue | null) =>
    setValues((current) => {
      const next = { ...current };
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[id];
      else next[id] = value;
      return next;
    });

  async function submit(automatic: boolean) {
    if (pending || responseId === null) return;
    const answers = Object.entries(values).map(([formQuestionId, value]) => ({ formQuestionId, value }));
    if (answers.length === 0) {
      return setProblem(automatic ? "Time is up, and nothing was answered." : "Answer at least one question.");
    }
    setProblem(null);
    setPending(true);
    const reply = await sendJson(`${base}/submit`, "POST", { responseId, answers });
    setPending(false);
    if (!reply.ok) return setProblem(say(reply, "Your answers couldn't be sent."));
    onSubmitted(responseId);
  }

  // when the time is up, what is on the screen is sent once (the server allows a minute more than the limit)
  useEffect(() => {
    if (remaining === 0 && questions && !autoSent.current) {
      autoSent.current = true;
      void submit(true);
    }
  }); // checked after every render: it fires once, when the clock reaches zero

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(false);
  }

  return (
    <section aria-label="Your attempt" className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold break-words text-fg">{set.title}</h2>
        {set.instructions && <p className="text-sm break-words text-fg-2">{set.instructions}</p>}
        {limit !== null && remaining !== null && (
          <p role="timer" className="text-sm font-semibold text-fg">
            Time left: {clock(remaining)}
          </p>
        )}
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      {problem && <Alert variant="error">{problem}</Alert>}

      {questions === null && !problem ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : questions !== null ? (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <AnswerFields questions={questions} values={values} onChange={set_} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setLeaving(true)}>
              Leave
            </Button>
            <Button type="submit" loading={pending}>
              Submit
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={onLeave}>
          Back to practice sets
        </Button>
      )}

      <Dialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Leave this attempt?"
        description="Your answers on this screen will be lost, and the clock keeps running."
      >
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setLeaving(false)}>
            Stay
          </Button>
          <Button variant="danger" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
