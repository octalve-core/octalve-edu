"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui/SelectField";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { ConfirmDialog, FormDialog, type Outcome } from "@/components/academics/parts";
import { useApi } from "@/components/academics/useApi";

// Linking a pupil's or a guardian's sign-in account to their record, and unlinking it (task 0065). The same two dialogs for both kinds, as the same three routes exist under people/students/[id] and
// people/guardians/[id]. The account is made on the Users page (an invitation with the role Student or Parent); here the school says whose it is.

export type AccountKind = "student" | "guardian";
const FOLDER: Record<AccountKind, string> = { student: "students", guardian: "guardians" };
const WHO: Record<AccountKind, { signsInAs: string; nobody: string }> = {
  student: { signsInAs: "a student", nobody: "Nobody is waiting to be linked. Invite them on the Users page as a student first." },
  guardian: { signsInAs: "a parent", nobody: "Nobody is waiting to be linked. Invite them on the Users page as a parent first." },
};

const path = (schoolCode: string, kind: AccountKind, id: string) => `/api/v1/schools/${schoolCode}/people/${FOLDER[kind]}/${id}`;

export function LinkAccountDialog({
  open,
  onClose,
  schoolCode,
  kind,
  recordId,
  recordName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  schoolCode: string;
  kind: AccountKind;
  recordId: string;
  recordName: string;
  onDone: (reply: Reply) => void;
}) {
  const choices = useApi(`${path(schoolCode, kind, recordId)}/linkable-accounts`);
  const accounts = (choices.reply?.data?.accounts as { userId: string; name: string | null; email: string | null }[] | undefined) ?? [];
  const [userId, setUserId] = useState("");

  async function submit(): Promise<Outcome> {
    if (!userId) return { errors: { userId: "Choose who this is." } };
    return sendJson(`${path(schoolCode, kind, recordId)}/link-account`, "POST", { userId });
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={`Link ${recordName} to an account`}
      description={`Choose a member of this school who already signs in as ${WHO[kind].signsInAs} and is not linked to anyone yet.`}
      submitLabel="Link account"
      pendingLabel="Linking…"
      fields={["userId"]}
      onSubmit={submit}
      onDone={onDone}
    >
      {(errors, pending) => (
        <SelectField
          label="Account"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          error={errors.userId}
          disabled={pending || accounts.length === 0}
          hint={!choices.loading && accounts.length === 0 ? WHO[kind].nobody : undefined}
          options={[
            { value: "", label: choices.loading ? "Loading…" : accounts.length === 0 ? "Nobody is waiting to be linked" : "Choose…" },
            ...accounts.map((account) => ({
              value: account.userId,
              label: `${account.name ?? "Unnamed"} · ${account.email ?? "no email"}`,
            })),
          ]}
        />
      )}
    </FormDialog>
  );
}

export function UnlinkAccountDialog({
  open,
  onClose,
  schoolCode,
  kind,
  recordId,
  recordName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  schoolCode: string;
  kind: AccountKind;
  recordId: string;
  recordName: string;
  onDone: (reply: Reply) => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Unlink ${recordName}'s account?`}
      confirmLabel="Unlink account"
      pendingLabel="Unlinking…"
      danger
      onConfirm={() => sendJson(`${path(schoolCode, kind, recordId)}/unlink-account`, "POST")}
      onDone={onDone}
    >
      <p>
        The record and the account both stay; they just stop being connected, so {kind === "student" ? "the pupil" : "the guardian"} will
        find nothing in the portal until they are linked again. The person can still sign in: manage that on the Users page.
      </p>
    </ConfirmDialog>
  );
}
