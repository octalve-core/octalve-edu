"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { sendJson } from "@/components/auth/postJson";
import { ListState, LiveNotice, StatusPill, useDialog, type Notice } from "@/components/academics/parts";
import { failureText, useApi } from "@/components/academics/useApi";
import { REGION, STATUS_LABEL, statusTone, type Options, type ResultStatus, type ReviewItem } from "./model";

const FILTERS: { value: string; label: string }[] = [
  { value: "SUBMITTED", label: "Waiting for review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PUBLISHED", label: "Published" },
  { value: "LOCKED", label: "Locked" },
  { value: "DRAFT", label: "Drafts" },
];

/// "Review": the marks of one term by status. A person who may approve selects marks and approves, publishes, returns them to their author (with a reason) or - an administrator - locks them;
/// anyone else only reads. Whether a change is allowed is decided by the server (who entered it, the approver's scope, the order of the steps); its words are shown as they come.
export function ReviewPanel({ schoolCode, canApprove, isAdmin }: { schoolCode: string; canApprove: boolean; isAdmin: boolean }) {
  const base = `/api/v1/schools/${schoolCode}/academics/results`;
  const options = useApi(`${base}/options`);
  const data = options.reply?.data as Options | undefined;
  const [chosenPeriod, setPeriodId] = useState("");
  const [armId, setArmId] = useState("");
  const [status, setStatus] = useState("SUBMITTED");
  // The chosen term, else the current one (derived, not copied into state by an effect).
  const periodId = data?.periods.some((p) => p.id === chosenPeriod)
    ? chosenPeriod
    : ((data?.periods.find((p) => p.isCurrent) ?? data?.periods[0])?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [reason, setReason] = useState("");
  const [returnError, setReturnError] = useState<string | null>(null);
  const returning = useDialog();

  const query = new URLSearchParams({ periodId, status, ...(armId ? { classArmId: armId } : {}) });
  const list = useApi(periodId ? `${base}?${query}` : null);
  const items = useMemo(() => (list.reply?.data?.results as ReviewItem[] | undefined) ?? [], [list.reply]);

  async function act(toStatus: ResultStatus, why?: string) {
    if (picked.length === 0) return false;
    setBusy(true);
    setNotice(null);
    const answer = await sendJson(`${base}/transition`, "POST", { resultIds: picked, toStatus, ...(why ? { reason: why } : {}) });
    setBusy(false);
    if (!answer.ok) {
      setNotice({ variant: "error", text: failureText(answer.status, answer.message) });
      return false;
    }
    setNotice({
      variant: "success",
      text: `${picked.length} mark${picked.length === 1 ? "" : "s"} moved to ${STATUS_LABEL[toStatus].toLowerCase()}.`,
    });
    setPicked([]);
    await list.reload();
    return true;
  }

  if (options.error) return <Alert variant="error">{options.error}</Alert>;
  if (options.loading)
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-fg-muted" aria-busy="true">
        Loading…
      </p>
    );
  if (!data || data.periods.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        There is no active session yet.
      </p>
    );

  const allPicked = items.length > 0 && picked.length === items.length;
  return (
    <section aria-labelledby="review-heading" className="space-y-4">
      <div>
        <h2 id="review-heading" className="text-lg font-semibold tracking-tight text-fg">
          Review and publish
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {canApprove
            ? "Approve what is correct, publish it to the pupils and parents, or send it back to the teacher with a reason."
            : "The marks of a term by status. Approving and publishing are for the people the school has given that to."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Term"
          value={periodId}
          onChange={(e) => {
            setPeriodId(e.target.value);
            setPicked([]);
          }}
          options={data.periods.map((p) => ({ value: p.id, label: `${p.label} (${p.sessionLabel})` }))}
        />
        <SelectField
          label="Class"
          value={armId}
          onChange={(e) => {
            setArmId(e.target.value);
            setPicked([]);
          }}
          options={[
            { value: "", label: "All my classes" },
            ...data.arms.map((a) => ({ value: a.id, label: `${a.classGroupName} ${a.name}` })),
          ]}
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPicked([]);
          }}
          options={FILTERS}
        />
      </div>
      <LiveNotice notice={notice} />
      <ListState
        loading={list.loading}
        error={list.error}
        empty={items.length === 0}
        emptyText="No marks with this status."
        onRetry={() => void list.reload()}
      >
        {canApprove && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Actions on the selected marks">
            <p className="mr-2 text-sm text-fg-2" role="status">
              {picked.length} of {items.length} selected
            </p>
            <Button onClick={() => void act("APPROVED")} disabled={picked.length === 0 || busy}>
              Approve
            </Button>
            <Button variant="secondary" onClick={() => void act("PUBLISHED")} disabled={picked.length === 0 || busy}>
              Publish
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setReason("");
                setReturnError(null);
                returning.show(true);
              }}
              disabled={picked.length === 0 || busy}
            >
              Return to author
            </Button>
            {isAdmin && (
              <Button variant="secondary" onClick={() => void act("LOCKED")} disabled={picked.length === 0 || busy}>
                Lock
              </Button>
            )}
          </div>
        )}
        <div role="region" aria-label="Marks to review" tabIndex={0} className={REGION}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Marks of the chosen term with the chosen status.</caption>
            <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
              <tr>
                {canApprove && (
                  <th scope="col" className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all marks"
                      checked={allPicked}
                      onChange={(e) => setPicked(e.target.checked ? items.map((i) => i.id) : [])}
                      className="h-4 w-4"
                    />
                  </th>
                )}
                <th scope="col" className="px-3 py-3">
                  Pupil
                </th>
                <th scope="col" className="px-3 py-3">
                  Subject
                </th>
                <th scope="col" className="px-3 py-3">
                  Mark
                </th>
                <th scope="col" className="px-3 py-3">
                  Grade
                </th>
                <th scope="col" className="px-3 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => {
                const name = `${item.student.firstName} ${item.student.lastName}`;
                return (
                  <tr key={item.id}>
                    {canApprove && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.subject.name} for ${name}`}
                          checked={picked.includes(item.id)}
                          onChange={() => setPicked((p) => (p.includes(item.id) ? p.filter((x) => x !== item.id) : [...p, item.id]))}
                          className="h-4 w-4"
                        />
                      </td>
                    )}
                    <th scope="row" className="px-3 py-3 font-medium text-fg">
                      {name}
                      <span className="block text-xs font-normal text-fg-muted">{item.student.admissionNo}</span>
                    </th>
                    <td className="px-3 py-3 text-fg-2">{item.subject.name}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-fg">
                      {Number(item.score)} / {Number(item.maxScore)}
                    </td>
                    <td className="px-3 py-3 text-fg-2">{item.gradeLetter ?? "-"}</td>
                    <td className="px-3 py-3">
                      <StatusPill tone={statusTone(item.status)}>{STATUS_LABEL[item.status]}</StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ListState>

      {returning.n > 0 && (
        <Dialog
          key={`return-${returning.n}`}
          open={returning.open}
          onClose={returning.hide}
          title="Return to the teacher"
          description={`${picked.length} mark${picked.length === 1 ? "" : "s"} go back to draft. The teacher sees your reason.`}
        >
          <div className="mt-4">
            <TextAreaField label="Reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
          </div>
          {returnError && (
            <Alert variant="error" className="mt-3">
              {returnError}
            </Alert>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" onClick={returning.hide}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={reason.trim() === ""}
              onClick={async () => {
                if (await act("DRAFT", reason.trim())) returning.hide();
                else setReturnError("It could not be returned. The reason is shown above the table.");
              }}
            >
              Return
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
