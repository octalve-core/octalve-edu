"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { getJson, sendJson, type Reply } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import {
  OUTCOME_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  answerKey,
  imageUrl,
  percent,
  visibilityText,
  whenText,
  type ApiItem,
  type HistoryEntry,
} from "@/components/question-bank/model";
import { ApproveDialog, ReasonDialog } from "@/components/question-bank/DecisionDialogs";

// One question, as staff see it: the words, the answer key (staff set the exam, so they see it), the pictures, what was decided and why, and only the buttons the server's `can`
// flags allow. Presentation only: the server decides, and a button it would refuse is simply not drawn.

type Loaded = { item: ApiItem; history: HistoryEntry[] };

export function QuestionDetail({
  id,
  onClose,
  onChanged,
  onEdit,
  onOpen,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: (message: string | null) => void;
  onEdit: (item: ApiItem) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <Dialog open={id !== null} onClose={onClose} title="Question" wide>
      {id && <DetailBody key={id} id={id} onClose={onClose} onChanged={onChanged} onEdit={onEdit} onOpen={onOpen} />}
    </Dialog>
  );
}

function DetailBody({ id, onClose, onChanged, onEdit, onOpen }: { id: string; onClose: () => void; onChanged: (message: string | null) => void; onEdit: (item: ApiItem) => void; onOpen: (id: string) => void }) {
  const api = useBankApi();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deciding, setDeciding] = useState<"approve" | "reject" | "retire" | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    void (async () => {
      const reply = await getJson(`${api}/items/${encodeURIComponent(id)}`);
      if (!current) return;
      if (!reply.ok) return setError(reply.status === 404 ? "This question is no longer available to you." : say(reply, "Couldn't load the question."));
      setError(null);
      setLoaded({ item: reply.data!.item as ApiItem, history: reply.data!.history as HistoryEntry[] });
    })();
    return () => {
      current = false;
    };
  }, [api, id, version]);

  async function submitForReview(item: ApiItem) {
    if (pending) return;
    setPending(true);
    const reply = await sendJson(`${api}/items/${encodeURIComponent(item.id)}/submit`, "POST");
    setPending(false);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    setError(null);
    onChanged("Sent for review. A reviewer will look at it.");
    setVersion(version + 1);
  }

  function decided(reply: Reply, what: string) {
    setDeciding(null);
    if (!reply.ok) return setError(say(reply, "That didn't work."));
    setError(null);
    onChanged(what);
    setVersion(version + 1);
  }

  if (!loaded) {
    return error ? (
      <div className="space-y-4">
        <Alert variant="error">{error}</Alert>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    ) : (
      <p className="text-sm text-fg-muted" aria-busy="true">
        Loading…
      </p>
    );
  }
  const { item, history } = loaded;
  const key = answerKey(item);
  const similar = item.overlap ?? [];

  return (
    <div className="space-y-5">
      <div aria-live="polite" className="empty:hidden">
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-line-strong px-3 py-1 font-semibold text-fg">{STATUS_LABEL[item.status]}</span>
        <span className="text-fg-2">{TYPE_LABEL[item.type]}</span>
        <span className="text-fg-2">· {item.points} {item.points === 1 ? "point" : "points"}</span>
        {item.difficulty !== null && <span className="text-fg-2">· Difficulty {item.difficulty} of 5</span>}
      </div>

      <section aria-labelledby="q-prompt" className="space-y-2">
        <h3 id="q-prompt" className="text-sm font-semibold text-fg">
          Question
        </h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{item.prompt}</p>
        {item.images.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {item.images.map((image) => (
              <li key={image.id} className="rounded-xl border border-line bg-surface-2 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- our own route, same origin, private: the image optimiser would fetch it without the sign-in */}
                <img src={imageUrl(api, item.id, image.id)} alt={image.decorative ? "" : image.alt} width={image.width} height={image.height} className="mx-auto h-auto max-h-64 w-auto max-w-full" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {(item.type === "SINGLE" || item.type === "MULTI") && item.options && (
        <section aria-labelledby="q-options" className="space-y-2">
          <h3 id="q-options" className="text-sm font-semibold text-fg">
            Options
          </h3>
          <ul className="space-y-1.5">
            {item.options.map((option) => {
              const correct = key.includes(option.text);
              return (
                <li key={option.id} className={`rounded-lg border px-3 py-2 text-sm ${correct ? "border-ok-line bg-ok-bg text-ok-fg" : "border-line text-fg"}`}>
                  {option.text}
                  {correct && <span className="font-semibold"> (correct)</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {(item.type === "TRUE_FALSE" || item.type === "SHORT") && (
        <section aria-labelledby="q-answer" className="space-y-1">
          <h3 id="q-answer" className="text-sm font-semibold text-fg">
            {item.type === "SHORT" ? "Accepted answers" : "Correct answer"}
          </h3>
          <p className="text-sm text-fg">{key.join(", ")}</p>
        </section>
      )}
      {item.explanation && (
        <section aria-labelledby="q-why" className="space-y-1">
          <h3 id="q-why" className="text-sm font-semibold text-fg">
            Explanation
          </h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-2">{item.explanation}</p>
        </section>
      )}

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-fg-muted">Subject: </dt>
          <dd className="inline text-fg">{item.subject ?? "Not chosen yet"}</dd>
        </div>
        <div>
          <dt className="inline text-fg-muted">Classes: </dt>
          <dd className="inline text-fg">{item.classTags.length > 0 ? item.classTags.join(", ") : "Not chosen yet"}</dd>
        </div>
        {item.topic && (
          <div>
            <dt className="inline text-fg-muted">Topic: </dt>
            <dd className="inline text-fg">{item.topic}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-fg-muted">Written by: </dt>
          <dd className="inline text-fg">{item.mine ? "You" : (item.submittedBy ?? "Someone")}</dd>
        </div>
        <div>
          <dt className="inline text-fg-muted">Written for: </dt>
          <dd className="inline text-fg">{item.campusId === null ? "The whole school" : "One campus"}</dd>
        </div>
        {item.status === "APPROVED" && (
          <div>
            <dt className="inline text-fg-muted">Visible to: </dt>
            <dd className="inline text-fg">{visibilityText(item)}</dd>
          </div>
        )}
      </dl>

      {item.reason && (item.status === "REJECTED" || item.status === "RETIRED") && (
        <Alert variant="warning">
          <p>
            <strong>{item.status === "REJECTED" ? "Sent back." : "Retired."}</strong> {item.reason}
          </p>
        </Alert>
      )}

      {similar.length > 0 && (
        <Alert variant="warning">
          <p className="font-semibold">
            This question is very close to {similar.length === 1 ? "another" : `${similar.length} others`}.
          </p>
          <ul className="mt-1 space-y-1">
            {similar.map((flag) => (
              <li key={flag.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {percent(flag.score)} the same as {flag.similarTo.kind === "BANK_ITEM" ? "a question in the bank" : "a question in a published quiz"}
                </span>
                {flag.similarTo.kind === "BANK_ITEM" && (
                  <Button variant="secondary" onClick={() => onOpen(flag.similarTo.id)} className="min-h-11 text-sm">
                    Open it
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {history.length > 0 && (
        <section aria-labelledby="q-history" className="space-y-2">
          <h3 id="q-history" className="text-sm font-semibold text-fg">
            What has been decided
          </h3>
          <ul className="space-y-1 text-sm text-fg-2">
            {history.map((entry) => (
              <li key={entry.id}>
                {OUTCOME_LABEL[entry.outcome] ?? entry.outcome} by {entry.by ?? "someone"}, {whenText(entry.at)}
                {entry.reason ? `: ${entry.reason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        {item.can.retire && (
          <Button variant="danger" onClick={() => setDeciding("retire")}>
            Retire
          </Button>
        )}
        {item.can.reject && (
          <Button variant="secondary" onClick={() => setDeciding("reject")}>
            Send back
          </Button>
        )}
        {item.can.edit && (
          <Button variant="secondary" onClick={() => onEdit(item)}>
            Edit
          </Button>
        )}
        {item.can.submit && (
          <Button variant="secondary" onClick={() => submitForReview(item)} loading={pending}>
            {pending ? "Sending…" : "Send for review"}
          </Button>
        )}
        {item.can.approve && <Button onClick={() => setDeciding("approve")}>Approve</Button>}
      </div>

      <ApproveDialog item={deciding === "approve" ? item : null} onClose={() => setDeciding(null)} onDone={(reply) => decided(reply, "Approved.")} />
      <ReasonDialog
        item={deciding === "reject" || deciding === "retire" ? item : null}
        action={deciding === "retire" ? "retire" : "reject"}
        onClose={() => setDeciding(null)}
        onDone={(reply, action) => decided(reply, action === "reject" ? "Sent back to the writer." : "Retired.")}
      />
    </div>
  );
}
