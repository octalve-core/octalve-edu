"use client";

import { useProgramBase } from "./program-base";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, problemFor, sendJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { formatNaira } from "@/lib/finance/format";
import type { FeeItem, InvoiceDetail, InvoiceRow, PlanView } from "@/lib/programs/fees-service";
import { when, type ProgramDetail } from "@/components/programs/model";
import { KIND_TEXT } from "@/components/programs/people-model";
import {
  BILLED_TO_TEXT,
  CHANNELS,
  FREQUENCY_TEXT,
  STATUS_STYLE,
  STATUS_TEXT,
  amountProblem,
  audienceText,
  defaultPeriod,
  parseAmount,
  periodText,
} from "@/components/programs/fees-model";

// Fees (task 0027, slice P4): the program's own fees, the invoices made from them, payments, discounts and the report. Presentation only: the API decides who sees which invoices, applies the
// part-payment rule on every payment, and locks the invoice while it takes one.

const say = (reply: Reply, fallback: string): string => (reply.ok ? fallback : failureText(reply.status, reply.message) || fallback);

const VIEWS = [
  { id: "invoices", label: "Invoices" },
  { id: "items", label: "Fees" },
  { id: "generate", label: "Make invoices" },
  { id: "report", label: "Report" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];
const todayDay = () => new Date().toISOString().slice(0, 10);

export function ProgramFeesTab({ program }: { program: ProgramDetail }) {
  const [view, setView] = useState<ViewId>("invoices");
  const manage = program.access === "SUPER" || program.access === "ADMIN";
  const sections = manage ? VIEWS : VIEWS.filter((v) => v.id === "invoices" || v.id === "report");
  return (
    <section aria-labelledby="program-fees" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id="program-fees" className="text-lg font-semibold text-fg">
        Fees
      </h2>
      <p className="text-sm text-fg-muted">
        A program charges its own fees, with invoices and receipts of its own; the school&apos;s class fees are not affected.{" "}
        {manage ? "" : "You see the invoices of the people who are in the program through your own campus."} A payment follows the
        school&apos;s part-payment rule for the campus.
      </p>
      <SectionTabs label="Fee views" idPrefix="fees-" sections={sections} active={view} onChange={setView}>
        <div className="space-y-4 pt-4">
          {view === "invoices" && <InvoicesView program={program} />}
          {view === "items" && manage && <ItemsView program={program} />}
          {view === "generate" && manage && <GenerateView program={program} />}
          {view === "report" && <ReportView program={program} />}
        </div>
      </SectionTabs>
    </section>
  );
}

const StatusPill = ({ status }: { status: string }) => (
  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE.WAIVED}`}>
    {STATUS_TEXT[status] ?? status}
  </span>
);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Invoices

function InvoicesView({ program }: { program: ProgramDetail }) {
  const programBase = useProgramBase();
  const base = `${programBase}/fees/invoices`;
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [groupId, setGroupId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ invoices: InvoiceRow[]; total: number; hasNext: boolean } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (groupId) params.set("groupId", groupId);
    if (campusId) params.set("campusId", campusId);
    void getJson(`${base}?${params.toString()}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The invoices couldn't be loaded."));
      setFailed(null);
      setData({
        invoices: (reply.data as unknown as { invoices: InvoiceRow[] }).invoices,
        total: Number(reply.meta?.total ?? 0),
        hasNext: Boolean(reply.meta?.hasNext),
      });
    });
    return () => controller.abort();
  }, [base, page, search, status, groupId, campusId, version]);

  const groups = program.groups.filter((g) => !g.archived);
  const campuses = program.campuses.filter((b) => program.manageCampusIds.includes(b.id));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Search invoices"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or invoice number"
          autoComplete="off"
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "Every status" },
            ...["UNPAID", "PARTIALLY_PAID", "PAID", "WAIVED", "CANCELLED"].map((s) => ({ value: s, label: STATUS_TEXT[s]! })),
          ]}
        />
        <SelectField
          label="Group"
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setPage(1);
          }}
          options={[{ value: "", label: "Every group" }, ...groups.map((g) => ({ value: g.id, label: g.path }))]}
        />
        <SelectField
          label="Campus"
          value={campusId}
          onChange={(e) => {
            setCampusId(e.target.value);
            setPage(1);
          }}
          options={[{ value: "", label: "Every campus" }, ...campuses.map((b) => ({ value: b.id, label: b.name }))]}
        />
      </div>
      {failed && <Alert variant="error">{failed}</Alert>}
      {!data && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {data && data.invoices.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          {search || status || groupId || campusId ? "No invoice matches." : "There are no invoices yet."}
        </p>
      )}
      {data && data.invoices.length > 0 && (
        <>
          <p className="text-xs text-fg-muted" aria-live="polite">
            {data.total} {data.total === 1 ? "invoice" : "invoices"}
          </p>
          <ul className="space-y-2" aria-label="Invoices">
            {data.invoices.map((inv) => (
              <li key={inv.id} className="space-y-1 rounded-xl border border-line px-3 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-fg">
                      {inv.name} <span className="text-xs font-normal text-fg-muted">{inv.invoiceNo}</span>
                    </p>
                    <p className="break-words text-xs text-fg-muted">
                      {inv.groupPath} · {inv.campusName} · {periodText(inv.periodKey)}
                    </p>
                    <p className="text-fg-2">
                      {formatNaira(inv.total)} · paid {formatNaira(inv.paid)} · owes {formatNaira(inv.balance)}
                    </p>
                  </div>
                  <StatusPill status={inv.status} />
                </div>
                <Button variant="ghost" aria-label={`Open invoice ${inv.invoiceNo} of ${inv.name}`} onClick={() => setOpenId(inv.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-fg-muted">Page {page}</span>
            <Button variant="secondary" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
      <InvoiceDialog program={program} id={openId} onClose={() => setOpenId(null)} onChanged={() => setVersion((n) => n + 1)} />
    </div>
  );
}

function InvoiceDialog({
  program,
  id,
  onClose,
  onChanged,
}: {
  program: ProgramDetail;
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Dialog
      open={id !== null}
      onClose={onClose}
      title="Invoice"
      description="Payments follow the part-payment rule of the invoice's campus."
    >
      {id && <InvoiceBody key={id} program={program} id={id} onClose={onClose} onChanged={onChanged} />}
    </Dialog>
  );
}

function InvoiceBody({
  program,
  id,
  onClose,
  onChanged,
}: {
  program: ProgramDetail;
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const programBase = useProgramBase();
  const base = `${programBase}/fees/invoices/${encodeURIComponent(id)}`;
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [discount, setDiscount] = useState("");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(base, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The invoice couldn't be loaded."));
      setInv(reply.data as unknown as InvoiceDetail);
    });
    return () => controller.abort();
  }, [base, reload]);

  async function act(name: string, work: () => ReturnType<typeof sendJson>, done: string) {
    setBusy(name);
    const reply = await work();
    setBusy(null);
    if (reply.ok) {
      setNotice({ variant: "success", text: done });
      setReload((n) => n + 1);
      onChanged();
      return reply;
    }
    setNotice({ variant: "error", text: problemFor(reply, "amount") ?? say(reply, "That didn't work.") });
    return reply;
  }

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!inv) return <p className="mt-4 text-sm text-fg-muted">Loading…</p>;
  const balance = inv.balance;
  const payProblem = amount === "" ? null : amountProblem(amount, balance);
  const discountProblem = discount === "" ? null : amountProblem(discount);
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold text-fg">{inv.name}</p>
          <p className="text-xs text-fg-muted">
            {inv.invoiceNo} · {inv.groupPath} · {inv.campusName} · {periodText(inv.periodKey)}
          </p>
          {inv.billingName && (
            <p className="text-xs text-fg-muted">
              Bill to {inv.billingName}
              {inv.billingPhone ? `, ${inv.billingPhone}` : ""}
            </p>
          )}
        </div>
        <StatusPill status={inv.status} />
      </div>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      <ul className="space-y-1 text-sm" aria-label="Lines">
        {inv.lines.map((l) => (
          <li key={l.itemId} className="flex justify-between gap-3">
            <span className="break-words text-fg">
              {l.name}
              {l.discountPercent ? ` (${l.discountPercent}% off)` : ""}
            </span>
            <span className="shrink-0 text-fg-2">{formatNaira(l.net)}</span>
          </li>
        ))}
        {inv.discounts.map((d) => (
          <li key={d.id} className="flex justify-between gap-3 text-fg-muted">
            <span className="break-words">
              Discount: {d.reason} ({d.by})
            </span>
            <span className="shrink-0">−{formatNaira(d.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm font-semibold text-fg">
        Total {formatNaira(inv.total)} · paid {formatNaira(inv.paid)} · owes {formatNaira(inv.balance)}
      </p>
      <p className="text-xs text-fg-muted">
        {inv.payInFull ? "Marked pay in full only. " : ""}
        {inv.rule}
      </p>
      {inv.payments.length > 0 && (
        <ul className="space-y-1 text-xs text-fg-2" aria-label="Payments">
          {inv.payments.map((p) => (
            <li key={p.id} className="break-words">
              {formatNaira(p.amount)} · {p.status === "SUCCESS" ? "received" : p.status.toLowerCase()} · {p.channel ?? p.source}
              {p.receiptNo ? ` · receipt ${p.receiptNo}` : ""}
              {p.paidAt ? ` · ${when(p.paidAt)}` : ""}
              {p.recordedBy ? ` · ${p.recordedBy}` : ""}
            </li>
          ))}
        </ul>
      )}
      {inv.can.pay && (
        <form
          className="space-y-3 rounded-xl border border-line bg-surface-2 p-3"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (payProblem || amount === "") return;
            void act(
              "pay",
              () =>
                sendJson(`${base}/payments`, "POST", {
                  amount: parseAmount(amount),
                  channel,
                  ...(reference.trim() ? { reference: reference.trim() } : {}),
                }),
              "The payment was recorded.",
            ).then((r) => {
              if (r?.ok) {
                setAmount("");
                setReference("");
              }
            });
          }}
        >
          <p className="text-sm font-semibold text-fg">Record a payment</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Amount"
              inputMode="decimal"
              value={amount}
              error={payProblem}
              hint={`Up to ${formatNaira(balance)}`}
              onChange={(e) => setAmount(e.target.value)}
            />
            <SelectField
              label="How was it paid?"
              value={channel}
              options={CHANNELS.map((c) => ({ value: c, label: c }))}
              onChange={(e) => setChannel(e.target.value)}
            />
            <TextField label="Reference" value={reference} maxLength={64} hint="Optional" onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy === "pay"} disabled={amount === "" || Boolean(payProblem)}>
              Record payment
            </Button>
            <Button variant="ghost" onClick={() => setAmount(String(balance))}>
              Pay the full balance
            </Button>
          </div>
        </form>
      )}
      {inv.can.discount && (
        <form
          className="space-y-3 rounded-xl border border-line p-3"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (discountProblem || discount === "" || reason.trim().length < 3) return;
            void act(
              "discount",
              () => sendJson(`${base}/discounts`, "POST", { amount: parseAmount(discount), reason: reason.trim() }),
              "The discount was applied.",
            ).then((r) => {
              if (r?.ok) {
                setDiscount("");
                setReason("");
              }
            });
          }}
        >
          <p className="text-sm font-semibold text-fg">Give a discount</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Discount amount"
              inputMode="decimal"
              value={discount}
              error={discountProblem}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <TextField
              label="Reason for the discount"
              value={reason}
              maxLength={500}
              hint="At least 3 characters"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            loading={busy === "discount"}
            disabled={discount === "" || Boolean(discountProblem) || reason.trim().length < 3}
          >
            Apply discount
          </Button>
        </form>
      )}
      {inv.can.pay && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold text-fg">Pay online</p>
          <TextField
            label="Payer's email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="The payment page is opened for this address."
          />
          <Button
            variant="secondary"
            loading={busy === "gateway"}
            disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
            onClick={async () => {
              const reply = await act(
                "gateway",
                () =>
                  sendJson(`${base}/pay`, "POST", {
                    email: email.trim(),
                    ...(amount && !payProblem ? { amount: parseAmount(amount) } : {}),
                  }),
                "The online payment was started.",
              );
              const url = (reply?.data as { authorizationUrl?: string } | undefined)?.authorizationUrl;
              if (reply?.ok && url && /^https:\/\//.test(url)) window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            Start online payment
          </Button>
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        {inv.can.payInFull ? (
          <Button
            variant="ghost"
            loading={busy === "full"}
            onClick={() =>
              void act(
                "full",
                () => sendJson(base, "PATCH", { payInFull: !inv.payInFull }),
                inv.payInFull ? "Part payments are allowed again." : "This invoice has to be paid in full.",
              )
            }
          >
            {inv.payInFull ? "Allow part payments" : "Pay in full only"}
          </Button>
        ) : (
          <span />
        )}
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The fees

function ItemsView({ program }: { program: ProgramDetail }) {
  const programBase = useProgramBase();
  const base = `${programBase}/fees/items`;
  const [data, setData] = useState<{ items: FeeItem[]; canManage: boolean } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState<FeeItem | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(base, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The fees couldn't be loaded."));
      setFailed(null);
      setData(reply.data as unknown as NonNullable<typeof data>);
    });
    return () => controller.abort();
  }, [base, version]);

  const names = {
    campuses: new Map(program.campuses.map((b) => [b.id, b.name])),
    groups: new Map(program.groups.map((g) => [g.id, g.path])),
  };
  async function setStatus(item: FeeItem, status: "ACTIVE" | "ARCHIVED") {
    const reply = await sendJson(`${base}/${encodeURIComponent(item.id)}`, "PATCH", { status });
    setNotice(
      reply.ok
        ? {
            variant: "success",
            text: status === "ARCHIVED" ? `${item.name} is archived: it is not billed any more.` : `${item.name} is active again.`,
          }
        : { variant: "error", text: say(reply, "That didn't work.") },
    );
    if (reply.ok) setVersion((n) => n + 1);
  }

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!data) return <p className="text-sm text-fg-muted">Loading…</p>;
  return (
    <div className="space-y-3">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {data.canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>New fee</Button>
        </div>
      )}
      {data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-center text-sm text-fg-muted">
          No fee has been made yet.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Fees">
          {data.items.map((item) => (
            <li key={item.id} className="space-y-1 rounded-xl border border-line px-3 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-fg">
                    {item.name} · {formatNaira(item.amount)}
                    {item.discountPercent ? ` (${item.discountPercent}% off)` : ""}
                  </p>
                  <p className="break-words text-xs text-fg-muted">
                    {FREQUENCY_TEXT[item.frequency]}
                    {item.dueDay ? `, due on day ${item.dueDay}` : ""} · billed to {BILLED_TO_TEXT[item.billedTo].toLowerCase()} · for{" "}
                    {audienceText(item.audience, names)}
                    {item.exemptIds.length > 0 ? ` · ${item.exemptIds.length} exempt` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${item.status === "ACTIVE" ? "border-ok-line bg-ok-bg text-ok-fg" : "border-line-strong bg-surface-2 text-fg-2"}`}
                >
                  {item.status === "ACTIVE" ? "Active" : "Archived"}
                </span>
              </div>
              {data.canManage && (
                <div className="flex flex-wrap gap-2">
                  {item.status === "ACTIVE" ? (
                    <>
                      <Button variant="ghost" aria-label={`Add ${item.name} to open invoices`} onClick={() => setAdding(item)}>
                        Add to open invoices
                      </Button>
                      <Button variant="ghost" aria-label={`Archive ${item.name}`} onClick={() => void setStatus(item, "ARCHIVED")}>
                        Archive
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" aria-label={`Make ${item.name} active again`} onClick={() => void setStatus(item, "ACTIVE")}>
                      Make active
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ItemDialog
        open={creating}
        program={program}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          setNotice({ variant: "success", text: "The fee was made." });
          setVersion((n) => n + 1);
        }}
      />
      <AddToOpenDialog
        item={adding}
        base={base}
        onClose={() => setAdding(null)}
        onDone={(text) => {
          setAdding(null);
          setNotice({ variant: "success", text });
        }}
      />
    </div>
  );
}

function ItemDialog({
  open,
  program,
  onClose,
  onSaved,
}: {
  open: boolean;
  program: ProgramDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New fee"
      description="A fee is charged to the people it is for, once, every month or every year, when you make the invoices."
    >
      {open && <ItemForm program={program} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function ItemForm({ program, onClose, onSaved }: { program: ProgramDetail; onClose: () => void; onSaved: () => void }) {
  const programBase = useProgramBase();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("ONCE");
  const [dueDay, setDueDay] = useState("");
  const [discount, setDiscount] = useState("");
  const [billedTo, setBilledTo] = useState("PARTICIPANT");
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const live = program.groups.filter((g) => !g.archived);
  const toggle = (set: Set<string>, value: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const num = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));
    const reply = await sendJson(`${programBase}/fees/items`, "POST", {
      name,
      amount: num(amount),
      frequency,
      dueDay: frequency === "ONCE" ? null : num(dueDay),
      discountPercent: num(discount),
      billedTo,
      audience: { ...(kinds.size > 0 ? { kinds: [...kinds] } : {}), ...(groupIds.size > 0 ? { groupIds: [...groupIds] } : {}) },
    });
    setPending(false);
    if (reply.ok) return onSaved();
    const errors: Record<string, string> = {};
    for (const field of ["name", "amount", "dueDay", "discountPercent"]) {
      const message = problemFor(reply, field);
      if (message) errors[field] = message;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setError(say(reply, "That didn't save."));
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert variant="error">{error}</Alert>}
      <TextField label="Name" value={name} maxLength={80} error={fieldErrors.name} onChange={(e) => setName(e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Amount (₦)"
          inputMode="decimal"
          value={amount}
          error={fieldErrors.amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <SelectField
          label="How often"
          value={frequency}
          options={Object.entries(FREQUENCY_TEXT).map(([value, label]) => ({ value, label }))}
          onChange={(e) => setFrequency(e.target.value)}
        />
        {frequency !== "ONCE" && (
          <TextField
            label="Due on day"
            inputMode="numeric"
            value={dueDay}
            hint="1 to 28. Optional."
            error={fieldErrors.dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        )}
        <TextField
          label="Discount (%)"
          inputMode="decimal"
          value={discount}
          hint="Optional."
          error={fieldErrors.discountPercent}
          onChange={(e) => setDiscount(e.target.value)}
        />
        <SelectField
          label="Billed to"
          value={billedTo}
          options={Object.entries(BILLED_TO_TEXT).map(([value, label]) => ({ value, label }))}
          onChange={(e) => setBilledTo(e.target.value)}
        />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Which kinds of people?</legend>
        <p className="text-xs text-fg-muted">Tick none for everyone.</p>
        <div className="flex flex-wrap gap-x-4">
          {Object.entries(KIND_TEXT).map(([value, label]) => (
            <CheckboxField
              key={value}
              label={label}
              checked={kinds.has(value)}
              onChange={(e) => setKinds((c) => toggle(c, value, e.target.checked))}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Which groups?</legend>
        <p className="text-xs text-fg-muted">Tick none for every group. A group includes the groups inside it.</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto" aria-label="Groups">
          {live.map((g) => (
            <li key={g.id}>
              <CheckboxField
                label={g.path}
                checked={groupIds.has(g.id)}
                onChange={(e) => setGroupIds((c) => toggle(c, g.id, e.target.checked))}
              />
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Make fee
        </Button>
      </div>
    </form>
  );
}

function AddToOpenDialog({
  item,
  base,
  onClose,
  onDone,
}: {
  item: FeeItem | null;
  base: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={item ? `Add ${item.name} to open invoices` : "Add to open invoices"}
      description="Only invoices of that period with no payment and no discount are changed; a paid or part-paid invoice never is."
    >
      {item && <AddToOpenBody key={item.id} item={item} base={base} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function AddToOpenBody({
  item,
  base,
  onClose,
  onDone,
}: {
  item: FeeItem;
  base: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [period, setPeriod] = useState(defaultPeriod(item.frequency, todayDay()));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <TextField
        label="Period"
        value={period}
        hint="once, a year such as 2026, or a month such as 2026-11"
        onChange={(e) => setPeriod(e.target.value.trim())}
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" data-initial-focus onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={pending}
          onClick={async () => {
            setPending(true);
            const reply = await sendJson(`${base}/${encodeURIComponent(item.id)}/add-to-open`, "POST", { periodKey: period });
            setPending(false);
            if (!reply.ok) return setError(say(reply, "That didn't work."));
            const result = reply.data as unknown as { updated: number; skipped: number };
            onDone(
              `${item.name} was added to ${result.updated} ${result.updated === 1 ? "invoice" : "invoices"}; ${result.skipped} left as they were.`,
            );
          }}
        >
          Add to open invoices
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Making the invoices of a period

function GenerateView({ program }: { program: ProgramDetail }) {
  const programBase = useProgramBase();
  const base = `${programBase}/fees/generate`;
  const [frequency, setFrequency] = useState<"ONCE" | "MONTHLY" | "YEARLY">("MONTHLY");
  const [period, setPeriod] = useState(defaultPeriod("MONTHLY", todayDay()));
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [busy, setBusy] = useState<"preview" | "make" | null>(null);
  const [outcome, setOutcome] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  async function preview() {
    setBusy("preview");
    setOutcome(null);
    const reply = await sendJson(base, "POST", { periodKey: period });
    setBusy(null);
    if (reply.ok) setPlan(reply.data as unknown as PlanView);
    else {
      setPlan(null);
      setOutcome({ variant: "error", text: problemFor(reply, "periodKey") ?? say(reply, "That didn't work.") });
    }
  }
  async function make() {
    setBusy("make");
    const reply = await sendJson(base, "POST", { periodKey: period, confirm: true });
    setBusy(null);
    if (reply.ok) {
      const r = reply.data as unknown as { created: number; more: boolean; totalAmount: number };
      setOutcome({
        variant: "success",
        text: `${r.created} ${r.created === 1 ? "invoice was" : "invoices were"} made, ${formatNaira(r.totalAmount)} in all.${r.more ? " There are more: make them again." : ""}`,
      });
      setPlan(null);
    } else setOutcome({ variant: "error", text: say(reply, "That didn't work.") });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Invoices are made for the people each active fee is for, for one period. Making them again for the same period makes nothing new.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Which fees"
          value={frequency}
          options={[
            { value: "MONTHLY", label: "Monthly fees" },
            { value: "YEARLY", label: "Yearly fees" },
            { value: "ONCE", label: "One-off fees" },
          ]}
          onChange={(e) => {
            const f = e.target.value as typeof frequency;
            setFrequency(f);
            setPeriod(defaultPeriod(f, todayDay()));
            setPlan(null);
          }}
        />
        <TextField
          label="Period"
          value={period}
          hint={periodText(period)}
          onChange={(e) => {
            setPeriod(e.target.value.trim());
            setPlan(null);
          }}
        />
      </div>
      <Button variant="secondary" loading={busy === "preview"} onClick={() => void preview()}>
        See who would get an invoice
      </Button>
      {outcome && <Alert variant={outcome.variant}>{outcome.text}</Alert>}
      {plan && (
        <div className="space-y-3">
          <p className="text-sm text-fg-2" aria-live="polite">
            {plan.count} {plan.count === 1 ? "invoice" : "invoices"} would be made, {formatNaira(plan.totalAmount)} in all, from{" "}
            {plan.items} {plan.items === 1 ? "fee" : "fees"}. {plan.skipped.length} skipped. {plan.noFee} with no fee.
            {plan.count > plan.limit ? ` Only ${plan.limit} are made at a time.` : ""}
          </p>
          {plan.skipped.length > 0 && (
            <ul className="space-y-1" aria-label="Skipped">
              {plan.skipped.slice(0, 50).map((s) => (
                <li key={s.participantId} className="break-words text-xs text-fg-muted">
                  {s.name}: {s.reason}
                </li>
              ))}
            </ul>
          )}
          <Button loading={busy === "make"} disabled={plan.count === 0} onClick={() => void make()}>
            {`Make ${Math.min(plan.count, plan.limit)} ${Math.min(plan.count, plan.limit) === 1 ? "invoice" : "invoices"}`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The report

type Totals = { billed: number; collected: number; outstanding: number; rate: number | null; invoices: number };
function ReportView({ program }: { program: ProgramDetail }) {
  const programBase = useProgramBase();
  const [data, setData] = useState<{
    totals: Totals;
    byCampus: (Totals & { name: string; campusId: string })[];
    byGroup: (Totals & { path: string; groupId: string })[];
    owing: { participantId: string; name: string; groupPath: string; outstanding: number; invoices: number }[];
    truncated: boolean;
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void getJson(`${programBase}/fees/report`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The report couldn't be loaded."));
      setData(reply.data as unknown as NonNullable<typeof data>);
    });
    return () => controller.abort();
  }, [program.id]);
  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (!data) return <p className="text-sm text-fg-muted">Loading…</p>;
  const line = (t: Totals) =>
    `Billed ${formatNaira(t.billed)} · collected ${formatNaira(t.collected)} · owed ${formatNaira(t.outstanding)}${t.rate !== null ? ` · ${t.rate}% collected` : ""}`;
  return (
    <div className="space-y-4">
      {data.truncated && <Alert variant="info">Only the first invoices are counted. Narrow it by group.</Alert>}
      <p className="text-sm font-semibold text-fg" data-testid="fees-total">
        {line(data.totals)}
      </p>
      <section aria-label="By campus" className="space-y-1">
        <h3 className="text-sm font-semibold text-fg">By campus</h3>
        <ul className="space-y-1">
          {data.byCampus.map((b) => (
            <li key={b.campusId} className="break-words text-sm text-fg-2">
              {b.name}: {line(b)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="By group" className="space-y-1">
        <h3 className="text-sm font-semibold text-fg">By group</h3>
        <ul className="space-y-1">
          {data.byGroup.map((g) => (
            <li key={g.groupId} className="break-words text-sm text-fg-2">
              {g.path}: {line(g)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Who owes" className="space-y-1">
        <h3 className="text-sm font-semibold text-fg">Who owes</h3>
        {data.owing.length === 0 ? (
          <p className="text-sm text-fg-muted">No one owes anything.</p>
        ) : (
          <ul className="space-y-1">
            {data.owing.map((o) => (
              <li key={o.participantId} className="break-words text-sm text-fg-2">
                {o.name} ({o.groupPath}): {formatNaira(o.outstanding)}
                {o.invoices > 1 ? ` on ${o.invoices} invoices` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
