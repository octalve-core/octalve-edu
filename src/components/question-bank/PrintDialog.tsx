"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import { downloadBlob, postForPdf } from "@/components/question-bank/pdf";

// Printing a question, a quiz or a form as a PDF made by the server: watermarked, with a line in the print log. The answer key is the person's choice, and the reason is written in
// the log. Presentation only: the API decides who may print what and when (a question kept secret for an exam is refused to teachers near the exam) and says why not, in its own words.

export type PrintTargetKind = "QUESTION_BANK_ITEM" | "QUIZ" | "FORM";

export function PrintDialog({
  open,
  onClose,
  onPrinted,
  targetKind,
  targetId,
  noun,
}: {
  open: boolean;
  onClose: () => void;
  onPrinted: () => void;
  targetKind: PrintTargetKind;
  targetId: string;
  /// "question", "quiz" or a kind of form: the word in the title.
  noun: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Print this ${noun}`}
      description="The PDF is watermarked and the print is written in the print log."
    >
      {open && <Body targetKind={targetKind} targetId={targetId} onClose={onClose} onPrinted={onPrinted} />}
    </Dialog>
  );
}

function Body({
  targetKind,
  targetId,
  onClose,
  onPrinted,
}: {
  targetKind: PrintTargetKind;
  targetId: string;
  onClose: () => void;
  onPrinted: () => void;
}) {
  const api = useBankApi();
  const [withKey, setWithKey] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function print() {
    if (pending) return;
    setPending(true);
    setProblem(null);
    const result = await postForPdf(`${api}/print`, {
      targetKind,
      targetId,
      ...(withKey ? { includeAnswerKey: true } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    if (!result.ok) return setProblem(say(result.reply, "It couldn't be printed."));
    downloadBlob(result.blob, result.name);
    onPrinted();
  }

  return (
    <div className="space-y-4">
      {problem && <Alert variant="error">{problem}</Alert>}
      <CheckboxField label="Include the answer key" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />
      <TextField
        label="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        hint="It is written in the print log."
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button loading={pending} onClick={print}>
          {pending ? "Preparing…" : "Download PDF"}
        </Button>
      </div>
    </div>
  );
}
