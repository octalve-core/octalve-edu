"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { sendJson } from "@/components/auth/postJson";
import { StatusPill } from "@/components/academics/parts";
import { failureText } from "@/components/academics/useApi";
import { downloadBlob } from "@/components/question-bank/pdf";
import { REGION } from "./model";

const MAX_BYTES = 1024 * 1024;

type Row = {
  row: number;
  admissionNo: string;
  name: string | null;
  status: "new" | "changed" | "unchanged" | "blank" | "error";
  total: number | null;
  savedTotal: number | null;
  note: string | null;
  problems: string[];
};
type Report = {
  dryRun: boolean;
  committed: boolean;
  counts: { rows: number; new: number; changed: number; unchanged: number; blank: number; errors: number };
  notInFile: number;
  toWrite: number;
  headerProblems: string[];
  rows: Row[];
};

const WHAT: Record<Row["status"], { label: string; tone: "ok" | "warn" | "neutral" | "info" }> = {
  new: { label: "New", tone: "ok" },
  changed: { label: "Changed", tone: "info" },
  unchanged: { label: "Unchanged", tone: "neutral" },
  blank: { label: "Left alone", tone: "neutral" },
  error: { label: "Problem", tone: "warn" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/// "Import marks from a file" (task 0039), under the grid of one sheet: download the sheet as a CSV file, fill it in, CHECK it (nothing is saved), and only then import it. The server decides every rule
/// (it is the grid's own writer behind it); this screen shows what the check says, row by row, and offers the import only for a file that was checked clean. `blocked` is true while the grid holds marks
/// that were typed and not saved: an import replaces the grid with what is saved, so those would be lost.
export function MarkImport({
  base,
  periodId,
  classArmId,
  subjectId,
  blocked,
  onImported,
}: {
  base: string;
  periodId: string;
  classArmId: string;
  subjectId: string;
  blocked: boolean;
  onImported: (text: string) => Promise<void>;
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"template" | "checking" | "importing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sheetQuery = new URLSearchParams({ periodId, classArmId, subjectId });

  async function template() {
    setBusy("template");
    setError(null);
    try {
      const res = await fetch(`${base}/import-template?${sheetQuery}`, { credentials: "same-origin" });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/csv")) {
        const json = await res.json().catch(() => null);
        return setError(failureText(res.status, json?.error?.message));
      }
      const named = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "marks.csv";
      downloadBlob(await res.blob(), named);
    } catch {
      setError(failureText(0));
    } finally {
      setBusy(null);
    }
  }

  async function choose(selected: File | undefined) {
    setReport(null);
    setError(null);
    if (!selected) return setFile(null);
    if (selected.size > MAX_BYTES) {
      setFile(null);
      return setError("That file is larger than 1 MB. Split it into smaller files.");
    }
    setFile({ name: selected.name, text: await selected.text() });
  }

  async function run(dryRun: boolean) {
    if (!file || busy) return;
    setBusy(dryRun ? "checking" : "importing");
    setError(null);
    const reply = await sendJson(`${base}/import`, "POST", { periodId, classArmId, subjectId, csv: file.text, dryRun });
    setBusy(null);
    if (!reply.ok) return setError(failureText(reply.status, reply.message));
    const answer = reply.data?.report as unknown as Report;
    setReport(answer);
    if (answer.committed) {
      setFile(null);
      if (input.current) input.current.value = "";
      await onImported(`Imported the marks of ${plural(answer.toWrite, "pupil", "pupils")} from ${file.name}.`);
    }
  }

  const headerProblems = report?.headerProblems ?? [];
  const counts = report?.counts;
  const clean = report !== null && report.dryRun && headerProblems.length === 0 && counts!.errors === 0 && report.toWrite > 0;
  const summary =
    report === null || headerProblems.length > 0
      ? null
      : counts!.errors > 0
        ? `${plural(counts!.errors, "row has a problem", "rows have problems")}. Nothing was imported: fix the file and check it again.`
        : report.toWrite === 0
          ? "Nothing to import: every mark in the file is already saved, or left blank."
          : `The file is fine: ${plural(report.toWrite, "pupil's marks", "pupils' marks")} to save (${counts!.new} new, ${counts!.changed} changed${counts!.unchanged ? `, ${counts!.unchanged} unchanged` : ""}${counts!.blank ? `, ${counts!.blank} left blank` : ""}${report.notInFile ? `; ${plural(report.notInFile, "pupil", "pupils")} on the roll not in the file, left as they are` : ""}).`;

  return (
    <section aria-labelledby="import-heading" className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div>
        <h3 id="import-heading" className="text-base font-semibold tracking-tight text-fg">
          Import marks from a file
        </h3>
        <p className="mt-1 text-sm text-fg-muted">
          Download this sheet as a CSV file, fill in the marks in a spreadsheet, then check the file here. Nothing is saved until you
          import, and one problem stops the whole file. Only drafts can be changed.
        </p>
      </div>
      <div>
        <Button variant="secondary" onClick={() => void template()} loading={busy === "template"}>
          Download the sheet (CSV)
        </Button>
      </div>
      <div>
        <label htmlFor="marks-file" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
          Marks file (CSV)
        </label>
        <input
          id="marks-file"
          ref={input}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void choose(e.target.files?.[0])}
          className="block w-full text-sm text-fg file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line file:bg-surface-2 file:px-4 file:text-sm file:font-semibold file:text-fg"
        />
        <p className="mt-1.5 text-xs text-fg-muted">Up to 1 MB and 1,000 rows. Pupils are found by admission number.</p>
      </div>
      {blocked && (
        <Alert variant="warning">
          You have typed marks above that are not saved. Save them (or reload the sheet) before importing: an import replaces what is typed
          with what is saved.
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <div role="status" aria-live="polite" className="empty:hidden">
        {headerProblems.length > 0 && (
          <Alert variant="error" announce={false}>
            <p className="font-semibold">The file can&apos;t be read.</p>
            <ul className="mt-1 list-disc pl-5">
              {headerProblems.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        )}
        {summary && (
          <Alert variant={counts!.errors === 0 ? "success" : "error"} announce={false}>
            <p className="font-semibold">{summary}</p>
          </Alert>
        )}
      </div>
      {report && headerProblems.length === 0 && report.rows.length > 0 && (
        <div role="region" aria-label="What the file would do, row by row" tabIndex={0} className={`${REGION} max-h-96`}>
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Each row of the file and what would happen to it.</caption>
            <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
              <tr>
                <th scope="col" className="w-16 px-3 py-2">
                  Row
                </th>
                <th scope="col" className="px-3 py-2">
                  Pupil
                </th>
                <th scope="col" className="px-3 py-2">
                  What happens
                </th>
                <th scope="col" className="px-3 py-2">
                  Total / problem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.rows.map((row) => (
                <tr key={row.row} className="align-top">
                  <td className="px-3 py-2 text-fg-2 tabular-nums">{row.row}</td>
                  <th scope="row" className="px-3 py-2 font-medium break-words text-fg">
                    {row.name ?? "-"}
                    <span className="block text-xs font-normal text-fg-muted">{row.admissionNo || "no admission number"}</span>
                  </th>
                  <td className="px-3 py-2">
                    <StatusPill tone={WHAT[row.status].tone}>{WHAT[row.status].label}</StatusPill>
                  </td>
                  <td className="px-3 py-2 text-fg-2">
                    {row.problems.length > 0 ? (
                      row.problems.map((problem) => <p key={problem}>{problem}</p>)
                    ) : row.status === "blank" || row.status === "unchanged" ? (
                      <span>{row.note}</span>
                    ) : (
                      <span className="tabular-nums">
                        {row.total}
                        {row.savedTotal !== null && row.savedTotal !== row.total ? ` (was ${row.savedTotal})` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => void run(true)}
          loading={busy === "checking"}
          disabled={!file || blocked || busy !== null}
        >
          Check the file
        </Button>
        <Button onClick={() => void run(false)} loading={busy === "importing"} disabled={!clean || blocked || busy !== null}>
          {clean ? `Import ${plural(report!.toWrite, "pupil's marks", "pupils' marks")}` : "Import the marks"}
        </Button>
      </div>
    </section>
  );
}
