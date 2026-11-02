"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { KIND_PATH, useFormsApi } from "@/components/forms/FormsApi";
import { FormBuilderDialog } from "@/components/forms/FormBuilderDialog";
import { PublicLinkBox } from "@/components/forms/PublicLinkBox";
import { StatusBadge } from "@/components/forms/StatusBadge";
import { KIND_NOUN, classGroupIdsOf, plural, windowText, type FormKindKey, type ListedForm } from "@/components/forms/model";

// The forms of one kind in one branch, with the two things a teacher does to each one here: publish a draft and close a published one. Presentation only - the API decides who may.

type Notice = { variant: "success" | "error"; text: string } | null;
type ClassGroup = { id: string; name: string };

const upper = (word: string) => `${word[0]!.toUpperCase()}${word.slice(1)}`;

export function FormsList({ kind, classGroups }: { kind: FormKindKey; classGroups: ClassGroup[] }) {
  const { api, schoolCode } = useFormsApi();
  const noun = KIND_NOUN[kind];
  const [forms, setForms] = useState<ListedForm[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [building, setBuilding] = useState(false);
  const [closing, setClosing] = useState<ListedForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(`${api}/${KIND_PATH[kind]}?status=ALL`, signal);
      if (signal?.aborted) return;
      if (!reply.ok) {
        setFailed(say(reply, `The ${noun}s couldn't be loaded.`));
        return;
      }
      setFailed(null);
      setForms((reply.data?.forms ?? []) as ListedForm[]);
    },
    [api, kind, noun],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the branch changes
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function publish(form: ListedForm) {
    setBusy(form.id);
    // Only a practice set and a questionnaire have a draft to publish here (paper work is open when it is made).
    const reply = await sendJson(`${api}/${KIND_PATH[kind]}/${encodeURIComponent(form.id)}`, "PATCH", { status: "PUBLISHED" });
    setBusy(null);
    setNotice(
      reply.ok
        ? { variant: "success", text: `${upper(noun)} published.` }
        : { variant: "error", text: say(reply, "It couldn't be published.") },
    );
    if (reply.ok) await load();
  }

  async function close(form: ListedForm) {
    setBusy(form.id);
    const reply = await sendJson(`${api}/${KIND_PATH[kind]}/${encodeURIComponent(form.id)}/close`, "POST", {});
    setBusy(null);
    setClosing(null);
    setNotice(
      reply.ok ? { variant: "success", text: `${upper(noun)} closed.` } : { variant: "error", text: say(reply, "It couldn't be closed.") },
    );
    if (reply.ok) await load();
  }

  const className = (id: string) => classGroups.find((g) => g.id === id)?.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">{upper(noun)}s</h2>
        <Button onClick={() => setBuilding(true)}>New {noun}</Button>
      </div>

      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {failed && <Alert variant="error">{failed}</Alert>}

      {forms === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : forms !== null && forms.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          No {noun}s yet. Write the first one with “New {noun}”.
        </p>
      ) : (
        <ul className="space-y-3">
          {(forms ?? []).map((form) => {
            const classes = classGroupIdsOf(form).map(className).filter(Boolean) as string[];
            const isPublic = form.audience?.kind === "PUBLIC";
            return (
              <li key={form.id} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-fg">
                      <Link
                        href={`/schools/${encodeURIComponent(schoolCode)}/forms/${encodeURIComponent(form.id)}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {form.title}
                      </Link>
                    </p>
                    {form.instructions && <p className="mt-1 text-sm break-words text-fg-muted">{form.instructions}</p>}
                  </div>
                  <StatusBadge status={form.status} />
                </div>
                <p className="text-sm text-fg-muted">
                  {[
                    windowText(form.opensAt, form.closesAt),
                    form.questionCount !== undefined ? plural(form.questionCount, "question") : null,
                    form.maxDurationMinutes ? `${form.maxDurationMinutes} min limit` : null,
                    kind !== "PAPER_WORK" && form.responseCount !== undefined ? plural(form.responseCount, "response") : null,
                    kind === "PAPER_WORK" && form.summary
                      ? `${form.summary.handedInCount + form.summary.lateCount} of ${form.summary.totalStudents} handed in`
                      : null,
                    classes.length > 0 ? classes.join(", ") : null,
                    kind === "QUESTIONNAIRE" ? (isPublic ? "Anyone with the link" : "Members") : null,
                    kind === "QUESTIONNAIRE" && form.isAnonymous ? "Anonymous" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {kind === "QUESTIONNAIRE" && isPublic && (
                  <PublicLinkBox
                    shareToken={form.shareToken}
                    published={form.status === "PUBLISHED"}
                    onCopied={() => setNotice({ variant: "success", text: "Link copied." })}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {form.status === "DRAFT" && (
                    <Button loading={busy === form.id} onClick={() => publish(form)}>
                      Publish<span className="sr-only"> {form.title}</span>
                    </Button>
                  )}
                  {form.status === "PUBLISHED" && (
                    <Button variant="secondary" disabled={busy === form.id} onClick={() => setClosing(form)}>
                      Close<span className="sr-only"> {form.title}</span>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <FormBuilderDialog
        kind={kind}
        open={building}
        classGroups={classGroups}
        onClose={() => setBuilding(false)}
        onSaved={(text) => {
          setNotice({ variant: "success", text });
          void load();
        }}
      />

      <Dialog open={closing !== null} onClose={() => setClosing(null)} title={`Close this ${noun}?`} description={closing?.title}>
        <p className="text-sm text-fg-2">
          {kind === "PAPER_WORK" ? "It will be closed for everyone." : "Nobody will be able to answer it any more."}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setClosing(null)}>
            Keep it open
          </Button>
          <Button variant="danger" loading={closing !== null && busy === closing.id} onClick={() => closing && close(closing)}>
            Close it
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
