"use client";

import { CheckboxField } from "@/components/ui/CheckboxField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { optionsOf, type QuestionType } from "@/components/forms/model";

// The fields a person answers a form's questions with, one per question and of the kind it asks: choose one, choose several, true or false, a rating of 1 to 5, a short text, a long
// text. Shared by the pupil's questionnaires and practice sets in the portal and the public questionnaire page. Presentation only: the API checks every answer again.

export type AskedQuestion = { id: string; prompt: string; questionType: QuestionType; options: unknown };
export type AnswerValue = string | string[] | number;

export function AnswerFields({
  questions,
  values,
  onChange,
}: {
  questions: AskedQuestion[];
  values: Record<string, AnswerValue>;
  /// `null` takes the answer back (an emptied field is no answer).
  onChange: (questionId: string, value: AnswerValue | null) => void;
}) {
  return (
    <>
      {questions.map((q) => {
        const options = optionsOf(q.options);
        const value = values[q.id];
        if (q.questionType === "SINGLE" || q.questionType === "TRUE_FALSE" || q.questionType === "RATING") {
          const choices =
            q.questionType === "RATING"
              ? [1, 2, 3, 4, 5].map((n) => ({ id: String(n), text: String(n) }))
              : q.questionType === "TRUE_FALSE"
                ? [
                    { id: "true", text: "True" },
                    { id: "false", text: "False" },
                  ]
                : options;
          return (
            <fieldset key={q.id} className="space-y-1">
              <legend className="text-sm font-semibold break-words text-fg">{q.prompt}</legend>
              {q.questionType === "RATING" && <p className="text-xs text-fg-muted">1 is the lowest, 5 the highest.</p>}
              <div className={q.questionType === "RATING" ? "flex flex-wrap gap-x-5" : "space-y-0"}>
                {choices.map((c) => (
                  <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm text-fg-2">
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={String(value) === c.id}
                      onChange={() => onChange(q.id, q.questionType === "RATING" ? Number(c.id) : c.id)}
                    />
                    {c.text}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        if (q.questionType === "MULTI") {
          const picked = Array.isArray(value) ? value : [];
          return (
            <fieldset key={q.id} className="space-y-1">
              <legend className="text-sm font-semibold break-words text-fg">{q.prompt}</legend>
              <p className="text-xs text-fg-muted">Tick all that apply.</p>
              {options.map((o) => (
                <CheckboxField
                  key={o.id}
                  label={o.text}
                  checked={picked.includes(o.id)}
                  onChange={(e) => onChange(q.id, e.target.checked ? [...picked, o.id] : picked.filter((x) => x !== o.id))}
                />
              ))}
            </fieldset>
          );
        }
        return q.questionType === "TEXT" ? (
          <TextAreaField
            key={q.id}
            label={q.prompt}
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(q.id, e.target.value)}
            maxLength={5000}
          />
        ) : (
          <TextField
            key={q.id}
            label={q.prompt}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(q.id, e.target.value)}
            maxLength={1000}
          />
        );
      })}
    </>
  );
}
