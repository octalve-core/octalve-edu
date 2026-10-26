"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import type { ApiItem, ItemVisibility } from "@/components/question-bank/model";
import { TagInput } from "@/components/question-bank/TagInput";

// The reviewer's decisions on a question. Presentation only: the server decides who may do what and says why not. Each dialog is mounted only while it is open, so what was
// typed into one never survives into the next question.

const actionUrl = (api: string, id: string, action: string) => `${api}/items/${encodeURIComponent(id)}/${action}`;

/// Reject or retire: both need a reason of 1 to 500 characters.
export function ReasonDialog({
  item,
  action,
  onClose,
  onDone,
}: {
  item: ApiItem | null;
  action: "reject" | "retire";
  onClose: () => void;
  onDone: (reply: Reply, action: "reject" | "retire") => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={action === "reject" ? "Send this question back?" : "Retire this question?"}
      description={
        action === "reject"
          ? "The writer is shown your reason, and can correct the question and send it again."
          : "A retired question can no longer be used. It stays here for the record, with its pictures."
      }
    >
      {item && <ReasonForm item={item} action={action} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function ReasonForm({ item, action, onClose, onDone }: { item: ApiItem; action: "reject" | "retire"; onClose: () => void; onDone: (reply: Reply, action: "reject" | "retire") => void }) {
  const api = useBankApi();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (reason.trim() === "") return setProblem("Give a reason.");
    setProblem(null);
    setPending(true);
    const reply = await sendJson(actionUrl(api, item.id, action), "POST", { reason });
    setPending(false);
    if (!reply.ok && reply.status === 400) return setProblem(say(reply, "That reason cannot be used."));
    onDone(reply, action);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextAreaField
        label="Reason"
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={600}
        hint="At most 500 characters."
        error={problem}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant={action === "retire" ? "danger" : "primary"} loading={pending}>
          {pending ? "Saving…" : action === "reject" ? "Send back" : "Retire"}
        </Button>
      </div>
    </form>
  );
}

/// Approve: the subject and classes (the writer's, to confirm or change), and, only for a person who may, who may see the question and whether it is general.
export function ApproveDialog({ item, onClose, onDone }: { item: ApiItem | null; onClose: () => void; onDone: (reply: Reply) => void }) {
  return (
    <Dialog open={item !== null} onClose={onClose} title="Approve this question" wide>
      {item && <ApproveForm item={item} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

const localInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

function ApproveForm({ item, onClose, onDone }: { item: ApiItem; onClose: () => void; onDone: (reply: Reply) => void }) {
  const api = useBankApi();
  const [subject, setSubject] = useState(item.subject ?? "");
  const [classes, setClasses] = useState<string[]>(item.classTags);
  const [visibility, setVisibility] = useState<ItemVisibility>("TEACHERS_ONLY");
  const [from, setFrom] = useState(localInput(null));
  const [general, setGeneral] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found: string[] = [];
    if (subject.trim() === "") found.push("Choose the subject of the question.");
    if (classes.length === 0) found.push("Choose at least one class.");
    if (visibility === "TEACHERS_ONLY_UNTIL" && from === "") found.push("Choose the date and time pupils may see it from.");
    if (found.length > 0) return setProblems(found);
    setProblems([]);
    setPending(true);
    const reply = await sendJson(actionUrl(api, item.id, "approve"), "POST", {
      subject,
      classTags: classes,
      ...(item.can.setVisibility ? { visibility, ...(visibility === "TEACHERS_ONLY_UNTIL" ? { visibleFrom: new Date(from).toISOString() } : {}) } : {}),
      ...(item.can.makeGeneral && general ? { general: true } : {}),
    });
    setPending(false);
    if (!reply.ok && reply.status === 400) return setProblems([say(reply, "That cannot be approved yet.")]);
    onDone(reply);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {problems.length > 0 && (
        <Alert variant="error">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} hint="For example Mathematics." />
      <TagInput label="Classes" tags={classes} onChange={setClasses} hint="For example JSS 1. Type one and press Enter." />
      {item.can.setVisibility ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-fg">Who may see it</legend>
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="radio" name="visibility" className="mt-1" checked={visibility === "TEACHERS_ONLY"} onChange={() => setVisibility("TEACHERS_ONLY")} />
            Teachers only
          </label>
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="radio" name="visibility" className="mt-1" checked={visibility === "PRACTICE"} onChange={() => setVisibility("PRACTICE")} />
            Pupils can practise with it now
          </label>
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="radio" name="visibility" className="mt-1" checked={visibility === "TEACHERS_ONLY_UNTIL"} onChange={() => setVisibility("TEACHERS_ONLY_UNTIL")} />
            Teachers only until a date
          </label>
          {visibility === "TEACHERS_ONLY_UNTIL" && (
            <TextField label="Pupils may see it from" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} hint="It cannot be hidden again once it is visible." />
          )}
        </fieldset>
      ) : (
        <p className="text-sm text-fg-2">Approved questions are visible to teachers only. An exam approver decides when pupils may see them.</p>
      )}
      {item.can.makeGeneral && (
        <CheckboxField label="Make it general: the whole school can use it" checked={general} onChange={(e) => setGeneral(e.target.checked)} />
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {pending ? "Approving…" : "Approve"}
        </Button>
      </div>
    </form>
  );
}
