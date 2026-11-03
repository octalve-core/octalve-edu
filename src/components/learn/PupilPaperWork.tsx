"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import type { Notice } from "@/components/forms/model";

// The paper work set for the pupil, with the pupil's own state of each (not handed in, handed in, handed in late, asked for marking), and "Request marking" while the pupil has not
// handed it in. Presentation only: the portal routes decide what is shown and whether a request is allowed, and say why not.

type Listed = {
  turnInId: string;
  formId: string;
  title: string;
  instructions: string | null;
  closesAt: string | null;
  status: "PENDING" | "HANDED_IN" | "LATE";
  requestedAt: string | null;
  note: string | null;
};

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function stateText(f: Listed): string {
  if (f.status === "HANDED_IN") return "Handed in";
  if (f.status === "LATE") return "Handed in late";
  return f.requestedAt ? "You asked your teacher to mark it." : "Not handed in yet";
}

export function PupilPaperWork() {
  const { api } = useFormsApi();
  const base = `${api}/portal/forms/paper-work`;
  const [list, setList] = useState<Listed[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const reply = await getJson(base, signal);
      if (signal?.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The paper work couldn't be loaded."));
      setFailed(null);
      setList((reply.data?.paperWork ?? []) as Listed[]);
    },
    [base],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the section opens
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function request(f: Listed) {
    setBusy(f.formId);
    const reply = await sendJson(`${base}/${encodeURIComponent(f.formId)}/request-marking`, "POST", {});
    setBusy(null);
    setNotice(
      reply.ok
        ? { variant: "success", text: "Your request was sent." }
        : { variant: "error", text: say(reply, "The request couldn't be sent.") },
    );
    await load();
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-fg">Paper work</h2>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      {failed && <Alert variant="error">{failed}</Alert>}
      {list === null && !failed ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : list !== null && list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          No paper work has been set for you.
        </p>
      ) : (
        <ul className="space-y-3">
          {(list ?? []).map((f) => (
            <li key={f.turnInId} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
              <div className="min-w-0">
                <p className="font-semibold break-words text-fg">{f.title}</p>
                {f.instructions && <p className="mt-1 text-sm break-words text-fg-muted">{f.instructions}</p>}
              </div>
              <p className="text-sm text-fg-muted">{f.closesAt ? `Closes ${when.format(new Date(f.closesAt))}` : "No closing time"}</p>
              <p className="text-sm font-medium text-fg-2">{stateText(f)}</p>
              {f.note && (
                <p className="text-sm text-fg-2">
                  <span className="font-semibold text-fg">Note: </span>
                  <span className="break-words whitespace-pre-wrap">{f.note}</span>
                </p>
              )}
              {f.status === "PENDING" && !f.requestedAt && (
                <Button variant="secondary" loading={busy === f.formId} onClick={() => request(f)}>
                  Request marking<span className="sr-only"> for {f.title}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
