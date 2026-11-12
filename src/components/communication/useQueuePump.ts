"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sends a broadcast's waiting messages in the background (task 0058). The database holds the queue; this only asks the server, again and again, to send "the next batch" and shows how far it
// got. It starts when a broadcast has just been queued, and when the Communication screen opens with messages due (a broadcast cut off by a closed tab or a lost connection). Two screens doing
// it at once is safe: the server hands each row to one call only. Same hook as AlEemaan's (task 0063), for this app's routes, with the "will be tried again" count its senders have.

export type Progress = { total: number; done: number; sent: number; failed: number; retrying: number };
export type PumpState =
  | { phase: "idle" }
  | ({ phase: "sending" } & Progress)
  | ({ phase: "paused" } & Progress)
  | ({ phase: "done"; firstError: string | null } & Progress);

const PAUSE_MS = 200;
const RETRY_MS = 2000;
const GIVE_UP_AFTER = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Batch = { claimed: number; sent: number; failed: number; retrying: number; remaining: number; firstError: string | null };

const queueUrl = (schoolCode: string) => `/api/v1/schools/${encodeURIComponent(schoolCode)}/communication/queue`;

async function nextBatch(schoolCode: string): Promise<Batch | null> {
  try {
    const res = await fetch(`${queueUrl(schoolCode)}/next`, { method: "POST" });
    if (!res.ok) {
      await res.text().catch(() => "");
      return null;
    }
    return (await res.json()).data as Batch;
  } catch {
    return null;
  }
}

async function dueCount(schoolCode: string): Promise<number> {
  try {
    const res = await fetch(queueUrl(schoolCode));
    if (!res.ok) {
      await res.text().catch(() => "");
      return 0;
    }
    return Number((await res.json()).data?.pending ?? 0);
  } catch {
    return 0;
  }
}

export function useQueuePump(schoolCode: string) {
  const [state, setState] = useState<PumpState>({ phase: "idle" });
  const running = useRef(false);
  const schoolRef = useRef(schoolCode);
  const alive = useRef(true);

  const run = useCallback(async (start: Progress) => {
    if (running.current) return;
    running.current = true;
    const school = schoolRef.current;
    const totals = { ...start };
    let firstError: string | null = null;
    let failures = 0;
    let idle = 0;
    setState({ phase: "sending", ...totals });
    while (alive.current && schoolRef.current === school) {
      const batch = await nextBatch(school);
      if (!alive.current || schoolRef.current !== school) break;
      if (!batch) {
        failures += 1;
        if (failures >= GIVE_UP_AFTER) {
          setState({ phase: "paused", ...totals });
          break;
        }
        await sleep(RETRY_MS);
        continue;
      }
      failures = 0;
      totals.sent += batch.sent;
      totals.failed += batch.failed;
      totals.retrying += batch.retrying;
      totals.done += batch.claimed;
      totals.total = Math.max(totals.total, totals.done + batch.remaining);
      firstError = firstError ?? batch.firstError;
      if (batch.remaining === 0) {
        setState({ phase: "done", firstError, ...totals });
        break;
      }
      // another screen is sending the rest: look again a few times, then stop
      idle = batch.claimed === 0 ? idle + 1 : 0;
      if (idle >= 5) {
        setState({ phase: "paused", ...totals });
        break;
      }
      setState({ phase: "sending", ...totals });
      await sleep(batch.claimed === 0 ? RETRY_MS : PAUSE_MS);
    }
    running.current = false;
  }, []);

  /// Carry on with whatever is due for this school (when the screen opens, and from "Try again").
  const resume = useCallback(async () => {
    const pending = await dueCount(schoolRef.current);
    if (pending > 0 && alive.current) void run({ total: pending, done: 0, sent: 0, failed: 0, retrying: 0 });
  }, [run]);

  /// A broadcast has just been queued for `total` people: send it now.
  const begin = useCallback((progress: Progress) => void run(progress), [run]);

  useEffect(() => {
    alive.current = true;
    schoolRef.current = schoolCode;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new school starts from nothing, then looks for what is due
    setState({ phase: "idle" });
    void resume();
    return () => {
      alive.current = false;
    };
  }, [schoolCode, resume]);

  const dismiss = useCallback(() => setState({ phase: "idle" }), []);
  return { state, begin, resume, dismiss };
}
