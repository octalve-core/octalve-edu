"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import { whenText } from "@/components/question-bank/model";

// The print log: who printed what, when, how many pages and why, newest first, for the person's campus (a school administrator: the whole school; `GET .../print-logs`, at most 100 lines).
// Presentation only: the list is what the server answered. A log line is never changed or removed (the table is append-only), so there is nothing to edit here.

type TargetKind = "QUESTION_BANK_ITEM" | "FORM" | "QUIZ" | "PRACTICE_SESSION" | "FORM_RESPONSE";
type PrintLog = {
  id: string;
  targetKind: TargetKind;
  title: string;
  pageCount: number;
  reason: string | null;
  printedAt: string;
  printedBy: { id: string; name: string | null; email: string } | null;
  recipientStudent: { id: string; name: string; admissionNo: string } | null;
};

const KIND_LABEL: Record<TargetKind, string> = {
  QUESTION_BANK_ITEM: "A question",
  FORM: "A form",
  QUIZ: "A quiz",
  PRACTICE_SESSION: "A practice session",
  FORM_RESPONSE: "A pupil's answers",
};
const LIMIT = 100;

export function PrintLogPanel() {
  const api = useBankApi();
  const [kind, setKind] = useState<"" | TargetKind>("");
  const [logs, setLogs] = useState<PrintLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // The log is read again when the kind changes; an older answer never overwrites a newer one.
  useEffect(() => {
    let current = true;
    void (async () => {
      const query = new URLSearchParams({ limit: String(LIMIT) });
      if (kind) query.set("targetKind", kind);
      const reply = await getJson(`${api}/print-logs?${query.toString()}`);
      if (!current) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the print log."));
      setError(null);
      setLogs(reply.data!.logs as PrintLog[]);
    })();
    return () => {
      current = false;
    };
  }, [api, kind, version]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-2">
        Every print of a question, a quiz, a form or a pupil&apos;s answers, newest first. A line is never changed or removed.
      </p>
      <div className="sm:w-56">
        <SelectField
          label="What was printed"
          value={kind}
          onChange={(e) => setKind(e.target.value as "" | TargetKind)}
          options={[
            { value: "", label: "Anything" },
            ...(Object.keys(KIND_LABEL) as TargetKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })),
          ]}
        />
      </div>

      <div aria-live="polite" className="empty:hidden">
        {error && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
                Try again
              </Button>
            </div>
          </Alert>
        )}
      </div>

      {logs === null ? (
        !error && (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        )
      ) : logs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {kind ? "Nothing of that kind has been printed." : "Nothing has been printed yet."}
        </p>
      ) : (
        <>
          <ul aria-label="Print log" className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {logs.map((log) => (
              <li key={log.id} className="space-y-1 p-4">
                <p className="font-medium text-fg">{log.title}</p>
                <p className="text-sm text-fg-2">
                  {KIND_LABEL[log.targetKind]} · {log.pageCount} {log.pageCount === 1 ? "page" : "pages"} · printed by{" "}
                  {log.printedBy?.name ?? log.printedBy?.email ?? "someone"} · {whenText(log.printedAt)}
                </p>
                {log.recipientStudent && <p className="text-sm text-fg-2">Handout for {log.recipientStudent.name}.</p>}
                {log.reason && <p className="text-sm text-fg">Reason: {log.reason}</p>}
              </li>
            ))}
          </ul>
          {logs.length >= LIMIT && <p className="text-sm text-fg-muted">The latest {LIMIT} prints are shown.</p>}
        </>
      )}
    </div>
  );
}
