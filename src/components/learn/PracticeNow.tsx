"use client";

import { useState } from "react";
import { PracticeFinished } from "@/components/learn/PracticeFinished";
import { PracticeSession, type StartedSession } from "@/components/learn/PracticeSession";
import { PracticeSetup } from "@/components/learn/PracticeSetup";
import type { FinishedSession } from "@/components/learn/practiceModel";

// "Practise now": the setup, then the session, then its result, each taking the whole section. A session left open and carried on from the history starts at the session. Presentation only.

type View = { kind: "setup" } | { kind: "session"; started: StartedSession } | { kind: "result"; result: FinishedSession };

export function PracticeNow({ resume }: { resume?: StartedSession | null }) {
  const [view, setView] = useState<View>(resume ? { kind: "session", started: resume } : { kind: "setup" });
  if (view.kind === "session") {
    return <PracticeSession started={view.started} onFinished={(result) => setView({ kind: "result", result })} />;
  }
  if (view.kind === "result") {
    return <PracticeFinished result={view.result} onAgain={() => setView({ kind: "setup" })} />;
  }
  return <PracticeSetup onStarted={(started) => setView({ kind: "session", started })} />;
}
