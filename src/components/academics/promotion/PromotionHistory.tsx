"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Alert";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { StepUpModal } from "@/components/settings/StepUpModal";
import { sendJson } from "@/components/auth/postJson";
import { ListState, LiveNotice, StatusPill, useDialog, type Notice } from "../parts";
import { failureText, useApi } from "../useApi";
import { DECISION_PAST, REGION, percent, type BatchRecord, type BatchView } from "./model";

const when = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

/// Every roll the person may see, newest first, and one roll opened to the decision taken for each pupil beside the one the rule advised. A roll that was a mistake can be undone by the school's
/// administrator (task 0040): the roll stays in the list, marked as undone with who and why. The server decides who may and whether it can be done; the button is a courtesy.
export function PromotionHistory({
  schoolCode,
  refreshKey,
  canUndo,
  hasMfa,
  onUndone,
}: {
  schoolCode: string;
  refreshKey: number;
  canUndo: boolean;
  hasMfa: boolean;
  onUndone: () => void;
}) {
  const base = `/api/v1/schools/${schoolCode}/academics/promotion/batches`;
  const { reply, error, loading, reload } = useApi(`${base}?r=${refreshKey}`);
  const batches = (reply?.data?.batches as BatchView[] | undefined) ?? [];
  const details = useDialog<BatchView>();
  const undo = useDialog<BatchView>();
  const [notice, setNotice] = useState<Notice>(null);

  return (
    <section aria-labelledby="promotion-history-heading" className="space-y-4">
      <div>
        <h2 id="promotion-history-heading" className="text-lg font-semibold tracking-tight text-fg">
          History
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Every roll that was made. A roll is never edited or removed; one that was a mistake can be undone, and the undo is recorded too.
        </p>
      </div>
      <LiveNotice notice={notice} />
      <ListState
        loading={loading}
        error={error}
        empty={batches.length === 0}
        emptyText="No class has been rolled yet."
        onRetry={() => void reload()}
      >
        <div role="region" aria-label="Past promotions" tabIndex={0} className={REGION}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Past promotions, newest first.</caption>
            <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
              <tr>
                <th scope="col" className="px-3 py-3">
                  When
                </th>
                <th scope="col" className="px-3 py-3">
                  Class
                </th>
                <th scope="col" className="px-3 py-3">
                  Sessions
                </th>
                <th scope="col" className="px-3 py-3">
                  Result
                </th>
                <th scope="col" className="px-3 py-3">
                  By
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-3 whitespace-nowrap text-fg-2">{when(b.createdAt)}</td>
                  <td className="px-3 py-3 font-medium text-fg">
                    {b.sourceClassGroup.name}
                    {b.targetClassGroup ? ` → ${b.targetClassGroup.name}` : " (graduating)"}
                  </td>
                  <td className="px-3 py-3 text-fg-2">
                    {b.sourceSession.label} → {b.targetSession.label}
                  </td>
                  <td className="px-3 py-3 text-fg-2">
                    {b.totals.promoted} promoted, {b.totals.repeated} repeating, {b.totals.graduated} graduated
                    {b.totals.withdrawn > 0 ? `, ${b.totals.withdrawn} withdrawn` : ""}
                    {b.totals.skipped > 0 ? `, ${b.totals.skipped} left as they were` : ""}
                    {b.reversal && (
                      <span className="mt-1 block">
                        <StatusPill tone="warn">Undone</StatusPill>
                        <span className="mt-1 block text-xs text-fg-muted">
                          {when(b.reversal.createdAt)} by {b.reversal.by.name ?? b.reversal.by.email ?? "Unknown"}: {b.reversal.reason}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-fg-2">{b.executedBy.name ?? b.executedBy.email ?? "Unknown"}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => details.show(b)}
                        aria-label={`Details of the ${b.sourceClassGroup.name} promotion of ${when(b.createdAt)}`}
                      >
                        Details
                      </Button>
                      {canUndo && !b.reversal && (
                        <Button
                          variant="secondary"
                          onClick={() => undo.show(b)}
                          aria-label={`Undo the ${b.sourceClassGroup.name} promotion of ${when(b.createdAt)}`}
                        >
                          Undo this roll
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListState>
      {undo.n > 0 && undo.value && (
        <UndoDialogs
          key={`undo-${undo.n}`}
          open={undo.open}
          schoolCode={schoolCode}
          batch={undo.value}
          hasMfa={hasMfa}
          onClose={undo.hide}
          onDone={(text) => {
            undo.hide();
            setNotice({ variant: "success", text });
            void reload();
            onUndone();
          }}
        />
      )}
      {details.n > 0 && details.value && (
        <BatchDetails
          key={`details-${details.n}`}
          open={details.open}
          schoolCode={schoolCode}
          batch={details.value}
          onClose={details.hide}
        />
      )}
    </section>
  );
}

function BatchDetails({ open, schoolCode, batch, onClose }: { open: boolean; schoolCode: string; batch: BatchView; onClose: () => void }) {
  const { reply, error, loading, reload } = useApi(`/api/v1/schools/${schoolCode}/academics/promotion/batches/${batch.id}`);
  const records = (reply?.data?.records as BatchRecord[] | undefined) ?? [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`${batch.sourceClassGroup.name}: ${batch.sourceSession.label} → ${batch.targetSession.label}`}
      description={`Made ${when(batch.createdAt)}. Pass mark ${batch.passMark}%.${batch.notes ? ` Note: ${batch.notes}` : ""}`}
    >
      {error ? (
        <Alert variant="error" className="mt-4">
          <p>{error}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void reload()}>
            Try again
          </Button>
        </Alert>
      ) : loading ? (
        <p className="mt-4 text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : (
        <div role="region" aria-label="Pupils in this promotion" tabIndex={0} className={`mt-4 ${REGION}`}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">The decision taken for each pupil and the one the rule advised.</caption>
            <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Pupil
                </th>
                <th scope="col" className="px-3 py-3">
                  Overall
                </th>
                <th scope="col" className="px-3 py-3">
                  Advised
                </th>
                <th scope="col" className="px-3 py-3">
                  Decided
                </th>
                <th scope="col" className="px-3 py-3">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {records.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-3 py-3 font-medium text-fg">
                    {r.student.firstName} {r.student.lastName}
                    <span className="block text-xs font-normal text-fg-muted">{r.student.admissionNo}</span>
                  </th>
                  <td className="px-3 py-3 tabular-nums text-fg-2">{percent(r.overallAverage)}</td>
                  <td className="px-3 py-3 text-fg-2">{DECISION_PAST[r.recommendedDecision]}</td>
                  <td className="px-3 py-3">
                    <StatusPill tone={r.decisionMode === "OVERRIDDEN" ? "info" : "neutral"}>
                      {DECISION_PAST[r.decision]}
                      {r.decisionMode === "OVERRIDDEN" ? " (changed)" : ""}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-3 text-fg-2">{r.overrideReason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

/// Undoing a roll, in two steps: say why (and see what will happen), then prove who is asking. The server refuses a roll whose places have been changed or used and names the pupils; those lines are shown
/// here, under the reason, and nothing was changed.
function UndoDialogs({
  open,
  schoolCode,
  batch,
  hasMfa,
  onClose,
  onDone,
}: {
  open: boolean;
  schoolCode: string;
  batch: BatchView;
  hasMfa: boolean;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<"reason" | "proof">("reason");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; lines: { path: string; message: string }[] } | null>(null);
  const trimmed = reason.trim();
  const tooLong = trimmed.length > 500;
  const name = `${batch.sourceClassGroup.name}: ${batch.sourceSession.label} → ${batch.targetSession.label}`;

  async function confirm(stepUp: { type: "totp" | "recovery" | "password"; value: string }) {
    setSaving(true);
    setError(null);
    const answer = await sendJson(`/api/v1/schools/${schoolCode}/academics/promotion/batches/${batch.id}/undo`, "POST", {
      reason: trimmed,
      stepUp,
    });
    setSaving(false);
    if (answer.ok) {
      const done = answer.data?.reversal as { restored: number; cancelled: number } | undefined;
      return onDone(`Undid the roll of ${name}: ${done?.restored ?? 0} pupil${done?.restored === 1 ? "" : "s"} put back where they were.`);
    }
    if (answer.code === "UNDO_BLOCKED") {
      setBlocked({ message: answer.message ?? "This roll cannot be undone.", lines: answer.details ?? [] });
      return setStage("reason");
    }
    setError(failureText(answer.status, answer.message));
  }

  return (
    <>
      <Dialog
        open={open && stage === "reason"}
        // The dialog reports EVERY close, including the one that moving on to the proof causes: only a close while this step is the one showing ends the undo.
        onClose={() => {
          if (stage === "reason") onClose();
        }}
        wide
        title="Undo this roll"
        description={`${name}, made ${when(batch.createdAt)}.`}
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-2">
            Every pupil of this roll goes back to the place they had before it: their place in {batch.sourceSession.label} is active again,
            and the new place the roll made in {batch.targetSession.label} is cancelled. The roll stays in the history, marked as undone. It
            is refused, and nothing changes, if any pupil&apos;s new place has already been used (marks, report remarks, an invoice,
            attendance) or changed.
          </p>
          <TextAreaField
            label="Why is this roll being undone?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            error={tooLong ? "At most 500 characters." : null}
            hint="Kept with the undo in the history."
          />
          {blocked && (
            <Alert variant="error">
              <p className="font-semibold">{blocked.message}</p>
              {blocked.lines.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {blocked.lines.map((line) => (
                    <li key={line.path}>{line.message}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setBlocked(null);
                setStage("proof");
              }}
              disabled={trimmed === "" || tooLong}
            >
              Continue
            </Button>
          </div>
        </div>
      </Dialog>
      <StepUpModal
        open={open && stage === "proof"}
        onClose={() => {
          setError(null);
          setStage("reason");
        }}
        onConfirm={confirm}
        hasMfa={hasMfa}
        saving={saving}
        error={error}
        deltas={[{ field: name, fromValue: "rolled", toValue: "undone", isWeakeningSecurity: false }]}
      />
    </>
  );
}
