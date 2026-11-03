"use client";

import type { ReactNode } from "react";
import { valueText } from "@/components/forms/model";
import type { PracticedAnswer } from "@/components/learn/practiceModel";

// One answered practice question: the question, the pupil's answer in the option's words, whether it was right, the correct answer when it was not, and the explanation. Shared by the
// result of a session and the history. Presentation only: what is shown is what the API sent.

export function PracticeAnswerItem({ n, answer: a, actions }: { n: number; answer: PracticedAnswer; actions?: ReactNode }) {
  const hasKey = a.correctAnswer !== null && a.correctAnswer !== undefined && a.correctAnswer !== "";
  return (
    <li className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold text-fg">Question {n}</p>
      <p className="text-sm break-words whitespace-pre-wrap text-fg">{a.prompt}</p>
      <p className="text-sm text-fg-2">
        <span className="font-semibold text-fg">Your answer: </span>
        <span className="break-words whitespace-pre-wrap">{valueText(a.type, a.options, a.answer)}</span>
      </p>
      <p className="text-sm font-medium text-fg">{a.correct ? "Correct" : "Not quite"}</p>
      {!a.correct && hasKey && (
        <p className="text-sm text-fg-2">
          <span className="font-semibold text-fg">Correct answer: </span>
          <span className="break-words">{valueText(a.type, a.options, a.correctAnswer)}</span>
        </p>
      )}
      {a.explanation && (
        <p className="text-sm text-fg-2">
          <span className="font-semibold text-fg">Explanation: </span>
          <span className="break-words">{a.explanation}</span>
        </p>
      )}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
}
