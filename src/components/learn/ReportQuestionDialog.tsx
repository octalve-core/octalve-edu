"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { practiceBase } from "@/components/learn/practiceModel";

// A pupil reports a problem with a question they have just practised. The words need a few characters (said on the screen, nothing sent below that); every other refusal (already
// reported, reporting switched off, a limit) is the API's own sentence. The owner gives it a `key` per question so it starts empty each time. Presentation only.

const MIN = 5;
const TOO_SHORT = `Say what is wrong in at least ${MIN} characters.`;

export function ReportQuestionDialog({
  question,
  onClose,
  onSent,
}: {
  question: { bankItemId: string; prompt: string } | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { api } = useFormsApi();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question) return;
    setRefused(null);
    if (reason.trim().length < MIN) return setProblem(TOO_SHORT);
    setProblem(null);
    setBusy(true);
    const reply = await sendJson(`${practiceBase(api)}/reports`, "POST", { bankItemId: question.bankItemId, reason: reason.trim() });
    setBusy(false);
    if (!reply.ok) return setRefused(say(reply, "The report couldn't be sent."));
    onSent();
  }

  return (
    <Dialog open={question !== null} onClose={onClose} title="Report a problem with this question" description={question?.prompt}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {refused && <Alert variant="error">{refused}</Alert>}
        <TextAreaField
          label="What is wrong with it?"
          rows={4}
          maxLength={1000}
          value={reason}
          error={problem}
          onChange={(e) => setReason(e.target.value)}
          hint="The people who look after the questions read this. They see what you write and your school section, not your name."
        />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Send report
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
