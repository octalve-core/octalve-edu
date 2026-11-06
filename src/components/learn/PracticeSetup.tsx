"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { plural } from "@/components/forms/model";
import { practiceBase } from "@/components/learn/practiceModel";
import type { StartedSession } from "@/components/learn/PracticeSession";

// Setting up a practice session: the subject and topic the school has enough questions for, how many, and when the answers are shown. What the pupil may do today is what the API says:
// a closed practice, a spent daily allowance and a pool too small each stop a start, and the screen says which in words. Presentation only.

type Options = {
  available: boolean;
  reason?: string;
  dailyCapRemaining?: number;
  defaultQuestions?: number;
  presets?: number[];
  subjects?: { subject: string; count: number; topics: { topic: string; count: number }[] }[];
};

/// The API groups a question with no topic under this name, which is not a topic a session can be filtered by: it is left out of the topic choices.
const NO_TOPIC = "All Topics";

export function PracticeSetup({ onStarted }: { onStarted: (started: StartedSession) => void }) {
  const { api } = useFormsApi();
  const base = practiceBase(api);
  const [options, setOptions] = useState<Options | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [size, setSize] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"EACH" | "END">("EACH");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`${base}/options`, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "Practice couldn't be loaded."));
      setOptions(reply.data as unknown as Options);
    })();
    return () => controller.abort();
  }, [base]);

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (options === null) return <p className="text-sm text-fg-muted">Loading…</p>;
  if (!options.available) return <Alert variant="info">{options.reason ?? "Practice isn't available right now."}</Alert>;

  const subjects = options.subjects ?? [];
  if (subjects.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        No practice questions are ready for your class yet.
      </p>
    );
  }

  const left = options.dailyCapRemaining ?? 0;
  const chosen = subject ?? subjects[0]!.subject;
  const topics = (subjects.find((s) => s.subject === chosen)?.topics ?? []).filter((t) => t.topic !== NO_TOPIC);
  const sizes = options.presets ?? [];
  const chosenSize =
    size ?? (options.defaultQuestions !== undefined && sizes.includes(options.defaultQuestions) ? options.defaultQuestions : sizes[0]);

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRefused(null);
    const reply = await sendJson(`${base}/sessions`, "POST", {
      subjectLabel: chosen,
      topic: topic || undefined,
      size: chosenSize,
      feedbackMode: feedback,
    });
    setBusy(false);
    if (!reply.ok) return setRefused(say(reply, "The practice couldn't be started."));
    onStarted(reply.data as unknown as StartedSession);
  }

  return (
    <section aria-label="Practice setup" className="space-y-5">
      <p className="text-sm text-fg-2">
        {left > 0
          ? `You can answer ${left} more ${left === 1 ? "question" : "questions"} today.`
          : "You have used today's practice allowance. Come back tomorrow."}
      </p>
      {refused && <Alert variant="error">{refused}</Alert>}
      <form onSubmit={start} className="max-w-xl space-y-4">
        <SelectField
          label="Subject"
          value={chosen}
          onChange={(e) => {
            setSubject(e.target.value);
            setTopic("");
          }}
          options={subjects.map((s) => ({ value: s.subject, label: `${s.subject} (${plural(s.count, "question")})` }))}
        />
        <SelectField
          label="Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          options={[{ value: "", label: "All topics" }, ...topics.map((t) => ({ value: t.topic, label: `${t.topic} (${t.count})` }))]}
        />
        <SelectField
          label="Number of questions"
          value={String(chosenSize ?? "")}
          onChange={(e) => setSize(Number(e.target.value))}
          options={sizes.map((n) => ({ value: String(n), label: plural(n, "question") }))}
          hint="You may get fewer if there are fewer questions, or if today's allowance is smaller."
        />
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Show the answer</legend>
          {(
            [
              ["EACH", "After each answer"],
              ["END", "At the end"],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="flex min-h-11 items-center gap-3 text-sm text-fg-2">
              <input type="radio" name="feedback" checked={feedback === mode} onChange={() => setFeedback(mode)} />
              {label}
            </label>
          ))}
        </fieldset>
        <Button type="submit" loading={busy} disabled={left <= 0}>
          Start practice
        </Button>
      </form>
    </section>
  );
}
