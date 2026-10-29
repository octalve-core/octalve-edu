"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson } from "@/components/auth/postJson";
import type { Notice } from "@/components/academics/parts";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import { normalizeLabel } from "@/lib/question-bank/labels";
import { STATUS_LABEL, TYPE_LABEL, snippet, type ApiItem, type ItemStatus } from "@/components/question-bank/model";
import { QuestionDetail } from "@/components/question-bank/QuestionDetail";
import { QuestionForm } from "@/components/question-bank/QuestionForm";

// The three lists of questions: Browse (what the person may see), My questions (their own, in every state) and the Review queue (what waits for them). One component, one detail
// dialog, one form. Presentation only: the lists are exactly what the server answered, and a button appears only when the server's `can` flags say it would accept it.

export type QuestionsView = "browse" | "mine" | "queue";

const PAGE = 20;
const INTRO: Record<QuestionsView, string> = {
  browse: "Questions you may use: approved ones for your campus and the school, and your own.",
  mine: "Everything you have written, in every state. Send a draft for review when it is ready.",
  queue: "Questions waiting for a decision. The oldest is first.",
};
const EMPTY: Record<QuestionsView, string> = {
  browse: "No questions to show yet. When teachers write them and a reviewer approves them, they appear here.",
  mine: "You have not written a question yet. Choose Write a question to start.",
  queue: "Nothing is waiting for you.",
};

export function QuestionsPanel({
  view,
  writeCampuses,
  wholeSchool,
}: {
  view: QuestionsView;
  writeCampuses: { id: string; name: string }[];
  wholeSchool: boolean;
}) {
  const api = useBankApi();
  const [items, setItems] = useState<ApiItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [version, setVersion] = useState(0);
  const [more, setMore] = useState(false);

  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [classTag, setClassTag] = useState("");
  const [status, setStatus] = useState<"" | ItemStatus>("");
  const [debounced, setDebounced] = useState({ text: "", subject: "", classTag: "" });

  const [openId, setOpenId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<ApiItem | null>(null);

  // A short pause after typing, so one search is not one request per key.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ text: text.trim(), subject: subject.trim(), classTag: classTag.trim() }), 250);
    return () => clearTimeout(timer);
  }, [text, subject, classTag]);

  const query = new URLSearchParams();
  if (view !== "queue") {
    query.set("limit", String(PAGE));
    if (view === "mine") query.set("mine", "1");
    if (status) query.set("status", status);
    if (debounced.text) query.set("q", debounced.text);
    if (debounced.subject && normalizeLabel(debounced.subject)) query.set("subjectKey", normalizeLabel(debounced.subject));
    if (debounced.classTag && normalizeLabel(debounced.classTag)) query.set("classTagKey", normalizeLabel(debounced.classTag));
  }
  const queryText = query.toString();
  const path = view === "queue" ? `${api}/review-queue` : `${api}/items?${queryText}`;

  // The list is read again whenever what is asked for changes; an older answer never overwrites a newer one. `version` re-reads it after a change.
  useEffect(() => {
    let current = true;
    void (async () => {
      const reply = await getJson(path);
      if (!current) return;
      if (!reply.ok) return setError(say(reply, "Couldn't load the questions."));
      setError(null);
      setItems(reply.data!.items as ApiItem[]);
      setNext((reply.meta?.nextCursor as string | null | undefined) ?? null);
    })();
    return () => {
      current = false;
    };
  }, [path, version]);

  async function showMore() {
    if (!next || more) return;
    setMore(true);
    const reply = await getJson(`${path}&cursor=${encodeURIComponent(next)}`);
    setMore(false);
    if (!reply.ok) return setError(say(reply, "Couldn't load more questions."));
    setItems((current) => [...(current ?? []), ...(reply.data!.items as ApiItem[])]);
    setNext((reply.meta?.nextCursor as string | null | undefined) ?? null);
  }

  function refresh() {
    setVersion((v) => v + 1);
  }
  // A filter change keeps the old list on screen until the new answer arrives (the effect above replaces it), so the page never flashes empty or hangs on "Loading".
  const changeFilter = (set: () => void) => set();

  const filtering = text !== "" || subject !== "" || classTag !== "" || status !== "";

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-2">{INTRO[view]}</p>

      {view !== "queue" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <TextField
              label="Search the questions"
              value={text}
              onChange={(e) => changeFilter(() => setText(e.target.value))}
              maxLength={100}
            />
          </div>
          <div className="sm:w-44">
            <TextField label="Subject" value={subject} onChange={(e) => changeFilter(() => setSubject(e.target.value))} maxLength={80} />
          </div>
          <div className="sm:w-32">
            <TextField label="Class" value={classTag} onChange={(e) => changeFilter(() => setClassTag(e.target.value))} maxLength={40} />
          </div>
          <div className="sm:w-48">
            <SelectField
              label="State"
              value={status}
              onChange={(e) => changeFilter(() => setStatus(e.target.value as "" | ItemStatus))}
              options={[
                { value: "", label: "Any state" },
                ...(Object.keys(STATUS_LABEL) as ItemStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
              ]}
            />
          </div>
          <Button onClick={() => setWriting(true)} className="sm:shrink-0">
            Write a question
          </Button>
        </div>
      )}

      <div aria-live="polite" className="empty:hidden">
        {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {error && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button variant="secondary" onClick={refresh}>
                Try again
              </Button>
            </div>
          </Alert>
        )}
      </div>

      {items === null ? (
        !error && (
          <p className="text-sm text-fg-muted" aria-busy="true">
            Loading…
          </p>
        )
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          {filtering ? "No question matches. Try fewer words, or clear the filters." : EMPTY[view]}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="flex min-h-11 w-full flex-col gap-1 p-4 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="font-medium text-fg">{snippet(item.prompt)}</span>
                  <span className="text-sm text-fg-2">
                    {STATUS_LABEL[item.status]} · {TYPE_LABEL[item.type]}
                    {item.subject ? ` · ${item.subject}` : ""}
                    {item.classTags.length > 0 ? ` · ${item.classTags.join(", ")}` : ""}
                    {view !== "mine" ? ` · ${item.mine ? "You" : (item.submittedBy ?? "Someone")}` : ""}
                    {item.images.length > 0 ? ` · ${item.images.length} ${item.images.length === 1 ? "picture" : "pictures"}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {next && (
            <div className="text-center">
              <Button variant="secondary" onClick={showMore} loading={more}>
                {more ? "Loading…" : "Show more"}
              </Button>
            </div>
          )}
        </>
      )}

      <QuestionDetail
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={(message) => {
          if (message) setNotice({ variant: "success", text: message });
          refresh();
        }}
        onEdit={(item) => {
          setOpenId(null);
          setEditing(item);
        }}
        onOpen={setOpenId}
      />
      <QuestionForm
        open={writing || editing !== null}
        item={editing}
        writeCampuses={writeCampuses}
        wholeSchool={wholeSchool}
        onClose={() => {
          setWriting(false);
          setEditing(null);
        }}
        onSaved={(_item, message) => {
          setNotice({ variant: "success", text: message });
          refresh();
        }}
      />
    </div>
  );
}
