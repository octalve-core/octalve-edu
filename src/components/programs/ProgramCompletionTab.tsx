"use client";

import { schoolCodeOfBase, useProgramBase } from "./program-base";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { formatNaira } from "@/lib/finance/format";
import type { CertificateRow, CompletionRow, CompletionView, ProgramPlan } from "@/lib/programs/completion-service";
import { dayText, type ProgramDetail } from "@/components/programs/model";
import { STATE_STYLE, STATE_TEXT } from "@/components/programs/people-model";
import { ruleText } from "@/components/programs/completion-model";

// Completion and certificates (task 0027, slice P5). Presentation only: the API decides who may complete whom, whether the program can be completed, and who may see which certificate.

const say = (reply: Reply, fallback: string): string => (reply.ok ? fallback : failureText(reply.status, reply.message) || fallback);

const VIEWS = [
  { id: "completion", label: "Completion" },
  { id: "certificates", label: "Certificates" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

export function ProgramCompletionTab({ program }: { program: ProgramDetail }) {
  const manage = program.access === "SUPER" || program.access === "ADMIN";
  const [view, setView] = useState<ViewId>(manage ? "completion" : "certificates");
  const sections = manage ? VIEWS : VIEWS.filter((v) => v.id === "certificates");
  return (
    <section aria-labelledby="program-completion" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id="program-completion" className="text-lg font-semibold text-fg">
        {manage ? "Completion and certificates" : "Certificates"}
      </h2>
      <SectionTabs label="Completion views" idPrefix="completion-" sections={sections} active={view} onChange={setView}>
        <div className="space-y-4 pt-4">
          {view === "completion" && manage && <CompletionView program={program} />}
          {view === "certificates" && <CertificatesView program={program} manage={manage} />}
        </div>
      </SectionTabs>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Completion

function CompletionView({ program }: { program: ProgramDetail }) {
  const programBase = useProgramBase();
  const base = `${programBase}/completion`;
  const [data, setData] = useState<CompletionView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [completing, setCompleting] = useState<CompletionRow | null>(null);
  const [reopening, setReopening] = useState<CompletionRow | null>(null);
  const [whole, setWhole] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(base, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The people couldn't be loaded."));
      setFailed(null);
      setData(reply.data as unknown as CompletionView);
    });
    return () => controller.abort();
  }, [base, version]);

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!data) return <p className="text-sm text-fg-muted">Loading…</p>;
  const done = (text: string) => {
    setCompleting(null);
    setReopening(null);
    setWhole(false);
    setNotice({ variant: "success", text });
    setVersion((n) => n + 1);
  };
  const open = data.program.status === "ACTIVE";
  return (
    <div className="space-y-3">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      <p className="text-sm text-fg-muted">
        Completing a place records that the person has finished, and lets you give them a certificate. {ruleText(data.rule)}
        {data.noCertWhileOwing ? " A certificate is not issued while fees are owed." : ""}
      </p>
      {data.program.kind === "ONGOING" && (
        <p className="rounded-xl border border-line p-3 text-sm text-fg-2">
          A program that never ends is archived, not completed. You can still complete one person&apos;s place when they finish.
        </p>
      )}
      {data.program.kind === "FIXED_TERM" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
          <p className="text-sm text-fg-2">
            {data.program.completable.ok ? "The program has reached its end date." : data.program.completable.why}
          </p>
          {data.program.completable.ok && <Button onClick={() => setWhole(true)}>Complete the program</Button>}
        </div>
      )}
      {data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          There is no one to complete yet.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="People">
          {data.rows.map((row) => (
            <li key={row.participantId} className="space-y-1 rounded-xl border border-line px-3 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-fg">{row.name}</p>
                  <p className="break-words text-xs text-fg-muted">
                    {row.groupPath}
                    {row.completedOn ? ` · completed ${dayText(row.completedOn)}` : ""}
                    {row.certificate
                      ? ` · certificate ${row.certificate.serialNo}${row.certificate.status === "REVOKED" ? " (withdrawn)" : ""}`
                      : ""}
                  </p>
                  {row.status === "ACTIVE" && !row.meets.ok && (
                    <p className="break-words text-xs text-warn-fg">Does not meet the rule: {row.meets.why.join(" ")}</p>
                  )}
                  {row.overrideReason && <p className="break-words text-xs text-fg-muted">Completed anyway: {row.overrideReason}</p>}
                  {row.owes > 0 && <p className="text-xs text-warn-fg">Owes {formatNaira(row.owes)}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${row.status === "COMPLETED" ? STATE_STYLE.COMPLETED : STATE_STYLE[row.state]}`}
                >
                  {row.status === "COMPLETED" ? "Completed" : STATE_TEXT[row.state]}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {row.status === "ACTIVE" && open && row.completable.ok && (
                  <Button variant="secondary" aria-label={`Complete ${row.name}`} onClick={() => setCompleting(row)}>
                    Complete
                  </Button>
                )}
                {row.status === "ACTIVE" && !row.completable.ok && <span className="text-xs text-fg-muted">{row.completable.why}</span>}
                {row.status === "COMPLETED" &&
                  open &&
                  program.access === "SUPER" &&
                  (!row.certificate || row.certificate.status === "REVOKED") && (
                    <Button variant="ghost" aria-label={`Reopen the place of ${row.name}`} onClick={() => setReopening(row)}>
                      Reopen
                    </Button>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog
        open={completing !== null}
        title={completing ? `Complete ${completing.name}` : ""}
        description={
          completing && !completing.meets.ok
            ? `${completing.name} does not meet the completion rule. Give a reason to complete them anyway; it is kept.`
            : "Their place is marked completed today."
        }
        needReason={completing ? !completing.meets.ok : false}
        label="Why complete them anyway?"
        submit="Complete place"
        onClose={() => setCompleting(null)}
        onSubmit={(reason) =>
          sendJson(
            `${base}/places/${encodeURIComponent(completing!.participantId)}`,
            "POST",
            completing!.meets.ok ? {} : { overrideReason: reason },
          )
        }
        onDone={() => done(`${completing?.name} is completed.`)}
      />
      <ReasonDialog
        open={reopening !== null}
        title={reopening ? `Reopen ${reopening.name}'s place` : ""}
        description="The place becomes open again. Only a school administrator can do this; the reason is kept."
        needReason
        label="Why reopen it?"
        submit="Reopen place"
        onClose={() => setReopening(null)}
        onSubmit={(reason) => sendJson(`${base}/places/${encodeURIComponent(reopening!.participantId)}/reopen`, "POST", { reason })}
        onDone={() => done(`${reopening?.name}'s place is open again.`)}
      />
      <WholeDialog open={whole} base={base} onClose={() => setWhole(false)} onDone={done} />
    </div>
  );
}

function ReasonDialog({
  open,
  title,
  description,
  needReason,
  label,
  submit,
  onClose,
  onSubmit,
  onDone,
}: {
  open: boolean;
  title: string;
  description: string;
  needReason: boolean;
  label: string;
  submit: string;
  onClose: () => void;
  onSubmit: (reason: string) => ReturnType<typeof sendJson>;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      {open && <ReasonBody needReason={needReason} label={label} submit={submit} onClose={onClose} onSubmit={onSubmit} onDone={onDone} />}
    </Dialog>
  );
}

function ReasonBody({
  needReason,
  label,
  submit,
  onClose,
  onSubmit,
  onDone,
}: {
  needReason: boolean;
  label: string;
  submit: string;
  onClose: () => void;
  onSubmit: (reason: string) => ReturnType<typeof sendJson>;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {needReason && (
        <TextField label={label} value={reason} maxLength={500} hint="At least 3 characters." onChange={(e) => setReason(e.target.value)} />
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={pending}
          disabled={needReason && reason.trim().length < 3}
          onClick={async () => {
            setPending(true);
            const reply = await onSubmit(reason.trim());
            setPending(false);
            if (reply.ok) onDone();
            else setError(say(reply, "That didn't work."));
          }}
        >
          {submit}
        </Button>
      </div>
    </div>
  );
}

function WholeDialog({
  open,
  base,
  onClose,
  onDone,
}: {
  open: boolean;
  base: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Complete the program?"
      description="Every open place whose person is taking part is completed, and the program is marked completed. This can't be undone as a whole."
    >
      {open && <WholeBody base={base} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function WholeBody({ base, onClose, onDone }: { base: string; onClose: () => void; onDone: (text: string) => void }) {
  const [plan, setPlan] = useState<ProgramPlan | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void sendJson(base, "POST", { confirm: false }).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The list couldn't be made."));
      setPlan(reply.data as unknown as ProgramPlan);
    });
    return () => controller.abort();
  }, [base]);
  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!plan) return <p className="mt-4 text-sm text-fg-muted">Loading…</p>;
  const blocked = plan.willComplete.filter((w) => !w.meets);
  const ready = blocked.every((b) => (reasons[b.participantId]?.trim().length ?? 0) >= 3);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-fg-2" aria-live="polite">
        {plan.willComplete.length} will be completed, {plan.skipped.length} skipped.{" "}
        {plan.owing > 0 ? `${plan.owing} still owe fees (a warning only). ` : ""}
      </p>
      {plan.skipped.length > 0 && (
        <ul className="max-h-32 space-y-1 overflow-y-auto" aria-label="Skipped">
          {plan.skipped.map((s) => (
            <li key={s.participantId} className="break-words text-xs text-fg-muted">
              {s.name}: {s.reason}
            </li>
          ))}
        </ul>
      )}
      {blocked.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg">
            These people do not meet the completion rule. Give a reason for each to complete them anyway.
          </p>
          {blocked.map((b) => (
            <TextField
              key={b.participantId}
              label={`Reason for ${b.name}`}
              value={reasons[b.participantId] ?? ""}
              hint={b.why.join(" ")}
              maxLength={500}
              onChange={(e) => setReasons((c) => ({ ...c, [b.participantId]: e.target.value }))}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={pending}
          disabled={!ready}
          onClick={async () => {
            setPending(true);
            const reply = await sendJson(base, "POST", {
              confirm: true,
              overrides: blocked.map((b) => ({ participantId: b.participantId, reason: reasons[b.participantId]!.trim() })),
            });
            setPending(false);
            if (!reply.ok) return setFailed(say(reply, "That didn't work."));
            const r = reply.data as unknown as { completed: number };
            onDone(`The program is completed: ${r.completed} ${r.completed === 1 ? "place" : "places"} completed.`);
          }}
        >
          Complete the program
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Certificates

function CertificatesView({ program, manage }: { program: ProgramDetail; manage: boolean }) {
  const programBase = useProgramBase();
  const base = `${programBase}/certificates`;
  const schoolCode = schoolCodeOfBase(programBase);
  const [rows, setRows] = useState<CertificateRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [revoking, setRevoking] = useState<CertificateRow | null>(null);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(base, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The certificates couldn't be loaded."));
      setFailed(null);
      setRows((reply.data as unknown as { certificates: CertificateRow[] }).certificates);
    });
    return () => controller.abort();
  }, [base, version]);

  async function issue() {
    setIssuing(true);
    const reply = await sendJson(base, "POST", {});
    setIssuing(false);
    if (!reply.ok) return setNotice({ variant: "error", text: say(reply, "That didn't work.") });
    const r = reply.data as unknown as { issued: number; skipped: { name: string; reason: string }[] };
    setNotice({
      variant: "success",
      text: `${r.issued} ${r.issued === 1 ? "certificate was" : "certificates were"} issued.${
        r.skipped.length > 0
          ? ` ${r.skipped.length} skipped: ${r.skipped
              .slice(0, 3)
              .map((s) => `${s.name || "someone"} (${s.reason})`)
              .join(", ")}.`
          : ""
      }`,
    });
    setVersion((n) => n + 1);
  }

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!rows) return <p className="text-sm text-fg-muted">Loading…</p>;
  return (
    <div className="space-y-3">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      <p className="text-sm text-fg-muted">
        A certificate keeps the wording and the name it was issued with. It has a QR code to a public page that confirms it is genuine,
        showing only the first name and the initial of the last. A withdrawn certificate stays on record and says so there.
      </p>
      {manage && (
        <div className="flex justify-end">
          <Button loading={issuing} onClick={() => void issue()}>
            Issue certificates for everyone completed
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          No certificate has been issued yet.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Certificates">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="break-words font-semibold text-fg">
                  {c.personName} <span className="text-xs font-normal text-fg-muted">{c.serialNo}</span>
                </p>
                <p className="text-xs text-fg-muted">
                  Completed {dayText(c.completedOn)} · issued {dayText(c.issuedOn)} · {c.status === "REVOKED" ? "withdrawn" : "in force"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.status === "ISSUED" && (
                  <Link
                    href={`/schools/${schoolCode}/programs/${encodeURIComponent(program.id)}/certificates/${encodeURIComponent(c.id)}`}
                    aria-label={`Open the certificate of ${c.personName}`}
                    className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Open
                  </Link>
                )}
                {manage && c.status === "ISSUED" && (
                  <Button variant="ghost" aria-label={`Withdraw the certificate of ${c.personName}`} onClick={() => setRevoking(c)}>
                    Withdraw
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog
        open={revoking !== null}
        title={revoking ? `Withdraw ${revoking.serialNo}?` : ""}
        description="It stays on record, the public page says it was withdrawn, and a new one can be issued. The reason is kept."
        needReason
        label="Why is it withdrawn?"
        submit="Withdraw certificate"
        onClose={() => setRevoking(null)}
        onSubmit={(reason) => sendJson(`${base}/${encodeURIComponent(revoking!.id)}`, "POST", { action: "revoke", reason })}
        onDone={() => {
          setRevoking(null);
          setNotice({ variant: "success", text: "The certificate was withdrawn." });
          setVersion((n) => n + 1);
        }}
      />
    </div>
  );
}
