"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { TYPE_LABEL, type QuestionType } from "@/components/forms/model";

// What a questionnaire's answers add up to. Anonymous questionnaires with too few answers show the count and the questions and nothing that could pick one person out: the API holds the
// breakdown back and this page says so. Written answers are listed without names. Presentation only.

type Analytics = {
  totalResponses: number;
  isAnonymous: boolean;
  suppressed?: boolean;
  minimumResponses?: number;
  questions: {
    formQuestionId: string;
    prompt: string;
    questionType: QuestionType;
    totalAnswers: number;
    optionCounts?: { optionId: string; label: string; count: number; percentage: number }[];
    textResponses?: string[];
  }[];
};

export function QuestionnaireResults({ formId }: { formId: string }) {
  const { api } = useFormsApi();
  const [data, setData] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`${api}/forms/${encodeURIComponent(formId)}/analytics`, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) {
        setFailed(
          reply.status === 404
            ? "Only the person who wrote this form, an administrator, or someone allowed to read form results can see the results."
            : say(reply, "The results couldn't be loaded."),
        );
        return;
      }
      setData(reply.data as unknown as Analytics);
    })();
    return () => controller.abort();
  }, [api, formId]);

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (data === null) return <p className="text-sm text-fg-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-2">
        {data.totalResponses} answered{data.isAnonymous ? " · anonymous: names are not recorded" : ""}
      </p>
      {data.suppressed && (
        <Alert variant="info">
          This questionnaire is anonymous, and a breakdown of very few answers could point at one person. It appears once{" "}
          {data.minimumResponses} people have answered.
        </Alert>
      )}
      <ol aria-label="Summary by question" className="space-y-4">
        {data.questions.map((q, i) => (
          <li key={q.formQuestionId} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-fg-muted">
              <span className="text-fg">Question {i + 1}</span>
              <span>{TYPE_LABEL[q.questionType]}</span>
            </div>
            <p className="text-sm break-words whitespace-pre-wrap text-fg">{q.prompt}</p>
            {!data.suppressed && q.optionCounts && (
              <ul className="space-y-1.5">
                {q.optionCounts.map((o) => (
                  <li key={o.optionId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-2">
                    <span className="break-words">{o.label}</span>
                    <span className="whitespace-nowrap">
                      {o.count} ({Math.round(o.percentage)}%)
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!data.suppressed && q.textResponses && (
              <ul className="space-y-1.5">
                {q.textResponses.length === 0 && <li className="text-sm text-fg-muted">No written answers yet.</li>}
                {q.textResponses.map((t, j) => (
                  <li key={j} className="rounded-lg bg-field px-3 py-2 text-sm break-words whitespace-pre-wrap text-fg-2">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
