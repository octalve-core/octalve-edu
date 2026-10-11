"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PasswordField } from "@/components/ui/PasswordField";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { NETWORK_ERROR, RATE_LIMITED, SESSION_ENDED, problemFor, sendJson, type Reply } from "@/components/auth/postJson";
import { useApi } from "@/components/academics/useApi";

// The platform page (plan C5, ADR 0016): the schools of the installation, seen as identity data only - code, name, type, created, whether suspended -
// and the four things a platform administrator does: create a school (with its first administrator's invitation), suspend, reinstate, change the type.
// Every change asks for the password again. The page reads no school's data, and the API behind it enforces who may do what.

type School = { id: string; code: string; name: string; schoolType: SchoolType; createdAt: string; suspendedAt: string | null };
type AuditEntry = {
  id: string;
  actorUserId: string;
  action: string;
  targetTenantId: string | null;
  reason: string | null;
  createdAt: string;
};
type SchoolType = "K12" | "HIGHER_ED" | "VOCATIONAL";

const TYPE_LABELS: Record<SchoolType, string> = {
  K12: "Primary / secondary (K-12)",
  HIGHER_ED: "Higher education",
  VOCATIONAL: "Vocational",
};
const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as SchoolType[]).map((value) => ({ value, label: TYPE_LABELS[value] }));
const ACTION_LABELS: Record<string, string> = {
  SCHOOL_CREATED: "School created",
  SCHOOL_SUSPENDED: "School suspended",
  SCHOOL_REINSTATED: "School reinstated",
  SCHOOL_TYPE_CHANGED: "School type changed",
  PLATFORM_ADMIN_GRANTED: "Platform administrator added",
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Notice = { variant: "success" | "error"; text: string } | null;

function describe(reply: Reply, fallback: string): string {
  if (reply.status === 401) return SESSION_ENDED;
  if (reply.status === 429) return reply.message ?? RATE_LIMITED;
  if (reply.status === 0) return NETWORK_ERROR;
  return reply.message ?? fallback;
}

export function PlatformPanel() {
  const schoolsApi = useApi("/api/v1/platform/schools");
  const auditApi = useApi("/api/v1/platform/audit?limit=20");
  const [notice, setNotice] = useState<Notice>(null);
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [suspending, setSuspending] = useState<School | null>(null);
  const [reinstating, setReinstating] = useState<School | null>(null);
  const [typing, setTyping] = useState<School | null>(null);

  const schools = (schoolsApi.reply?.data?.schools as School[] | undefined) ?? null;
  const entries = (auditApi.reply?.data?.entries as AuditEntry[] | undefined) ?? null;
  const refresh = async () => {
    await Promise.all([schoolsApi.reload(), auditApi.reload()]);
  };
  const done = async (text: string, close: () => void) => {
    close();
    setNotice({ variant: "success", text });
    await refresh();
  };

  return (
    <div className="space-y-10">
      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      </div>

      <section aria-labelledby="schools-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="schools-heading" className="text-lg font-semibold tracking-tight text-fg">
            Schools
          </h2>
          <Button
            onClick={() => {
              setCreateKey((k) => k + 1);
              setCreating(true);
            }}
          >
            Create a school
          </Button>
        </div>
        {schoolsApi.error ? (
          <div className="mt-3">
            <Alert variant="error">{schoolsApi.error}</Alert>
          </div>
        ) : schools === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading schools…
          </p>
        ) : schools.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
            No schools yet. Create the first one.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {schools.map((school) => (
              <li key={school.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{school.name}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    <span className="font-mono text-xs">{school.code}</span> · {TYPE_LABELS[school.schoolType]} · created{" "}
                    {when(school.createdAt)}
                  </p>
                  <p className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${school.suspendedAt ? "bg-warn-bg text-warn-fg" : "bg-ok-bg text-ok-fg"}`}
                    >
                      {school.suspendedAt ? `Suspended ${when(school.suspendedAt)}` : "Active"}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setTyping(school)} aria-label={`Change the type of ${school.name}`}>
                    Change type
                  </Button>
                  {school.suspendedAt ? (
                    <Button variant="secondary" onClick={() => setReinstating(school)} aria-label={`Reinstate ${school.name}`}>
                      Reinstate
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setSuspending(school)} aria-label={`Suspend ${school.name}`}>
                      Suspend
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-semibold tracking-tight text-fg">
          History
        </h2>
        {auditApi.error ? (
          <div className="mt-3">
            <Alert variant="error">{auditApi.error}</Alert>
          </div>
        ) : entries === null ? (
          <p className="mt-3 text-sm text-fg-muted" aria-busy="true">
            Loading history…
          </p>
        ) : entries.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">Nothing has been done yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {entries.map((entry) => {
              const school = schools?.find((s) => s.id === entry.targetTenantId);
              return (
                <li key={entry.id} className="p-4 text-sm">
                  <p className="font-medium text-fg">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    {school ? ` — ${school.name}` : ""}
                  </p>
                  <p className="mt-0.5 text-fg-muted">
                    {when(entry.createdAt)}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CreateDialog
        key={createKey}
        open={creating}
        onClose={() => setCreating(false)}
        onDone={(school, email) => done(`${school.name} was created. An invitation was sent to ${email}.`, () => setCreating(false))}
      />
      <SuspendDialog
        school={suspending}
        onClose={() => setSuspending(null)}
        onDone={(school) => done(`${school.name} is suspended. Its members can no longer open it.`, () => setSuspending(null))}
      />
      <ReinstateDialog
        school={reinstating}
        onClose={() => setReinstating(null)}
        onDone={(school) => done(`${school.name} is open again.`, () => setReinstating(null))}
      />
      <TypeDialog
        school={typing}
        onClose={() => setTyping(null)}
        onDone={(school) => done(`${school.name} is now ${TYPE_LABELS[school.schoolType]}.`, () => setTyping(null))}
      />
    </div>
  );
}

function Actions({
  pending,
  label,
  onClose,
  destructive = false,
}: {
  pending: boolean;
  label: string;
  onClose: () => void;
  destructive?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onClose} disabled={pending} data-initial-focus={destructive ? "" : undefined}>
        Cancel
      </Button>
      <Button type="submit" loading={pending}>
        {pending ? "Working…" : label}
      </Button>
    </div>
  );
}

function CreateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (school: School, email: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [schoolType, setSchoolType] = useState<SchoolType>("K12");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setErrors({});
    setFormError(null);
    setPending(true);
    const reply = await sendJson("/api/v1/platform/schools", "POST", {
      code: code.trim(),
      name,
      schoolType,
      adminEmail: adminEmail.trim(),
      password,
    });
    setPending(false);
    if (reply.ok) return onDone(reply.data!.school as School, adminEmail.trim().toLowerCase());
    const next: Record<string, string> = {};
    for (const field of ["code", "name", "schoolType", "adminEmail", "password"]) {
      const problem = problemFor(reply, field);
      if (problem) next[field] = problem;
    }
    setErrors(next);
    if (Object.keys(next).length === 0) setFormError(describe(reply, "We couldn't create that school. Please try again."));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create a school"
      description="The first administrator gets an email invitation that works for 7 days."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField
          label="School name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={100}
          disabled={pending}
        />
        <TextField
          label="School code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toLowerCase())}
          error={errors.code}
          hint="Used in the school's web address: lowercase letters, numbers and hyphens."
          maxLength={40}
          autoCapitalize="none"
          disabled={pending}
        />
        <SelectField
          label="School type"
          name="schoolType"
          value={schoolType}
          onChange={(e) => setSchoolType(e.target.value as SchoolType)}
          options={TYPE_OPTIONS}
          error={errors.schoolType}
          disabled={pending}
        />
        <TextField
          label="First administrator's email"
          type="email"
          name="adminEmail"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          error={errors.adminEmail}
          autoComplete="off"
          inputMode="email"
          maxLength={254}
          disabled={pending}
        />
        <PasswordField
          label="Your password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="current-password"
          disabled={pending}
        />
        {formError && <Alert variant="error">{formError}</Alert>}
        <Actions pending={pending} label="Create school" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function useChange(path: string, method: "POST" | "PATCH") {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function send(body: Record<string, unknown>, fields: string[]): Promise<Reply | null> {
    if (pending) return null;
    setPasswordError(null);
    setFieldErrors({});
    setFormError(null);
    setPending(true);
    const reply = await sendJson(path, method, { ...body, password });
    setPending(false);
    if (reply.ok) return reply;
    const next: Record<string, string> = {};
    for (const field of fields) {
      const problem = problemFor(reply, field);
      if (problem) next[field] = problem;
    }
    const passwordProblem = problemFor(reply, "password");
    if (passwordProblem) setPasswordError(passwordProblem);
    setFieldErrors(next);
    if (!passwordProblem && Object.keys(next).length === 0) setFormError(describe(reply, "That didn't work. Please try again."));
    return null;
  }
  return { password, setPassword, passwordError, fieldErrors, formError, pending, send };
}

function SuspendDialog({ school, onClose, onDone }: { school: School | null; onClose: () => void; onDone: (school: School) => void }) {
  return (
    <Dialog open={school !== null} onClose={onClose} title={school ? `Suspend ${school.name}?` : "Suspend"}>
      {school && <SuspendBody key={school.id} school={school} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}
function SuspendBody({ school, onClose, onDone }: { school: School; onClose: () => void; onDone: (school: School) => void }) {
  const [reason, setReason] = useState("");
  const change = useChange(`/api/v1/platform/schools/${school.id}/suspension`, "POST");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reply = await change.send({ suspended: true, reason }, ["reason"]);
    if (reply) onDone(reply.data!.school as School);
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-fg-2">
        Everyone in {school.name} will be refused when they try to open it, and it will disappear from their list of schools. Nothing is
        deleted and nobody is removed: reinstating the school gives everything back.
      </p>
      <TextField
        label="Reason"
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={change.fieldErrors.reason}
        maxLength={500}
        hint="Kept in the platform's history."
        disabled={change.pending}
      />
      <PasswordField
        label="Your password"
        name="password"
        value={change.password}
        onChange={(e) => change.setPassword(e.target.value)}
        error={change.passwordError}
        autoComplete="current-password"
        disabled={change.pending}
      />
      {change.formError && <Alert variant="error">{change.formError}</Alert>}
      <Actions pending={change.pending} label="Suspend school" onClose={onClose} destructive />
    </form>
  );
}

function ReinstateDialog({ school, onClose, onDone }: { school: School | null; onClose: () => void; onDone: (school: School) => void }) {
  return (
    <Dialog open={school !== null} onClose={onClose} title={school ? `Reinstate ${school.name}?` : "Reinstate"}>
      {school && <ReinstateBody key={school.id} school={school} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}
function ReinstateBody({ school, onClose, onDone }: { school: School; onClose: () => void; onDone: (school: School) => void }) {
  const change = useChange(`/api/v1/platform/schools/${school.id}/suspension`, "POST");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reply = await change.send({ suspended: false }, []);
    if (reply) onDone(reply.data!.school as School);
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-fg-2">{school.name} opens again for everyone who belongs to it.</p>
      <PasswordField
        label="Your password"
        name="password"
        value={change.password}
        onChange={(e) => change.setPassword(e.target.value)}
        error={change.passwordError}
        autoComplete="current-password"
        disabled={change.pending}
      />
      {change.formError && <Alert variant="error">{change.formError}</Alert>}
      <Actions pending={change.pending} label="Reinstate school" onClose={onClose} />
    </form>
  );
}

function TypeDialog({ school, onClose, onDone }: { school: School | null; onClose: () => void; onDone: (school: School) => void }) {
  return (
    <Dialog open={school !== null} onClose={onClose} title={school ? `Change the type of ${school.name}` : "Change type"}>
      {school && <TypeBody key={school.id} school={school} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}
function TypeBody({ school, onClose, onDone }: { school: School; onClose: () => void; onDone: (school: School) => void }) {
  const [schoolType, setSchoolType] = useState<SchoolType>(school.schoolType);
  const change = useChange(`/api/v1/platform/schools/${school.id}`, "PATCH");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reply = await change.send({ schoolType }, ["schoolType"]);
    if (reply) onDone(reply.data!.school as School);
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-fg-2">
        The type decides whether the school runs terms, semesters or cohorts. It can only be changed before the school has set up any
        academic period.
      </p>
      <SelectField
        label="School type"
        name="schoolType"
        value={schoolType}
        onChange={(e) => setSchoolType(e.target.value as SchoolType)}
        options={TYPE_OPTIONS}
        error={change.fieldErrors.schoolType}
        disabled={change.pending}
      />
      <PasswordField
        label="Your password"
        name="password"
        value={change.password}
        onChange={(e) => change.setPassword(e.target.value)}
        error={change.passwordError}
        autoComplete="current-password"
        disabled={change.pending}
      />
      {change.formError && <Alert variant="error">{change.formError}</Alert>}
      <Actions pending={change.pending} label="Save type" onClose={onClose} />
    </form>
  );
}
