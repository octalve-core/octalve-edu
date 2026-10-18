"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { useApi } from "@/components/academics/useApi";
import {
  SUPPORT_AREAS,
  SUPPORT_AREA_LABELS,
  SUPPORT_GRANT_DEFAULT_HOURS,
  SUPPORT_GRANT_MAX_HOURS,
  type SupportArea,
} from "@/lib/support/areas";
import type { SupportActivityView, SupportGrantView } from "@/lib/support/grants";

// The school's side of audited support access (task 0011 slice D, ADR 0017): allow a platform administrator to LOOK at chosen parts of the school for a few
// hours, end it early, and see exactly what they looked at. Read-only and time-limited are enforced by the server; this screen only asks and shows.

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const STATUS: Record<SupportGrantView["status"], string> = { LIVE: "Open", EXPIRED: "Ended", REVOKED: "Withdrawn" };
const ACTIVITY: Record<SupportActivityView["action"], string> = {
  SUPPORT_OPENED: "Opened a support view",
  SUPPORT_ACCESS: "Read",
  SUPPORT_CLOSED: "Closed the support view",
};

function describe(reply: Reply, fallback: string): string {
  if (reply.status === 401) return SESSION_ENDED;
  if (reply.status === 429) return reply.message ?? RATE_LIMITED;
  if (reply.status === 0) return NETWORK_ERROR;
  return reply.message ?? fallback;
}

export function SupportAccessPanel({ schoolCode }: { schoolCode: string }) {
  const base = `/api/v1/schools/${schoolCode}/support-grants`;
  const grantsApi = useApi(base);
  const activityApi = useApi(`${base}/activity`);
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const grants = (grantsApi.reply?.data?.grants as SupportGrantView[] | undefined) ?? null;
  const activity = (activityApi.reply?.data?.activity as SupportActivityView[] | undefined) ?? null;

  async function revoke(grant: SupportGrantView) {
    if (revoking) return;
    setRevoking(grant.id);
    const reply = await sendJson(`${base}/${grant.id}/revoke`, "POST", {});
    setRevoking(null);
    setNotice(
      reply.ok
        ? { variant: "success", text: "Support access was withdrawn. Anyone looking is shut out on their next click." }
        : { variant: "error", text: describe(reply, "That didn't work. Please try again.") },
    );
    await Promise.all([grantsApi.reload(), activityApi.reload()]);
  }

  return (
    <div className="space-y-10">
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      </div>

      <section aria-labelledby="grants-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="grants-heading" className="text-lg font-semibold tracking-tight text-fg">
            Support access
          </h2>
          <Button
            onClick={() => {
              setCreateKey((k) => k + 1);
              setCreating(true);
            }}
          >
            Allow support access
          </Button>
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          If you ask the platform team for help, you can let them look at the parts of the school you choose. They can only read, never
          change anything, never see fees or payments, and everything they open is listed below.
        </p>
        {grantsApi.error ? (
          <div className="mt-3">
            <Alert variant="error">{grantsApi.error}</Alert>
          </div>
        ) : grants === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : grants.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            No one has been given support access.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {grants.map((grant) => (
              <li key={grant.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{grant.areas.map((a) => SUPPORT_AREA_LABELS[a]).join(", ")}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    {grant.reason} · {STATUS[grant.status]}
                    {grant.status === "LIVE" ? ` until ${when(grant.expiresAt)}` : ""}
                    {grant.granteeEmail
                      ? ` · for ${grant.granteeName ? `${grant.granteeName} (${grant.granteeEmail})` : grant.granteeEmail}`
                      : " · for any platform administrator"}
                    {grant.createdByName ? ` · by ${grant.createdByName}` : ""}
                  </p>
                </div>
                {grant.status === "LIVE" && (
                  <Button
                    variant="secondary"
                    onClick={() => revoke(grant)}
                    loading={revoking === grant.id}
                    aria-label={`Withdraw the support access for ${grant.areas.map((a) => SUPPORT_AREA_LABELS[a]).join(", ")}`}
                  >
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-lg font-semibold tracking-tight text-fg">
          What support looked at
        </h2>
        {activityApi.error ? (
          <div className="mt-3">
            <Alert variant="error">{activityApi.error}</Alert>
          </div>
        ) : activity === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        ) : activity.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">Nobody from the platform has looked at your school.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {activity.map((entry) => (
              <li key={entry.id} className="p-4 text-sm">
                <p className="font-medium text-fg">
                  {entry.who ?? "A platform administrator"} · {ACTIVITY[entry.action]}
                </p>
                <p className="mt-0.5 wrap-break-word text-fg-muted">
                  {when(entry.at)}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GrantDialog
        key={createKey}
        base={base}
        open={creating}
        onClose={() => setCreating(false)}
        onDone={async (hours) => {
          setCreating(false);
          setNotice({ variant: "success", text: `Support access is open for ${hours} ${hours === 1 ? "hour" : "hours"}.` });
          await Promise.all([grantsApi.reload(), activityApi.reload()]);
        }}
      />
    </div>
  );
}

function GrantDialog({
  base,
  open,
  onClose,
  onDone,
}: {
  base: string;
  open: boolean;
  onClose: () => void;
  onDone: (hours: number) => void;
}) {
  const [areas, setAreas] = useState<SupportArea[]>([]);
  const [hours, setHours] = useState(String(SUPPORT_GRANT_DEFAULT_HOURS));
  const [reason, setReason] = useState("");
  const [granteeEmail, setGranteeEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setErrors({});
    setPasswordError(null);
    setFormError(null);
    const hoursNumber = Number(hours);
    if (!Number.isInteger(hoursNumber) || hoursNumber < 1 || hoursNumber > SUPPORT_GRANT_MAX_HOURS) {
      setErrors({ hours: `Whole hours, 1 to ${SUPPORT_GRANT_MAX_HOURS}.` });
      return;
    }
    setPending(true);
    const reply = await sendJson(base, "POST", {
      areas,
      hours: hoursNumber,
      reason: reason.trim(),
      granteeEmail: granteeEmail.trim() ? granteeEmail.trim() : undefined,
      stepUp: { type: "password", value: password },
    });
    setPending(false);
    if (reply.ok) return onDone(hoursNumber);
    const next: Record<string, string> = {};
    for (const field of ["areas", "hours", "reason", "granteeEmail"]) {
      const problem = problemFor(reply, field);
      if (problem) next[field] = problem;
    }
    if (reply.status === 400 && reply.code === "INVALID_GRANTEE") {
      next.granteeEmail = reply.message ?? "That email does not belong to a platform administrator.";
    }
    setErrors(next);
    if (reply.status === 403 && reply.code === "WRONG_PASSWORD") setPasswordError("That password isn't right.");
    else if (Object.keys(next).length === 0) setFormError(describe(reply, "That didn't work. Please try again."));
  }

  return (
    <Dialog open={open} onClose={onClose} title="Allow support access">
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">What they may look at</legend>
          {SUPPORT_AREAS.map((area) => (
            <CheckboxField
              key={area}
              label={SUPPORT_AREA_LABELS[area]}
              checked={areas.includes(area)}
              onChange={(e) => setAreas((all) => (e.target.checked ? [...all, area] : all.filter((a) => a !== area)))}
              disabled={pending}
            />
          ))}
          {errors.areas && (
            <p role="alert" className="text-sm text-danger-fg">
              {errors.areas}
            </p>
          )}
          <p className="text-sm text-fg-muted">Fees and payments can never be shared.</p>
        </fieldset>
        <TextField
          label="For how many hours"
          name="hours"
          type="text"
          inputMode="numeric"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          error={errors.hours}
          hint={`Up to ${SUPPORT_GRANT_MAX_HOURS}. Each visit also ends after one hour.`}
          disabled={pending}
        />
        <TextField
          label="Why"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          maxLength={300}
          hint="For example: the ticket you raised. This is kept with the record."
          disabled={pending}
        />
        <TextField
          label="Specific platform administrator email (optional)"
          name="granteeEmail"
          type="email"
          value={granteeEmail}
          onChange={(e) => setGranteeEmail(e.target.value)}
          error={errors.granteeEmail}
          hint="Leave blank to allow any platform administrator to assist."
          disabled={pending}
        />
        <PasswordField
          label="Your password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
          autoComplete="current-password"
          disabled={pending}
        />
        {formError && <Alert variant="error">{formError}</Alert>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? "Working…" : "Allow access"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
