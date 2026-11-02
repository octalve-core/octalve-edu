"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import { snippet, type ApiItem } from "@/components/question-bank/model";

// A teacher reports a problem with a question in the bank. The words need a few characters (said on the screen, nothing sent below that); every other refusal (already reported,
// reporting switched off for teachers, a limit, not allowed to see the question) is the API's own sentence. The form is mounted only while the dialog is open, so it starts empty
// each time. Presentation only: the reviewers see the reason and the reporter's role and campus, never a name.

const MIN = 5;
const TOO_SHORT = `Say what is wrong in at least ${MIN} characters.`;

export function ReportProblemDialog({
  item,
  open,
  onClose,
  onSent,
}: {
  item: ApiItem;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Report a problem with this question" description={snippet(item.prompt)}>
      {open && <ReportForm item={item} onClose={onClose} onSent={onSent} />}
    </Dialog>
  );
}

function ReportForm({ item, onClose, onSent }: { item: ApiItem; onClose: () => void; onSent: () => void }) {
  const api = useBankApi();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setRefused(null);
    if (reason.trim().length < MIN) return setProblem(TOO_SHORT);
    setProblem(null);
    setBusy(true);
    const reply = await sendJson(`${api}/items/${encodeURIComponent(item.id)}/report`, "POST", { reason: reason.trim() });
    setBusy(false);
    if (!reply.ok) return setRefused(say(reply, "The report couldn't be sent."));
    onSent();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {refused && <Alert variant="error">{refused}</Alert>}
      <TextAreaField
        label="What is wrong with it?"
        rows={4}
        maxLength={1000}
        value={reason}
        error={problem}
        onChange={(e) => setReason(e.target.value)}
        hint="The people who review the questions read this. They see what you write and your role and campus, not your name."
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {busy ? "Sending…" : "Send report"}
        </Button>
      </div>
    </form>
  );
}
