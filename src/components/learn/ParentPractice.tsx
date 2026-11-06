"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SelectField } from "@/components/ui/SelectField";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useFormsApi } from "@/components/forms/FormsApi";
import { PracticeHistory } from "@/components/learn/PracticeHistory";
import { practiceBase } from "@/components/learn/practiceModel";

// A guardian's view of their children's practice: the child to look at (the pupils their approved links name), then what the school lets a guardian see - how practice is going, or
// the whole history, or nothing, by the school's own setting. A guardian can change nothing here. Presentation only: the API decides which pupils and what level, and says so in words.

type Child = { id: string; name: string; admissionNo: string };

export function ParentPractice() {
  const { api } = useFormsApi();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`${practiceBase(api)}/children`, controller.signal);
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "Your children couldn't be loaded."));
      setChildren((reply.data?.children ?? []) as Child[]);
    })();
    return () => controller.abort();
  }, [api]);

  if (failed) return <Alert variant="error">{failed}</Alert>;
  if (children === null) return <p className="text-sm text-fg-muted">Loading…</p>;
  if (children.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        No pupil is linked to your account yet.
      </p>
    );
  }
  const child = children.find((c) => c.id === chosen) ?? children[0]!;

  return (
    <div className="space-y-5">
      {children.length > 1 && (
        <div className="max-w-sm">
          <SelectField
            label="Pupil"
            value={child.id}
            onChange={(e) => setChosen(e.target.value)}
            options={children.map((c) => ({ value: c.id, label: `${c.name} (${c.admissionNo})` }))}
          />
        </div>
      )}
      {children.length === 1 && (
        <p className="text-sm text-fg-2">
          {child.name} ({child.admissionNo})
        </p>
      )}
      <PracticeHistory key={child.id} pupilId={child.id} canAct={false} />
    </div>
  );
}
