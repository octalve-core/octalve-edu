"use client";

import { useState } from "react";
import { failureText, useApi } from "@/components/academics/useApi";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { StepUpModal, type StepUpChange } from "@/components/settings/StepUpModal";

// Payment rules (task 0029): may an invoice be paid in parts, and what is the smallest part? The school sets a rule; a campus may only make it stricter. Only the school's administrator
// changes a rule (fee configuration, ADR 0016); a campus administrator and a bursar read it. The school's own rule asks for the fresh proof, a campus's tightening does not.
// Presentation only: the API checks everything again and says why not.

type Policy = { allowed: boolean; minimum: { kind: "NONE" } | { kind: "AMOUNT" | "PERCENT"; value: number } };
type CampusRule = { id: string; name: string; stored: Policy | null; text: string; canEdit: boolean };
type View = { school: { stored: Policy | null; text: string }; campuses: CampusRule[]; canEditSchool: boolean };
type StepUp = { type: "totp" | "recovery" | "password"; value: string };

const KIND_OPTIONS = [
  { value: "NONE", label: "Any amount" },
  { value: "AMOUNT", label: "At least an amount (₦)" },
  { value: "PERCENT", label: "At least a share of the invoice (%)" },
];
const ALLOWED_OPTIONS = [
  { value: "yes", label: "Part payments are allowed" },
  { value: "no", label: "Invoices are paid in full" },
];

const describe = (policy: Policy | null): string => {
  if (!policy) return "No rule of its own";
  if (!policy.allowed) return "Paid in full";
  return policy.minimum.kind === "NONE"
    ? "Part payments of any amount"
    : policy.minimum.kind === "AMOUNT"
      ? `Part payments of at least ₦${policy.minimum.value}`
      : `Part payments of at least ${policy.minimum.value}%`;
};

export function PaymentRulesPanel({ schoolCode, hasMfa, canManage }: { schoolCode: string; hasMfa: boolean; canManage: boolean }) {
  const base = `/api/v1/schools/${schoolCode}/settings/part-payment`;
  const { reply, error, loading, reload } = useApi(base);
  const [done, setDone] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ change: StepUpChange; send: (stepUp: StepUp) => Promise<Reply>; done: string } | null>(null);

  if (loading && !reply) return <p role="status">Loading the payment rules…</p>;
  if (error || !reply) return <Alert variant="error">{error ?? "The payment rules could not be loaded."}</Alert>;
  const view = reply.data as unknown as View;

  const save = async (campusId: string | null, policy: Policy | null, label: string): Promise<string | null> => {
    setDone(null);
    setSaveError(null);
    if (campusId === null) {
      // the school's own rule: the fresh proof first
      setPending({
        change: {
          field: "Payment rule (the school's)",
          fromValue: describe(view.school.stored),
          toValue: policy ? describe(policy) : "no rule of its own",
          isWeakeningSecurity: false,
        },
        send: (stepUp) => sendJson(base, "PATCH", { scope: "SCHOOL", policy, stepUp }),
        done: `${label} saved.`,
      });
      return null;
    }
    const answer = await sendJson(base, "PATCH", { scope: "CAMPUS", campusId, policy });
    if (!answer.ok) return failureText(answer.status, answer.message);
    setDone(`${label} saved.`);
    await reload(true);
    return null;
  };

  const confirm = async (stepUp: StepUp) => {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    const answer = await pending.send(stepUp);
    setSaving(false);
    if (!answer.ok) return setSaveError(failureText(answer.status, answer.message));
    setPending(null);
    setDone(pending.done);
    await reload(true);
  };

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-fg-muted">
        Choose whether an invoice may be paid in parts and the smallest part. The payment that settles the whole balance is always allowed.
        A campus can only make the school&apos;s rule stricter, and the school&apos;s administrator can mark a single invoice &quot;pay in
        full&quot; on its page.
      </p>
      {done && <Alert variant="success">{done}</Alert>}

      <section aria-labelledby="rule-school" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="rule-school" className="text-base font-semibold text-fg">
          The school&apos;s rule
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{view.school.text}</p>
        <RuleEditor
          key={`school-${JSON.stringify(view.school.stored)}`}
          idPrefix="school"
          name="the school"
          stored={view.school.stored}
          canEdit={view.canEditSchool && canManage}
          onSave={(policy) => save(null, policy, "The school's rule")}
        />
      </section>

      {view.campuses.length > 0 && (
        <section aria-labelledby="rule-campuses" className="space-y-4">
          <h2 id="rule-campuses" className="text-base font-semibold text-fg">
            Campuses
          </h2>
          <ul className="space-y-4">
            {view.campuses.map((campus) => (
              <li key={`${campus.id}-${JSON.stringify(campus.stored)}`} className="rounded-xl border border-line bg-surface p-5">
                <h3 className="text-sm font-semibold text-fg">{campus.name}</h3>
                <p className="mt-1 text-sm text-fg-muted">{campus.text}</p>
                <RuleEditor
                  idPrefix={`campus-${campus.id}`}
                  name={campus.name}
                  stored={campus.stored}
                  canEdit={campus.canEdit && canManage}
                  onSave={(policy) => save(campus.id, policy, `${campus.name}'s rule`)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <StepUpModal
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        hasMfa={hasMfa}
        deltas={pending ? [pending.change] : []}
        saving={saving}
        error={saveError}
      />
    </div>
  );
}

/// One rule's form: allowed or not, the kind of smallest part and its value, Save and Remove. Read-only (the values and no controls) when the person may not change it.
function RuleEditor({
  idPrefix,
  name,
  stored,
  canEdit,
  onSave,
}: {
  idPrefix: string;
  name: string;
  stored: Policy | null;
  canEdit: boolean;
  onSave: (policy: Policy | null) => Promise<string | null>;
}) {
  const [allowed, setAllowed] = useState(stored ? (stored.allowed ? "yes" : "no") : "yes");
  const [kind, setKind] = useState<"NONE" | "AMOUNT" | "PERCENT">(stored?.minimum.kind ?? "NONE");
  const [value, setValue] = useState(stored && stored.minimum.kind !== "NONE" ? String(stored.minimum.value) : "");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canEdit)
    return <p className="mt-3 text-xs text-fg-muted">{describe(stored)}. Only the school&apos;s administrator changes a rule.</p>;

  const submit = async (remove: boolean) => {
    setProblem(null);
    let policy: Policy | null = null;
    if (!remove) {
      if (kind === "NONE") policy = { allowed: allowed === "yes", minimum: { kind: "NONE" } };
      else {
        const number = Number(value);
        if (!value.trim() || !Number.isFinite(number) || number <= 0) return setProblem("Type the smallest part as a number above zero.");
        if (kind === "PERCENT" && number > 100) return setProblem("A percentage is from 1 to 100.");
        policy = { allowed: allowed === "yes", minimum: { kind, value: number } };
      }
    }
    setBusy(true);
    const failure = await onSave(policy);
    setBusy(false);
    if (failure) setProblem(failure);
  };

  return (
    <form
      className="mt-4 grid gap-4 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
      aria-label={`Payment rule of ${name}`}
    >
      <SelectField
        label="Parts"
        id={`${idPrefix}-allowed`}
        options={ALLOWED_OPTIONS}
        value={allowed}
        onChange={(e) => setAllowed(e.target.value)}
      />
      <SelectField
        label="Smallest part"
        id={`${idPrefix}-kind`}
        options={KIND_OPTIONS}
        value={kind}
        disabled={allowed === "no"}
        onChange={(e) => setKind(e.target.value as typeof kind)}
      />
      {kind !== "NONE" && allowed === "yes" && (
        <TextField
          label={kind === "AMOUNT" ? "Amount (₦)" : "Share (%)"}
          id={`${idPrefix}-value`}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {problem && (
        <div className="sm:col-span-3">
          <Alert variant="error">{problem}</Alert>
        </div>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <Button type="submit" disabled={busy}>
          Save the rule
        </Button>
        {stored && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void submit(true)}>
            Remove this rule
          </Button>
        )}
      </div>
    </form>
  );
}
