"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { getJson } from "@/components/auth/postJson";
import { ListState } from "@/components/academics/parts";
import { failureText, useApi } from "@/components/academics/useApi";
import { RemarksEditor } from "./RemarksEditor";
import { ReportCard } from "./ReportCard";
import { REGION, type Options, type ReportCardData, type RosterRow } from "./model";

/// "Report cards": pick a term and a class, see the pupils and how many of their marks are published, open one pupil's card and print it. The card is the one the report-card API builds; this
/// screen adds nothing the API would not give the same person.
export function CardsPanel({ schoolCode, institution }: { schoolCode: string; institution: string }) {
  const base = `/api/v1/schools/${schoolCode}`;
  const options = useApi(`${base}/academics/results/options`);
  const data = options.reply?.data as Options | undefined;
  const [chosenPeriod, setPeriodId] = useState("");
  const [chosenArm, setArmId] = useState("");
  // The chosen term and class, else the current term and the first class (derived, not copied into state by an effect).
  const periodId = data?.periods.some((p) => p.id === chosenPeriod)
    ? chosenPeriod
    : ((data?.periods.find((p) => p.isCurrent) ?? data?.periods[0])?.id ?? "");
  const armId = data?.arms.some((a) => a.id === chosenArm) ? chosenArm : (data?.arms[0]?.id ?? "");
  const [card, setCard] = useState<ReportCardData | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const roster = useApi(
    periodId && armId ? `${base}/academics/results/roster?${new URLSearchParams({ periodId, classArmId: armId })}` : null,
  );
  const rows = (roster.reply?.data?.rows as RosterRow[] | undefined) ?? [];

  async function open(studentId: string) {
    setOpening(studentId);
    setProblem(null);
    const answer = await getJson(`${base}/people/students/${studentId}/report-card?${new URLSearchParams({ periodId })}`);
    setOpening(null);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    setCard(answer.data as unknown as ReportCardData);
  }

  if (options.error) return <Alert variant="error">{options.error}</Alert>;
  if (options.loading)
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-fg-muted" aria-busy="true">
        Loading…
      </p>
    );
  if (!data || data.periods.length === 0 || data.arms.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        There is no active session, or no class you can read, yet.
      </p>
    );

  if (card) {
    return (
      <section aria-label="Report card" className="space-y-4">
        <div className="flex flex-wrap gap-3 print:hidden">
          <Button variant="secondary" onClick={() => setCard(null)}>
            Back to the class
          </Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
        <ReportCard card={card} institution={institution} />
        <RemarksEditor
          key={`${card.student.id}-${card.period.id}`}
          schoolCode={schoolCode}
          card={card}
          onSaved={(remarks) => setCard((current) => (current ? { ...current, remarks } : current))}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="cards-heading" className="space-y-4">
      <div>
        <h2 id="cards-heading" className="text-lg font-semibold tracking-tight text-fg">
          Report cards
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Choose a term and a class, then open a pupil&apos;s card. A card lists every mark entered; a pupil or parent sees only the
          published ones.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Term"
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          options={data.periods.map((p) => ({ value: p.id, label: `${p.label} (${p.sessionLabel})` }))}
        />
        <SelectField
          label="Class"
          value={armId}
          onChange={(e) => setArmId(e.target.value)}
          options={data.arms.map((a) => ({ value: a.id, label: `${a.classGroupName} ${a.name}` }))}
        />
      </div>
      {problem && <Alert variant="error">{problem}</Alert>}
      <ListState
        loading={roster.loading}
        error={roster.error}
        empty={rows.length === 0}
        emptyText="Nobody was on the roll of this class for this term."
        onRetry={() => void roster.reload()}
      >
        <div role="region" aria-label="Pupils of the class" tabIndex={0} className={REGION}>
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Pupils of the class and how many of their marks are published.</caption>
            <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Pupil
                </th>
                <th scope="col" className="px-3 py-3">
                  Marks published
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Card</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <th scope="row" className="px-3 py-3 font-medium text-fg">
                    {r.firstName} {r.lastName}
                    <span className="block text-xs font-normal text-fg-muted">{r.admissionNo}</span>
                  </th>
                  <td className="px-3 py-3 tabular-nums text-fg-2">
                    {r.published} of {r.total}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      variant="secondary"
                      loading={opening === r.studentId}
                      onClick={() => void open(r.studentId)}
                      aria-label={`Open the report card of ${r.firstName} ${r.lastName}`}
                    >
                      Open card
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListState>
    </section>
  );
}
