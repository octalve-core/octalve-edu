"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { say } from "@/components/question-bank/say";
import { downloadBlob, getForPdf } from "@/components/question-bank/pdf";
import { useFormsApi } from "@/components/forms/FormsApi";
import type { Notice } from "@/components/forms/model";
import { PracticeAnswerItem } from "@/components/learn/PracticeAnswers";
import { ReportQuestionDialog } from "@/components/learn/ReportQuestionDialog";
import { REPORT_SENT, printAddress, type FinishedSession } from "@/components/learn/practiceModel";

// The result of a finished session: how many were right, every answer with the key and the explanation, a report on a question, the PDF. A score that does not exist (nothing was
// answered) is not shown as 0%. Presentation only: the numbers are the API's.

export function PracticeFinished({ result, onAgain }: { result: FinishedSession; onAgain: () => void }) {
  const { api } = useFormsApi();
  const [notice, setNotice] = useState<Notice>(null);
  const [reporting, setReporting] = useState<{ bankItemId: string; prompt: string } | null>(null);
  const [printing, setPrinting] = useState(false);

  async function download() {
    setPrinting(true);
    setNotice(null);
    const pdf = await getForPdf(printAddress(api, result.id));
    setPrinting(false);
    if (!pdf.ok) return setNotice({ variant: "error", text: say(pdf.reply, "The PDF couldn't be made.") });
    downloadBlob(pdf.blob, pdf.name);
  }

  return (
    <section aria-label="Your practice result" className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-fg">Practice result</h2>
        <p className="text-base font-semibold text-fg">
          {result.totalAttempted > 0
            ? `You got ${result.totalCorrect} of ${result.totalAttempted} right (${result.overallAccuracy}%).`
            : "You did not answer any question this time."}
        </p>
      </div>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {result.attempts.length > 0 && (
        <ol aria-label="Answers" className="space-y-4">
          {result.attempts.map((a, i) => (
            <PracticeAnswerItem
              key={a.id}
              n={i + 1}
              answer={a}
              actions={
                <Button variant="ghost" onClick={() => setReporting({ bankItemId: a.bankItemId, prompt: a.prompt })}>
                  Report a problem<span className="sr-only"> with question {i + 1}</span>
                </Button>
              }
            />
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-3">
        {result.attempts.length > 0 && (
          <Button variant="secondary" loading={printing} onClick={download}>
            Download PDF
          </Button>
        )}
        <Button onClick={onAgain}>Practise again</Button>
      </div>
      <ReportQuestionDialog
        key={reporting?.bankItemId ?? "closed"}
        question={reporting}
        onClose={() => setReporting(null)}
        onSent={() => {
          setReporting(null);
          setNotice({ variant: "success", text: REPORT_SENT });
        }}
      />
    </section>
  );
}
