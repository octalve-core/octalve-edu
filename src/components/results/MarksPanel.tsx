"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { sendJson } from "@/components/auth/postJson";
import { LiveNotice, StatusPill, type Notice } from "@/components/academics/parts";
import { failureText, useApi } from "@/components/academics/useApi";
import { FIELD, REGION, STATUS_LABEL, markProblem, statusTone, type Options, type Sheet, type SheetRow } from "./model";

/// "Marks": enter the marks of one subject for one class and term. Pick the term, the class and the subject (only what the person may enter is offered), type the marks, save, and send the
/// saved marks for review. A mark that has left DRAFT is shown, not editable. The server decides who may, what is valid and what a score is graded as; this screen is a convenience.
export function MarksPanel({ schoolCode, readOnly }: { schoolCode: string; readOnly: boolean }) {
  const base = `/api/v1/schools/${schoolCode}/academics/results`;
  const options = useApi(`${base}/options`);
  const data = options.reply?.data as Options | undefined;
  const periods = useMemo(() => data?.periods ?? [], [data]);
  const pairs = useMemo(() => data?.pairs ?? [], [data]);

  // What was picked; what is USED falls back to a sensible default (the current term, the first class and subject) so no effect has to copy defaults into state.
  const [chosen, setChosen] = useState({ period: "", arm: "", subject: "" });
  const arms = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of pairs) seen.set(p.classArmId, `${p.classGroupName} ${p.armName}`);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [pairs]);
  const periodId = periods.some((p) => p.id === chosen.period)
    ? chosen.period
    : ((periods.find((p) => p.isCurrent) ?? periods[0])?.id ?? "");
  const armId = arms.some((a) => a.value === chosen.arm) ? chosen.arm : (arms[0]?.value ?? "");
  const subjects = pairs.filter((p) => p.classArmId === armId).map((p) => ({ value: p.subjectId, label: p.subjectName }));
  const subjectId = subjects.some((s) => s.value === chosen.subject) ? chosen.subject : (subjects[0]?.value ?? "");

  const ready = periodId !== "" && armId !== "" && subjectId !== "";
  const sheetApi = useApi(ready ? `${base}/sheet?${new URLSearchParams({ periodId, classArmId: armId, subjectId })}` : null);
  const sheet = sheetApi.reply?.data as unknown as Sheet | undefined;
  // A reply that belongs to an earlier choice is not shown under the new one.
  const current = sheet && sheet.period.id === periodId && sheet.arm.id === armId && sheet.subject.id === subjectId ? sheet : null;
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState<Notice>(null);

  if (options.error) return <Alert variant="error">{options.error}</Alert>;
  if (options.loading)
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-fg-muted" aria-busy="true">
        Loading…
      </p>
    );
  if (periods.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        There is no active session yet, so there is nothing to enter marks for. An administrator opens one under Academics.
      </p>
    );
  if (pairs.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        {readOnly
          ? "Your role does not enter marks. You can review them under Review."
          : "No subject is assigned to you for any class yet. An administrator assigns subjects to teachers under People."}
      </p>
    );

  return (
    <section aria-labelledby="marks-heading" className="space-y-4">
      <div>
        <h2 id="marks-heading" className="text-lg font-semibold tracking-tight text-fg">
          Enter marks
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Choose the term, the class and the subject. Marks stay drafts until you send them for review.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Term"
          value={periodId}
          onChange={(e) => setChosen({ ...chosen, period: e.target.value })}
          options={periods.map((p) => ({ value: p.id, label: `${p.label} (${p.sessionLabel})` }))}
        />
        <SelectField
          label="Class"
          value={armId}
          onChange={(e) => setChosen({ ...chosen, arm: e.target.value, subject: "" })}
          options={arms}
        />
        <SelectField
          label="Subject"
          value={subjectId}
          onChange={(e) => setChosen({ ...chosen, subject: e.target.value })}
          options={subjects}
        />
      </div>
      <LiveNotice notice={saved} />
      {sheetApi.error && !current && (
        <Alert variant="error">
          <p>{sheetApi.error}</p>
        </Alert>
      )}
      {!current && !sheetApi.error && (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading the sheet…
        </p>
      )}
      {current && (
        <SheetEditor
          key={`${current.period.id}-${current.arm.id}-${current.subject.id}-${version}`}
          sheet={current}
          base={base}
          readOnly={readOnly}
          onChanged={async (text) => {
            await sheetApi.reload();
            setSaved({ variant: "success", text });
            setVersion((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}

/// One loaded sheet. It is remounted for every sheet and after every save (a `key`), so what is typed always starts from what the server holds.
function SheetEditor({
  sheet,
  base,
  readOnly,
  onChanged,
}: {
  sheet: Sheet;
  base: string;
  readOnly: boolean;
  onChanged: (text: string) => Promise<void>;
}) {
  const parts = sheet.scheme.components;
  const [typed, setTyped] = useState<Record<string, string[]>>(() => {
    // What each input starts with: the saved parts (or the saved total when the school has no parts).
    const start: Record<string, string[]> = {};
    for (const row of sheet.rows) {
      start[row.studentId] = row.result
        ? parts.length > 0
          ? parts.map((c) => String(row.result?.components?.find((x) => x.name === c.name)?.score ?? ""))
          : [String(row.result.score)]
        : parts.length > 0
          ? parts.map(() => "")
          : [""];
    }
    return start;
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const editable = (status?: string) => !readOnly && (status === undefined || status === "DRAFT");
  const maxOf = (i: number) => (parts.length > 0 ? parts[i].maxScore : sheet.scheme.totalMax);

  const rowProblems: Record<string, string> = {};
  for (const row of sheet.rows) {
    const cells = typed[row.studentId] ?? [];
    const bad = cells.map((c, i) => markProblem(c, maxOf(i))).find(Boolean);
    const filled = cells.filter((c) => c.trim() !== "").length;
    if (bad) rowProblems[row.studentId] = bad;
    else if (filled > 0 && filled < cells.length) rowProblems[row.studentId] = "Fill every part, or leave this pupil blank.";
  }

  const changed = (row: SheetRow) => {
    const cells = typed[row.studentId] ?? [];
    if (cells.every((c) => c.trim() === "")) return false;
    const saved = row.result;
    if (!saved) return true;
    return parts.length > 0
      ? parts.some((c, i) => Number(cells[i]) !== (saved.components?.find((x) => x.name === c.name)?.score ?? NaN))
      : Number(cells[0]) !== saved.score;
  };
  const dirty = sheet.rows.filter((r) => editable(r.result?.status) && changed(r));
  const drafts = sheet.rows.filter((r) => r.result?.status === "DRAFT");
  const totalOf = (cells: string[]) => (cells.some((c) => c.trim() === "") ? null : cells.reduce((sum, c) => sum + Number(c), 0));

  async function save() {
    if (Object.keys(rowProblems).length > 0 || dirty.length === 0) return;
    setSaving(true);
    setNotice(null);
    const results = dirty.map((row) => {
      const cells = typed[row.studentId];
      return parts.length > 0
        ? {
            studentId: row.studentId,
            maxScore: sheet.scheme.totalMax,
            components: parts.map((c, i) => ({ name: c.name, score: Number(cells[i]), maxScore: c.maxScore })),
          }
        : { studentId: row.studentId, score: Number(cells[0]), maxScore: sheet.scheme.totalMax };
    });
    const answer = await sendJson(base, "POST", { periodId: sheet.period.id, subjectId: sheet.subject.id, results });
    setSaving(false);
    if (!answer.ok) return setNotice({ variant: "error", text: failureText(answer.status, answer.message) });
    await onChanged(`Saved the marks of ${results.length} pupil${results.length === 1 ? "" : "s"}.`);
  }

  async function submit() {
    const ids = drafts.map((r) => r.result!.id);
    if (ids.length === 0) return;
    setSaving(true);
    setNotice(null);
    const answer = await sendJson(`${base}/transition`, "POST", { resultIds: ids, toStatus: "SUBMITTED" });
    setSaving(false);
    if (!answer.ok) return setNotice({ variant: "error", text: failureText(answer.status, answer.message) });
    await onChanged(`Sent ${ids.length} saved mark${ids.length === 1 ? "" : "s"} for review.`);
  }

  return (
    <>
      <LiveNotice notice={notice} />
      <p className="text-sm text-fg-2">
        {sheet.subject.name} · {sheet.arm.classGroupName} {sheet.arm.name} · {sheet.period.label}.{" "}
        {parts.length > 0
          ? `Marks are built from ${parts.map((c) => `${c.name} (${c.maxScore})`).join(", ")}, out of ${sheet.scheme.totalMax}.`
          : `One mark out of ${sheet.scheme.totalMax}.`}
      </p>
      {sheet.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          Nobody is on the roll of this class for this term.
        </p>
      ) : (
        <div role="region" aria-label={`Marks for ${sheet.subject.name}`} tabIndex={0} className={REGION}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Marks of each pupil for {sheet.subject.name}.</caption>
            <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Pupil
                </th>
                {parts.length > 0 ? (
                  parts.map((c) => (
                    <th scope="col" key={c.name} className="px-3 py-3">
                      {c.name} /{c.maxScore}
                    </th>
                  ))
                ) : (
                  <th scope="col" className="px-3 py-3">
                    Mark /{sheet.scheme.totalMax}
                  </th>
                )}
                {parts.length > 0 && (
                  <th scope="col" className="px-3 py-3">
                    Total
                  </th>
                )}
                <th scope="col" className="px-3 py-3">
                  Grade
                </th>
                <th scope="col" className="px-3 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sheet.rows.map((row) => {
                const cells = typed[row.studentId] ?? [];
                const open = editable(row.result?.status);
                const name = `${row.firstName} ${row.lastName}`;
                const total = parts.length > 0 ? totalOf(cells) : null;
                return (
                  <tr key={row.studentId} className="align-top">
                    <th scope="row" className="px-3 py-3 font-medium text-fg">
                      {name}
                      <span className="block text-xs font-normal text-fg-muted">
                        {row.admissionNo}
                        {row.standing === "SUSPENDED" ? " · suspended" : ""}
                      </span>
                      {rowProblems[row.studentId] && (
                        <span className="mt-1 block text-xs font-normal text-danger-fg" role="alert">
                          {rowProblems[row.studentId]}
                        </span>
                      )}
                    </th>
                    {cells.map((cell, i) => (
                      <td key={i} className="px-3 py-3">
                        <input
                          inputMode="decimal"
                          aria-label={`${parts.length > 0 ? parts[i].name : "Mark"} for ${name}`}
                          aria-invalid={markProblem(cell, maxOf(i)) ? true : undefined}
                          disabled={!open}
                          value={cell}
                          onChange={(e) =>
                            setTyped((m) => ({ ...m, [row.studentId]: m[row.studentId].map((x, j) => (j === i ? e.target.value : x)) }))
                          }
                          className={`${FIELD} w-24 tabular-nums`}
                        />
                      </td>
                    ))}
                    {parts.length > 0 && <td className="px-3 py-3 font-semibold tabular-nums text-fg">{total === null ? "-" : total}</td>}
                    <td className="px-3 py-3 text-fg-2">{row.result?.gradeLetter ?? "-"}</td>
                    <td className="px-3 py-3">
                      {row.result ? (
                        <StatusPill tone={statusTone(row.result.status)}>{STATUS_LABEL[row.result.status]}</StatusPill>
                      ) : (
                        <span className="text-xs text-fg-muted">Not entered</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && sheet.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} loading={saving} disabled={dirty.length === 0 || Object.keys(rowProblems).length > 0}>
            Save marks
          </Button>
          <Button variant="secondary" onClick={() => void submit()} disabled={saving || drafts.length === 0 || dirty.length > 0}>
            Send {drafts.length} saved for review
          </Button>
          {dirty.length > 0 && (
            <p className="text-sm text-fg-muted">
              {dirty.length} pupil{dirty.length === 1 ? " has" : "s have"} unsaved marks. Save before sending for review.
            </p>
          )}
        </div>
      )}
    </>
  );
}
