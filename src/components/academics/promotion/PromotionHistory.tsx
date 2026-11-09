"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Alert";
import { ListState, StatusPill, useDialog } from "../parts";
import { useApi } from "../useApi";
import { DECISION_PAST, REGION, percent, type BatchRecord, type BatchView } from "./model";

const when = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

/// Every roll the person may see, newest first, and one roll opened to the decision taken for each pupil beside the one the rule advised.
export function PromotionHistory({ schoolCode, refreshKey }: { schoolCode: string; refreshKey: number }) {
  const base = `/api/v1/schools/${schoolCode}/academics/promotion/batches`;
  const { reply, error, loading, reload } = useApi(`${base}?r=${refreshKey}`);
  const batches = (reply?.data?.batches as BatchView[] | undefined) ?? [];
  const details = useDialog<BatchView>();

  return (
    <section aria-labelledby="promotion-history-heading" className="space-y-4">
      <div>
        <h2 id="promotion-history-heading" className="text-lg font-semibold tracking-tight text-fg">
          History
        </h2>
        <p className="mt-1 text-sm text-fg-muted">Every roll that was made. A roll is never edited or removed.</p>
      </div>
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
                  </td>
                  <td className="px-3 py-3 text-fg-2">{b.executedBy.name ?? b.executedBy.email ?? "Unknown"}</td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => details.show(b)}
                      aria-label={`Details of the ${b.sourceClassGroup.name} promotion of ${when(b.createdAt)}`}
                    >
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListState>
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
