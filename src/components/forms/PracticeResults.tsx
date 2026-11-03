"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { scoreText } from "@/components/forms/model";

// The responses to a practice set: who answered, whether they finished, and the score as "x of y". A score that does not exist yet is a dash, never a zero. Presentation only: the
// API says who may read the results.

type Row = {
  id: string;
  studentName: string;
  admissionNo: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  score: number | null;
  maxScore: number | null;
};

const STATUS_TEXT: Record<Row["status"], string> = { COMPLETED: "Finished", IN_PROGRESS: "In progress", ABANDONED: "Left unfinished" };

export function PracticeResults({ formId }: { formId: string }) {
  const { api } = useFormsApi();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`${api}/forms/${encodeURIComponent(formId)}/responses`, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) {
        setFailed(
          reply.status === 404
            ? "Only the person who wrote this form, an administrator, or someone allowed to read form results can see the results."
            : say(reply, "The results couldn't be loaded."),
        );
        return;
      }
      setRows((reply.data?.responses ?? []) as Row[]);
    })();
    return () => controller.abort();
  }, [api, formId]);

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (rows === null) return <p className="text-sm text-fg-muted">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">Nobody has answered yet.</p>
    );
  }
  const finished = rows.filter((r) => r.status === "COMPLETED").length;
  const going = rows.filter((r) => r.status === "IN_PROGRESS").length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-2">
        {finished} finished · {going} in progress
      </p>
      <div
        role="region"
        aria-label="Responses, scrollable"
        tabIndex={0}
        className="overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[20rem] text-left text-sm">
          <caption className="sr-only">Responses</caption>
          <thead className="bg-surface-2 text-xs font-semibold text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-2">
                Pupil
              </th>
              <th scope="col" className="px-3 py-2">
                Status
              </th>
              <th scope="col" className="px-3 py-2">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <span className="block font-medium break-words text-fg">{r.studentName}</span>
                  <span className="block text-xs text-fg-muted">{r.admissionNo}</span>
                </td>
                <td className="px-3 py-2 text-fg-2">{STATUS_TEXT[r.status]}</td>
                <td className="px-3 py-2 whitespace-nowrap text-fg-2">{scoreText(r.status, r.score, r.maxScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
