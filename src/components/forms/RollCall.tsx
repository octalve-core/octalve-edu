"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import type { Notice } from "@/components/forms/model";
import { plural } from "@/components/forms/model";

// The roll call of paper work: who has handed it in, who was late, and a note for each pupil. Changes are collected and saved together. Presentation only: the API decides who may
// change the roll call, and decides that a paper handed in after the closing time is late.

type Status = "PENDING" | "HANDED_IN" | "LATE";
type TurnIn = {
  id: string;
  studentId: string;
  status: Status;
  note: string | null;
  requestedAt: string | null;
  studentName: string;
  admissionNo: string;
};
type Summary = { totalStudents: number; handedInCount: number; lateCount: number; pendingCount: number; requestedMarkingCount: number };
type Edit = { status: Status; note: string };

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "HANDED_IN", label: "Handed in" },
  { value: "LATE", label: "Late" },
];

const REFUSED = "Only the person who wrote this form, or an administrator, can change the roll call.";

export function RollCall({ formId }: { formId: string }) {
  const { api } = useFormsApi();
  const url = `${api}/forms/${encodeURIComponent(formId)}/turn-ins`;
  const [turnIns, setTurnIns] = useState<TurnIn[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(url, signal);
      if (signal?.aborted) return;
      if (!reply.ok) {
        setFailed(
          reply.status === 404
            ? "Only the person who wrote this form, an administrator, or someone allowed to read form results can see the roll call."
            : say(reply, "The roll call couldn't be loaded."),
        );
        return;
      }
      setFailed(null);
      setTurnIns((reply.data?.turnIns ?? []) as TurnIn[]);
      setSummary(reply.data?.summary as Summary);
    },
    [url],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the roll call when the page opens
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const valueOf = (t: TurnIn): Edit => edits[t.studentId] ?? { status: t.status, note: t.note ?? "" };
  function change(t: TurnIn, next: Partial<Edit>) {
    const merged = { ...valueOf(t), ...next };
    const same = merged.status === t.status && merged.note.trim() === (t.note ?? "");
    const rest = { ...edits };
    if (same) delete rest[t.studentId];
    else rest[t.studentId] = merged;
    setEdits(rest);
  }
  const changed = Object.keys(edits).length;

  async function save() {
    setBusy(true);
    const updates = Object.entries(edits).map(([studentId, e]) => ({ studentId, status: e.status, note: e.note.trim() || null }));
    const reply = await sendJson(`${url}/batch`, "POST", { updates });
    setBusy(false);
    if (!reply.ok)
      return setNotice({
        variant: "error",
        text: reply.status === 404 || reply.status === 403 ? REFUSED : say(reply, "The changes couldn't be saved."),
      });
    setNotice({ variant: "success", text: `${plural(Number(reply.data?.updatedCount ?? updates.length), "change")} saved.` });
    setEdits({});
    await load();
  }

  async function sync() {
    setBusy(true);
    const reply = await sendJson(`${url}/sync`, "POST", {});
    setBusy(false);
    if (!reply.ok)
      return setNotice({
        variant: "error",
        text: reply.status === 404 || reply.status === 403 ? REFUSED : say(reply, "The roll call couldn't be updated."),
      });
    const added = Number(reply.data?.addedCount ?? 0);
    setNotice({ variant: "success", text: added > 0 ? `${plural(added, "pupil")} added to the roll call.` : "Nobody new to add." });
    if (added > 0) await load();
  }

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (turnIns === null || summary === null) return <p className="text-sm text-fg-muted">Loading…</p>;
  const handed = summary.handedInCount + summary.lateCount;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-2">
          {`${handed} of ${summary.totalStudents} handed in · ${summary.lateCount} late · ${summary.pendingCount} still to hand in`}
          {summary.requestedMarkingCount > 0 ? ` · ${summary.requestedMarkingCount} asked for marking` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={sync}>
            Add pupils who joined the class
          </Button>
          <Button disabled={changed === 0} loading={busy} onClick={save}>
            {changed > 0 ? `Save changes (${changed})` : "Save changes"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-fg-muted">A paper handed in after the closing time is recorded as late.</p>

      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      {turnIns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          No pupils are on the roll call yet. Pupils of the classes this paper work is for are added when they join: use “Add pupils who
          joined the class”.
        </p>
      ) : (
        <ul aria-label="Roll call" className="space-y-3">
          {turnIns.map((t) => {
            const name = t.studentName;
            const value = valueOf(t);
            return (
              <li key={t.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-fg">{name}</p>
                    <p className="text-xs text-fg-muted">{t.admissionNo}</p>
                  </div>
                  {t.requestedAt && (
                    <span className="shrink-0 rounded-full border border-info-line bg-info-bg px-3 py-1 text-xs font-semibold text-info-fg">
                      Asked for marking
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                  <SelectField
                    label={`Status of ${name}`}
                    hideLabel
                    value={value.status}
                    onChange={(e) => change(t, { status: e.target.value as Status })}
                    options={STATUS_OPTIONS}
                  />
                  <input
                    type="text"
                    aria-label={`Note for ${name}`}
                    placeholder="Note (optional)"
                    maxLength={500}
                    value={value.note}
                    onChange={(e) => change(t, { note: e.target.value })}
                    className="min-h-11 w-full rounded-xl border border-line bg-field px-4 py-3 text-sm text-fg hover:border-line-strong focus:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
