"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { BankApiProvider } from "@/components/question-bank/BankApi";
import { PrintDialog } from "@/components/question-bank/PrintDialog";
import { say } from "@/components/question-bank/say";

// A quiz's questions for the people who manage it: the list, "Print this quiz" (a watermarked PDF and a line in the print log), and "Offer to the question bank" on a question, which
// sends a copy of it to the reviewers as a new question (it never overwrites the bank's version; it waits in My questions and the review queue like any question). Presentation
// only: the API decides who may do either and says why not. A quiz kept secret for an exam shows no questions to other staff (the service decides), and the dialog says so.

type Question = { id: string; prompt: string; questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER"; points: number };
type Quiz = { id: string; title: string; subject: { name: string }; questions: Question[] };
const TYPE_TEXT = { MULTIPLE_CHOICE: "One correct answer", TRUE_FALSE: "True or false", SHORT_ANSWER: "Short answer" } as const;

export function QuizQuestionsDialog({ schoolCode, quizId, onClose }: { schoolCode: string; quizId: string | null; onClose: () => void }) {
  return (
    <Dialog open={quizId !== null} onClose={onClose} title="Quiz questions" wide>
      {quizId && (
        <BankApiProvider schoolCode={schoolCode}>
          <Body key={quizId} schoolCode={schoolCode} quizId={quizId} onClose={onClose} />
        </BankApiProvider>
      )}
    </Dialog>
  );
}

function Body({ schoolCode, quizId, onClose }: { schoolCode: string; quizId: string; onClose: () => void }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState<Question | null>(null);
  const [offered, setOffered] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const reply = await getJson(`/api/v1/schools/${encodeURIComponent(schoolCode)}/lms/quizzes/${encodeURIComponent(quizId)}`);
      if (!current) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the quiz."));
      setQuiz(reply.data as unknown as Quiz);
    })();
    return () => {
      current = false;
    };
  }, [schoolCode, quizId]);

  if (!quiz) {
    return error ? (
      <div className="space-y-4">
        <Alert variant="error">{error}</Alert>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    ) : (
      <p className="text-sm text-fg-muted" aria-busy="true">
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-fg">{quiz.title}</h3>
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant="success">{notice}</Alert>}
      </div>
      {quiz.questions.length === 0 ? (
        <p className="text-sm text-fg-muted">There are no questions you may see in this quiz.</p>
      ) : (
        <ol aria-label="Questions of the quiz" className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {quiz.questions.map((q, i) => (
            <li key={q.id} className="space-y-2 p-4">
              <p className="text-sm font-medium text-fg">
                <span className="text-fg-muted">{i + 1}. </span>
                {q.prompt}
              </p>
              <p className="text-sm text-fg-2">
                {TYPE_TEXT[q.questionType]} · {q.points} {q.points === 1 ? "point" : "points"}
              </p>
              {offered.includes(q.id) ? (
                <p className="text-sm font-semibold text-ok-fg">Offered to the question bank.</p>
              ) : (
                <Button variant="secondary" onClick={() => setOffering(q)}>
                  Offer to the question bank
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="secondary" onClick={() => setPrinting(true)}>
          Print this quiz
        </Button>
      </div>

      <Dialog open={offering !== null} onClose={() => setOffering(null)} title="Offer to the question bank" description={offering?.prompt}>
        {offering && (
          <OfferForm
            schoolCode={schoolCode}
            question={offering}
            quiz={quiz}
            onClose={() => setOffering(null)}
            onOffered={(id) => {
              setOffering(null);
              setOffered((o) => [...o, id]);
              setNotice("Offered. A reviewer will look at it, and you will find it in My questions in the Question bank.");
            }}
          />
        )}
      </Dialog>
      <PrintDialog
        open={printing}
        onClose={() => setPrinting(false)}
        onPrinted={() => {
          setPrinting(false);
          setNotice("The PDF was downloaded and the print is in the print log.");
        }}
        targetKind="QUIZ"
        targetId={quiz.id}
        noun="quiz"
      />
    </div>
  );
}

function OfferForm({
  schoolCode,
  question,
  quiz,
  onClose,
  onOffered,
}: {
  schoolCode: string;
  question: Question;
  quiz: Quiz;
  onClose: () => void;
  onOffered: (questionId: string) => void;
}) {
  const [subject, setSubject] = useState(quiz.subject.name);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setRefused(null);
    setBusy(true);
    const reply = await sendJson(`/api/v1/schools/${encodeURIComponent(schoolCode)}/question-bank/items/offer-back`, "POST", {
      quizQuestionId: question.id,
      ...(subject.trim() ? { subjectLabel: subject.trim() } : {}),
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      ...(difficulty ? { difficulty: Number(difficulty) } : {}),
    });
    setBusy(false);
    if (!reply.ok) return setRefused(say(reply, "It couldn't be offered."));
    onOffered(question.id);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-fg-2">
        A copy goes to the reviewers as a new question. The bank&apos;s own question is never overwritten.
      </p>
      {refused && <Alert variant="error">{refused}</Alert>}
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} />
      <TextField label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} />
      <SelectField
        label="Difficulty (optional)"
        value={difficulty}
        onChange={(e) => setDifficulty(e.target.value)}
        options={[{ value: "", label: "Not said" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} of 5` }))]}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {busy ? "Offering…" : "Offer it"}
        </Button>
      </div>
    </form>
  );
}
