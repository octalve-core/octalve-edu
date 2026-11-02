"use client";

import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  PRACTICE_TYPES,
  QUESTIONNAIRE_TYPES,
  TYPE_LABEL,
  blankQuestion,
  optionId,
  type DraftQuestion,
  type FormKindKey,
  type QuestionType,
} from "@/components/forms/model";

// One question inside the builder. A practice set's question carries its answer and points; a questionnaire's only asks. Presentation only: the API checks the question again.
export function QuestionEditor({
  number,
  kind,
  question,
  onChange,
  onRemove,
}: {
  number: number;
  kind: FormKindKey;
  question: DraftQuestion;
  onChange: (next: DraftQuestion) => void;
  onRemove: (() => void) | null;
}) {
  const practice = kind === "PRACTICE_SET";
  const types = practice ? PRACTICE_TYPES : QUESTIONNAIRE_TYPES;
  const multi = question.type === "MULTI";
  const choice = question.type === "SINGLE" || multi;
  const set = <K extends keyof DraftQuestion>(key: K, value: DraftQuestion[K]) => onChange({ ...question, [key]: value });
  const setType = (type: QuestionType) =>
    onChange({ ...blankQuestion(type), prompt: question.prompt, points: question.points, explanation: question.explanation });

  return (
    <fieldset className="space-y-4 rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-fg">Question {number}</legend>
      <SelectField
        label="Question type"
        value={question.type}
        onChange={(e) => setType(e.target.value as QuestionType)}
        options={types.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
      />
      <TextAreaField label="Question" rows={3} value={question.prompt} onChange={(e) => set("prompt", e.target.value)} maxLength={2000} />

      {choice && (
        <div className="space-y-2">
          <p className="text-xs text-fg-muted">
            {practice ? (multi ? "Tick every correct option." : "Choose the one correct option.") : "People pick from these options."}
          </p>
          <ul className="space-y-2">
            {question.options.map((text, index) => (
              <li key={index} className="flex items-end gap-2">
                {practice && (
                  <label className="flex min-h-11 items-center px-1">
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`correct-${number}`}
                      aria-label={`Option ${optionId(index)} is correct`}
                      checked={multi ? question.multi.includes(index) : question.single === index}
                      onChange={(e) =>
                        multi
                          ? set("multi", e.target.checked ? [...question.multi, index] : question.multi.filter((i) => i !== index))
                          : set("single", index)
                      }
                    />
                  </label>
                )}
                <div className="min-w-0 flex-1">
                  <TextField
                    label={`Option ${optionId(index)}`}
                    value={text}
                    onChange={(e) =>
                      set(
                        "options",
                        question.options.map((o, i) => (i === index ? e.target.value : o)),
                      )
                    }
                    maxLength={500}
                  />
                </div>
                {question.options.length > MIN_OPTIONS && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onChange({
                        ...question,
                        options: question.options.filter((_, i) => i !== index),
                        multi: question.multi.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
                        single: question.single === index ? 0 : question.single > index ? question.single - 1 : question.single,
                      })
                    }
                  >
                    Remove<span className="sr-only"> option {optionId(index)}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {question.options.length < MAX_OPTIONS && (
            <Button variant="secondary" onClick={() => set("options", [...question.options, ""])}>
              Add an option
            </Button>
          )}
        </div>
      )}

      {practice && question.type === "TRUE_FALSE" && (
        <div role="radiogroup" aria-label="Correct answer" className="flex gap-6">
          {[true, false].map((value) => (
            <label key={String(value)} className="flex min-h-11 items-center gap-2 text-sm text-fg-2">
              <input type="radio" name={`truth-${number}`} checked={question.truth === value} onChange={() => set("truth", value)} />
              {value ? "True" : "False"}
            </label>
          ))}
        </div>
      )}

      {practice && question.type === "SHORT" && (
        <div className="space-y-3">
          <TextField
            label="Correct answer"
            hint="The model answer you will mark each pupil's answer against. A short answer is marked by hand."
            value={question.accepted}
            onChange={(e) => set("accepted", e.target.value)}
            maxLength={500}
          />
        </div>
      )}

      {practice && (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <TextField
            label="Points"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={question.points}
            onChange={(e) => set("points", e.target.value)}
          />
          <TextAreaField
            label="Explanation (optional)"
            rows={2}
            value={question.explanation}
            onChange={(e) => set("explanation", e.target.value)}
            maxLength={2000}
            hint="Shown to a pupil after they answer, when the rules let them see the answer."
          />
        </div>
      )}

      {onRemove && (
        <Button variant="ghost" onClick={onRemove}>
          Remove question {number}
        </Button>
      )}
    </fieldset>
  );
}
