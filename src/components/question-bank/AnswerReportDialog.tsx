"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import { REPORT_OUTCOME_LABEL, snippet, type ApiReport, type ReportOutcome } from "@/components/question-bank/model";

// A reviewer answers a waiting report: what they decided and why, and, for a question that was fixed and has been copied into assessments, whether to put the correction into those
// copies and score the attempts again. That last choice changes past papers, so it is a tick the reviewer must make, said in words, and offered only where the API would allow it
// (Fixed, the question approved, copied into at least one quiz). Presentation only: the server decides, and its refusal is shown as the sentence it sends. The form is mounted only
// while the dialog is open. A report already answered by someone else is handed to the owner, which says so and brings its list up to date.

const MIN = 3;

export function AnswerReportDialog({
  report,
  onClose,
  onDone,
}: {
  report: ApiReport | null;
  onClose: () => void;
  onDone: (reply: Reply) => void;
}) {
  return (
    <Dialog
      open={report !== null}
      onClose={onClose}
      title="Answer this report"
      description={report ? snippet(report.item.prompt) : undefined}
    >
      {report && <AnswerForm report={report} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function AnswerForm({ report, onClose, onDone }: { report: ApiReport; onClose: () => void; onDone: (reply: Reply) => void }) {
  const api = useBankApi();
  const [outcome, setOutcome] = useState<"" | ReportOutcome>("");
  const [reason, setReason] = useState("");
  const [correct, setCorrect] = useState(false);
  const [problems, setProblems] = useState<{ outcome?: string; reason?: string }>({});
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mayCorrect = outcome === "FIXED" && report.item.status === "APPROVED" && (report.regradeImpact?.affectedQuizzesCount ?? 0) > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setRefused(null);
    const found: { outcome?: string; reason?: string } = {};
    if (outcome === "") found.outcome = "Choose what you decided.";
    if (reason.trim().length < MIN) found.reason = `Give a reason, at least ${MIN} characters.`;
    setProblems(found);
    if (found.outcome || found.reason) return;
    setBusy(true);
    const reply = await sendJson(`${api}/reports/${encodeURIComponent(report.id)}`, "PATCH", {
      outcome,
      outcomeReason: reason.trim(),
      ...(mayCorrect && correct ? { applyRegrade: true } : {}),
    });
    setBusy(false);
    // someone else answered it first: nothing more to do here, the owner says so and shows the list as it is now
    if (reply.ok || reply.code === "ALREADY_RESOLVED") return onDone(reply);
    setRefused(say(reply, "The answer couldn't be saved."));
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-fg-2">A pupil who reported it sees the outcome and your reason.</p>
      {refused && <Alert variant="error">{refused}</Alert>}
      <SelectField
        label="Outcome"
        value={outcome}
        error={problems.outcome}
        onChange={(e) => setOutcome(e.target.value as "" | ReportOutcome)}
        hint="Fixed: the question was wrong. Not an error: it is right as it is. Needs discussion: it will be talked over."
        options={[
          { value: "", label: "Choose an outcome" },
          ...(Object.keys(REPORT_OUTCOME_LABEL) as ReportOutcome[]).map((o) => ({ value: o, label: REPORT_OUTCOME_LABEL[o] })),
        ]}
      />
      <TextAreaField
        label="Your reason"
        rows={3}
        maxLength={1000}
        value={reason}
        error={problems.reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {mayCorrect && (
        <div className="space-y-1">
          <CheckboxField
            label={"Correct the copies in this campus's assessments and score the attempts again"}
            checked={correct}
            onChange={(e) => setCorrect(e.target.checked)}
          />
          <p className="text-sm text-fg-2">
            This changes past papers, which are never changed otherwise. The copies of this question in the campus&apos;s quizzes that are
            not archived take the corrected question, and the finished attempts are scored again. It is all or nothing, and it cannot be
            undone. {report.regradeImpact?.offerMessage}
          </p>
        </div>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {busy ? "Saving…" : "Answer report"}
        </Button>
      </div>
    </form>
  );
}
