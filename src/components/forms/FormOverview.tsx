"use client";

import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { KIND_PATH, useFormsApi } from "@/components/forms/FormsApi";
import type { Notice } from "@/components/forms/model";
import { FormEditDialog, NOT_YOURS } from "@/components/forms/FormEditDialog";
import { FormPrintDialog } from "@/components/forms/FormPrintDialog";
import { PublicLinkBox } from "@/components/forms/PublicLinkBox";
import type { ClassGroup } from "@/components/forms/useClassGroups";
import {
  KIND_NOUN,
  STATUS_LABEL,
  classGroupIdsOf,
  plural,
  windowText,
  type FormDetail,
  type FormKindKey,
  type ListedForm,
} from "@/components/forms/model";

// A form's details and what a teacher does to it from here: edit the details, publish a draft, close a published form (after a confirmation), print it. Presentation only: a button
// that is shown is not a promise, the API decides who may, and a refusal is said in a sentence.

const upper = (word: string) => `${word[0]!.toUpperCase()}${word.slice(1)}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

export function FormOverview({
  kind,
  detail,
  summary,
  classGroups,
  onChanged,
}: {
  kind: FormKindKey;
  detail: FormDetail;
  summary: ListedForm | null;
  classGroups: ClassGroup[];
  onChanged: () => void;
}) {
  const noun = KIND_NOUN[kind];
  const { api } = useFormsApi();
  const path = `${api}/${KIND_PATH[kind]}/${encodeURIComponent(detail.id)}`;
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const classNames = (summary ? classGroupIdsOf(summary) : [])
    .map((id) => classGroups.find((g) => g.id === id)?.name)
    .filter(Boolean) as string[];
  const isPublic = summary?.audience?.kind === "PUBLIC";
  const roles = Array.isArray(summary?.audience?.roles) ? (summary!.audience!.roles as string[]) : [];

  async function change(request: Promise<Awaited<ReturnType<typeof sendJson>>>, done: string, fallback: string) {
    setBusy(true);
    const reply = await request;
    setBusy(false);
    setClosing(false);
    if (reply.ok) {
      setNotice({ variant: "success", text: done });
      onChanged();
    } else {
      setNotice({ variant: "error", text: reply.status === 404 || reply.status === 403 ? NOT_YOURS : say(reply, fallback) });
    }
  }

  return (
    <div className="space-y-5">
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      <div className="flex flex-wrap gap-2">
        {/* paper work has no route to change its details here: it is made, handed in against and closed */}
        {kind !== "PAPER_WORK" && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit details
          </Button>
        )}
        {detail.status === "DRAFT" && (
          <Button
            loading={busy}
            onClick={() =>
              change(sendJson(path, "PATCH", { status: "PUBLISHED" }), `${upper(noun)} published.`, "It couldn't be published.")
            }
          >
            Publish
          </Button>
        )}
        {detail.status === "PUBLISHED" && (
          <Button variant="secondary" disabled={busy} onClick={() => setClosing(true)}>
            Close
          </Button>
        )}
        <Button variant="secondary" onClick={() => setPrinting(true)}>
          Print
        </Button>
      </div>

      {kind === "QUESTIONNAIRE" && isPublic && (
        <PublicLinkBox
          shareToken={summary?.shareToken}
          published={detail.status === "PUBLISHED"}
          onCopied={() => setNotice({ variant: "success", text: "Link copied." })}
        />
      )}

      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
        <Row label="Status">{STATUS_LABEL[detail.status]}</Row>
        {detail.instructions && <Row label="Instructions">{<span className="whitespace-pre-wrap">{detail.instructions}</span>}</Row>}
        <Row label="When">{windowText(detail.opensAt, detail.closesAt)}</Row>
        {kind !== "QUESTIONNAIRE" && (
          <Row label="Time limit">{detail.maxDurationMinutes ? plural(detail.maxDurationMinutes, "minute") : "No limit"}</Row>
        )}
        {kind === "QUESTIONNAIRE" ? (
          summary && (
            <>
              <Row label="Who answers">
                {isPublic
                  ? "Anyone with the link"
                  : roles.length > 0
                    ? `Members: ${roles.map((r) => r.toLowerCase().replace(/_/g, " ")).join(", ")}`
                    : "Everyone"}
              </Row>
              <Row label="Anonymous">
                {summary.isAnonymous ? "Yes: nobody can see who gave which answer" : "No: you can see who answered"}
              </Row>
            </>
          )
        ) : (
          <Row label="Classes">{classNames.length > 0 ? classNames.join(", ") : "Every class"}</Row>
        )}
        {kind !== "PAPER_WORK" && <Row label="Questions">{detail.questions.length}</Row>}
        {kind !== "PAPER_WORK" && <Row label="Answers so far">{detail.responseCount}</Row>}
        {detail.createdBy && <Row label="Written by">{detail.createdBy.name ?? detail.createdBy.email}</Row>}
      </dl>

      <FormEditDialog
        open={editing}
        onClose={() => setEditing(false)}
        kind={kind}
        detail={detail}
        summary={summary}
        classGroups={classGroups}
        onSaved={(text) => {
          setNotice({ variant: "success", text });
          onChanged();
        }}
      />
      <FormPrintDialog
        open={printing}
        onClose={() => setPrinting(false)}
        kind={kind}
        formId={detail.id}
        mayHaveKey={detail.questions.some((q) => "correctAnswer" in q)}
      />
      <Dialog open={closing} onClose={() => setClosing(false)} title={`Close this ${noun}?`} description={detail.title}>
        <p className="text-sm text-fg-2">
          {kind === "PAPER_WORK" ? "It will be closed for everyone." : "Nobody will be able to answer it any more."}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setClosing(false)}>
            Keep it open
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => change(sendJson(`${path}/close`, "POST", {}), `${upper(noun)} closed.`, "It couldn't be closed.")}
          >
            Close it
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
