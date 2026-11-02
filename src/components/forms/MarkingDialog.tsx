"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { plural, valueText, type QuestionType } from "@/components/forms/model";

// One pupil's finished attempt of a practice set, marked a question at a time. Answers the machine marked are shown with their score and cannot be changed here; answers marked by hand
// take a score from 0 to the question's points and feedback. A partly marked attempt can be saved and finished later. Presentation only: the API checks every score again and says who
// may mark.

type Answer = {
  answerId: string;
  prompt: string;
  questionType: QuestionType;
  options: unknown;
  correctAnswer?: string | null;
  explanation?: string | null;
  points: number;
  markingMethod: "AUTO" | "MANUAL";
  submittedValue: unknown;
  score: number | null;
  feedback: string | null;
  markingStatus: string;
};
type Audit = {
  id: string;
  answerId: string | null;
  scoreAwarded: number | null;
  maxScore: number | null;
  feedback: string | null;
  action: string;
  actorName: string | null;
  createdAt: string;
};
type Detail = {
  formTitle: string;
  student: { name: string; admissionNo: string } | null;
  markingStatus: string;
  score: number | null;
  maxScore: number | null;
  answers: Answer[];
  audits: Audit[];
};

// What `GET .../marking` answers here: the pupil and the answers are flat fields, and the history of marking is kept with the attempt and with each answer. The dialog's own shape is made once, here.
type ApiAudit = {
  id: string;
  scoreAwarded: number | null;
  maxScore: number | null;
  feedback: string | null;
  action: string;
  actorName: string | null;
  createdAt: string;
};
type ApiResponse = {
  formTitle: string;
  studentName: string;
  admissionNo: string;
  markingStatus: string;
  score: number | null;
  maxScore: number | null;
  answers: (Omit<Answer, "answerId" | "submittedValue"> & { id: string; studentValue: unknown; audits: ApiAudit[] })[];
  audits: ApiAudit[];
};
function detailOf(r: ApiResponse): Detail {
  const audits: Audit[] = [
    ...r.audits.map((a) => ({ ...a, answerId: null })),
    ...r.answers.flatMap((a) => a.audits.map((au) => ({ ...au, answerId: a.id }))),
  ].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
  return {
    formTitle: r.formTitle,
    student: { name: r.studentName, admissionNo: r.admissionNo },
    markingStatus: r.markingStatus,
    score: r.score,
    maxScore: r.maxScore,
    answers: r.answers.map((a) => ({
      answerId: a.id,
      prompt: a.prompt,
      questionType: a.questionType,
      options: a.options,
      correctAnswer: a.correctAnswer,
      explanation: a.explanation,
      points: a.points,
      markingMethod: a.markingMethod,
      submittedValue: a.studentValue,
      score: a.score,
      feedback: a.feedback,
      markingStatus: a.markingStatus,
    })),
    audits,
  };
}

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function MarkingDialog({
  open,
  onClose,
  formId,
  responseId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  formId: string;
  responseId: string;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Mark an attempt" wide>
      {open && <Body formId={formId} responseId={responseId} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function Body({
  formId,
  responseId,
  onClose,
  onSaved,
}: {
  formId: string;
  responseId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { api } = useFormsApi();
  const url = `${api}/forms/${encodeURIComponent(formId)}/responses/${encodeURIComponent(responseId)}/marking`;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(url, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) {
        setFailed(
          reply.status === 404 ? "We could not find that attempt, or you may not mark it." : say(reply, "The attempt couldn't be loaded."),
        );
        return;
      }
      const data = detailOf(reply.data!.response as unknown as ApiResponse);
      setDetail(data);
      setScores(
        Object.fromEntries(
          data.answers
            .filter((a) => a.markingMethod === "MANUAL" && a.markingStatus === "MARKED" && a.score !== null)
            .map((a) => [a.answerId, String(a.score)]),
        ),
      );
      setFeedback(Object.fromEntries(data.answers.map((a) => [a.answerId, a.feedback ?? ""])));
    })();
    return () => controller.abort();
  }, [url]);

  async function save() {
    if (!detail || pending) return;
    const found: string[] = [];
    const send: { answerId: string; score: number; feedback: string | null }[] = [];
    let given = 0;
    for (const [i, a] of detail.answers.entries()) {
      if (a.markingMethod !== "MANUAL") continue;
      const typed = (scores[a.answerId] ?? "").trim();
      if (typed === "") continue;
      given++;
      const score = Number(typed);
      if (!Number.isFinite(score) || score < 0 || score > a.points) {
        found.push(`The score for question ${i + 1} is from 0 to ${a.points}.`);
        continue;
      }
      const note = (feedback[a.answerId] ?? "").trim() || null;
      if (a.markingStatus !== "MARKED" || score !== a.score || note !== (a.feedback ?? null))
        send.push({ answerId: a.answerId, score, feedback: note });
    }
    if (found.length === 0 && given === 0) found.push("Give at least one answer a score.");
    if (found.length === 0 && send.length === 0) found.push("Nothing has changed since it was last saved.");
    if (found.length > 0) return setProblems(found);
    setProblems([]);
    setPending(true);
    const reply = await sendJson(url, "PATCH", { answers: send });
    setPending(false);
    if (!reply.ok) {
      return setProblems([
        reply.status === 404 || reply.status === 403
          ? "Only the person who wrote this form, or an administrator, can mark it."
          : say(reply, "The marks couldn't be saved."),
      ]);
    }
    onSaved(`Marks saved: ${reply.data?.totalScore} of ${reply.data?.maxScore}.`);
    onClose();
  }

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (detail === null) return <p className="text-sm text-fg-muted">Loading…</p>;
  const number = (answerId: string | null) => {
    const at = detail.answers.findIndex((a) => a.answerId === answerId);
    return at < 0 ? null : at + 1;
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-base font-semibold break-words text-fg">
          {detail.student ? `${detail.student.name} · ${detail.student.admissionNo}` : "Unknown pupil"}
        </p>
        <p className="text-sm break-words text-fg-muted">{detail.formTitle}</p>
        {detail.score !== null && detail.maxScore !== null && (
          <p className="mt-1 text-sm text-fg-2">
            {detail.markingStatus === "MARKED" ? "Score" : "Score so far"}: {detail.score} of {detail.maxScore}
          </p>
        )}
      </div>

      {problems.length > 0 && (
        <Alert variant="error">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <ol aria-label="Answers" className="space-y-4">
        {detail.answers.map((a, i) => (
          <li key={a.answerId} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold text-fg-muted">
              <span className="text-fg">Question {i + 1}</span> · {plural(a.points, "point")}
            </p>
            <p className="text-sm break-words whitespace-pre-wrap text-fg">{a.prompt}</p>
            <p className="text-sm text-fg-2">
              <span className="font-semibold text-fg">Their answer: </span>
              <span className="break-words whitespace-pre-wrap">{valueText(a.questionType, a.options, a.submittedValue)}</span>
            </p>
            {a.markingMethod === "MANUAL" ? (
              <>
                {a.correctAnswer && (
                  <p className="text-sm text-fg-2">
                    <span className="font-semibold text-fg">Model answer: </span>
                    <span className="break-words">{a.correctAnswer}</span>
                  </p>
                )}
                {a.explanation && (
                  <p className="text-sm text-fg-2">
                    <span className="font-semibold text-fg">Explanation: </span>
                    <span className="break-words">{a.explanation}</span>
                  </p>
                )}
                <TextField
                  label={`Score for question ${i + 1} (out of ${a.points})`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={a.points}
                  step="any"
                  value={scores[a.answerId] ?? ""}
                  onChange={(e) => setScores({ ...scores, [a.answerId]: e.target.value })}
                />
                <TextAreaField
                  label={`Feedback for question ${i + 1} (optional)`}
                  rows={2}
                  maxLength={2000}
                  value={feedback[a.answerId] ?? ""}
                  onChange={(e) => setFeedback({ ...feedback, [a.answerId]: e.target.value })}
                />
              </>
            ) : (
              <p className="text-sm font-medium text-fg-2">
                Marked automatically: {a.score ?? 0} of {a.points}
              </p>
            )}
          </li>
        ))}
      </ol>

      {detail.audits.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-fg">Marking history</summary>
          <ul className="mt-3 space-y-2 text-sm text-fg-2">
            {detail.audits.map((au) => (
              <li key={au.id} className="break-words">
                {au.actorName ?? "Someone"}{" "}
                {au.action === "ATTEMPT_MARKED"
                  ? `marked the attempt: ${au.scoreAwarded} of ${au.maxScore}`
                  : `gave ${au.scoreAwarded} of ${au.maxScore}${number(au.answerId) ? ` for question ${number(au.answerId)}` : ""}`}
                {au.feedback ? ` (“${au.feedback}”)` : ""} · {when.format(new Date(au.createdAt))}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={pending} onClick={save}>
          Save marks
        </Button>
      </div>
    </div>
  );
}
