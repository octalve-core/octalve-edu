"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { downloadBlob, postForPdf } from "@/components/question-bank/pdf";
import { KIND_NOUN, type FormKindKey } from "@/components/forms/model";

// Printing a form as a PDF made by the server, with a watermark and a line in the print log. The answer key is offered only where the questions came with one. Presentation only: the
// API decides who may print and says why not.

export function FormPrintDialog({
  open,
  onClose,
  kind,
  formId,
  mayHaveKey,
}: {
  open: boolean;
  onClose: () => void;
  kind: FormKindKey;
  formId: string;
  mayHaveKey: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Print this ${KIND_NOUN[kind]}`}
      description="The PDF is watermarked and the print is logged."
    >
      {open && <Body kind={kind} formId={formId} mayHaveKey={mayHaveKey} onClose={onClose} />}
    </Dialog>
  );
}

function Body({ kind, formId, mayHaveKey, onClose }: { kind: FormKindKey; formId: string; mayHaveKey: boolean; onClose: () => void }) {
  const { api } = useFormsApi();
  const [withKey, setWithKey] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function print() {
    setPending(true);
    setProblem(null);
    // the print route answers with the PDF itself
    const result = await postForPdf(`${api}/forms/${encodeURIComponent(formId)}/print`, {
      ...(withKey ? { includeAnswerKey: true } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setPending(false);
    if (!result.ok) return setProblem(say(result.reply, "It couldn't be printed."));
    downloadBlob(result.blob, result.name);
    onClose();
  }

  return (
    <div className="space-y-4">
      {problem && <Alert variant="error">{problem}</Alert>}
      {kind === "PRACTICE_SET" && mayHaveKey && (
        <CheckboxField label="Include the answer key" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />
      )}
      <TextField
        label="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        hint="It is written in the print log."
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={pending} onClick={print}>
          Download PDF
        </Button>
      </div>
    </div>
  );
}
