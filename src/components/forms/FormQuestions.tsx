import { TYPE_LABEL, correctIdsOf, optionsOf, plural, type DetailQuestion, type FormKindKey } from "@/components/forms/model";

// A form's questions, numbered, as the API sent them. The right answers and explanations are drawn only when the API sent them (whoever manages the form): nothing here fetches a
// key to hide it. Question and option text is shown as text, never as markup.

const TRUE_FALSE = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
];

export function FormQuestions({ kind, questions }: { kind: FormKindKey; questions: DetailQuestion[] }) {
  const practice = kind === "PRACTICE_SET";
  const hasKey = questions.some((q) => "correctAnswer" in q);
  if (questions.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        This form has no questions.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {practice && !hasKey && (
        <p className="rounded-xl border border-line bg-field p-3 text-sm text-fg-muted">
          The answer key is shown only to whoever manages this form.
        </p>
      )}
      <ol aria-label="Questions" className="space-y-4">
        {questions.map((q, i) => {
          const right = correctIdsOf(q);
          const choices = q.questionType === "TRUE_FALSE" ? TRUE_FALSE : optionsOf(q.options);
          return (
            <li key={q.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-fg-muted">
                <span className="text-fg">Question {i + 1}</span>
                <span>{TYPE_LABEL[q.questionType]}</span>
                {practice && <span>{plural(q.points, "point")}</span>}
                {practice && q.markingMethod === "MANUAL" && (
                  <span className="rounded-full border border-line-strong px-2 py-0.5">Marked by hand</span>
                )}
              </div>
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-fg">{q.prompt}</p>
              {choices.length > 0 && (
                <ul className="space-y-1.5">
                  {choices.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                      <span className="break-words">{o.text}</span>
                      {right.includes(o.id) && (
                        <span className="rounded-full border border-ok-line bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok-fg">
                          Correct answer
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {q.questionType === "SHORT" && q.correctAnswer && (
                <p className="text-sm text-fg-2">
                  <span className="font-semibold text-fg">Model answer: </span>
                  <span className="break-words">{q.correctAnswer}</span>
                </p>
              )}
              {q.questionType === "RATING" && <p className="text-sm text-fg-muted">Answered with a number from 1 to 5.</p>}
              {q.questionType === "TEXT" && <p className="text-sm text-fg-muted">Answered in the person&apos;s own words.</p>}
              {q.explanation && (
                <p className="text-sm text-fg-2">
                  <span className="font-semibold text-fg">Explanation: </span>
                  <span className="break-words">{q.explanation}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
