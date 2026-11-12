# 0058: The Communication screen sends a broadcast's messages in batches of ten, shows the progress, and carries on where it was cut off

- **Period / Focus:** 2026-11-12 (the maintainer's idea, asked about for both apps: send a small audience at once; for a large one, send ten at a time from the screen, show "sending" with the progress, and when the screen opens check whether messages are still waiting; I recommended the server as the source of truth and no browser storage, and they said "GO")
- **Status:** Done (built and tested on lane 1; the CRON_SECRET and the senders' keys are the maintainer's, see section 5)
- **Priority:** Medium (task 0057 made the daily cron send the queue; until the cron runs, a broadcast only waits, and a school that sends a notice wants it to leave now)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-broadcast-batches` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A broadcast already writes one `NotificationDispatch` row per recipient in `QUEUED` (`POST .../communication/broadcast`); task 0057 made the cron route send them once a day. This task adds the second way: **the Communication screen sends them itself**, ten at a time, right after the broadcast is queued, and again when the screen is opened with messages still waiting.

- `POST /api/v1/schools/[code]/communication/queue/next` sends the next batch (up to 10) of the school's due messages and answers with counts: `{ claimed, sent, failed, retrying, remaining, firstError }`.
- `GET /api/v1/schools/[code]/communication/queue` answers `{ pending }`: how many are due now.
- The screen (`useQueuePump`, `SendingProgress`, in `CommunicationPanel`) asks for batches until `remaining` is 0, with a progress line above the tabs ("Sending messages: 40 of 200", a progress bar), a **paused** state with **Try again** when the server cannot be reached, and an "All N messages are sent" line with Dismiss (a failure says how many were not sent and why).
- **Small audiences** need nothing special: ten or fewer are one batch, sent as the broadcast's screen starts. **A closed tab or a lost connection** leaves the rows `QUEUED`; the next time anyone opens Communication the count is asked and sending carries on. The page has to stay open for the screen to send; the daily cron (task 0057) still sends whatever is left.

## 2. Context

- **The same idea as AlEemaan's task 0063**, built on this app's queue, not copied: AlEemaan had no consumer, so 0063 wrote its own claim; Octalve already has the drain (`dispatch-drain.ts`: the compare-and-swap claim on `(status, updatedAt)`, the 1-minute doubling retry back-off, the 10-minute lease, the audit rows, RLS per school), so this task limits that drain to **one school and ten rows**.
- **The browser decides nothing.** The routes take no list of recipients or ids; the server picks the rows of the signed-in school. A screen cannot send a message the broadcast did not name, and one school cannot send another's.
- **What the screen is not.** Not a second queue and not a storage: nothing is kept in the browser (no `localStorage`: it is per browser, not shared by the other administrator, and would hold names and numbers on a shared computer).

## 3. Decisions (mine; the maintainer may correct)

- **D1. The server is the source of truth.** The rows are the progress; the screen only asks. (The maintainer offered "local storage, or maybe even the server"; the server it is.)
- **D2. `src/lib/queue/dispatch-batch.ts`** is `drainDispatchQueue` limited to one school (`tenantIds: [tenantId]`) and ten rows (`maxRows` and `perTenant` = 10), plus `countDueRows`. Nothing of the claim, the back-off or the lease is written twice.
- **D3. "Due" is the drain's own rule.** `countDueRows` uses the same `where` as the drain (`candidatesWhere`, now shared) and then `isDue`, so a message that failed and is waiting out its back-off is **not** counted: the screen is not left waiting for something that cannot be sent yet. It looks at up to 5,000 rows.
- **D4. A failed send is counted apart in the answer.** This app's senders retry (`RETRYING`, back-off, dead letter at the third attempt), so `BatchResult` has `retrying` (will be tried again) and `failed` (dead-lettered) separately. The screen adds them: "N not sent yet" while it runs, "N not sent" when it finishes, with the first reason, and says the scheduled run tries again (three attempts in all).
- **D5. The reason is shown without the address.** A sender's error may quote the number or email it was given; `firstError` replaces it with "the recipient" (the lifecycle already sanitises what it stores; this covers a reason read back from a row written by an older sender).
- **D6. Who may call it:** `ADMIN` and `CAMPUS_ADMIN` (the roles of the broadcast route and of the delivery logs), with a school session; not a support view; the guard test lists both routes as checked in the shared drain (the school is the session's, the rows are the school's).
- **D7. Two screens at once are safe.** A row is claimed by one call only (the existing compare-and-swap), so two tabs or two administrators cannot send one message twice. Delivery stays at-least-once (a call that dies after the provider accepted a message and before `SENT` is written sends it again after the lease), as in 0057.
- **D8. The pump's pacing:** 200 ms between batches; a pause after 3 failed calls in a row with **Try again** (2 s between tries); and, when five calls in a row claim nothing while messages are still due (another screen holds them), it pauses too, so a screen does not loop.
- **D9. The broadcast route is not changed.** It still only queues. The composer tells the panel how many were queued (`onQueued`) and the panel starts the pump; a broadcast made through the API alone is sent by the cron, or by the next screen that opens Communication.

## 4. Work breakdown

- [x] Design (this file).
- [x] The tests (written with the code; section 6 says what ran against what).
- [x] `dispatch-drain.ts` (shared `candidatesWhere`, `countDueRows`), `dispatch-batch.ts`, the two routes, `useQueuePump`, `SendingProgress`, `CommunicationPanel`, `BroadcastComposer`, the guard test's list.
- [x] The new specs and the existing communication specs pass on a production build of the branch (lane 1).
- [x] Docs: the function and component catalogues, HANDOVER section 6.31, the tracker.

## 5. Not in this task

- **A wording flaw, known:** the pause that follows five calls that claimed nothing (another screen is sending the rest) shows the same line as a lost connection, "the server could not be reached"; it is true of neither case alone. It should say that another screen is sending; not fixed here.
- The whole suite; mutation passes (deferred to the end of PHASE 2).
- A note on the Broadcast screen about when messages leave if the page is closed; the "Queued" info tip (its words must say when messages leave: now while the page is open, and daily through the cron).
- **For the maintainer (unchanged from 0057):** `CRON_SECRET` is set for Production in Vercel but the code is only on `dev`; promote `dev` to `master` and `prod` when you choose; the Resend and Termii keys (without them every message fails closed, with the reason named on the screen).

## 6. Build record and tests

All numbers are from the logs of these runs (lane 1, database `octalve_edu_lane1_test`, a production build of this branch).

**Gates.** `tsc --noEmit` exit 0; `eslint` on the changed and new files clean; `prettier --check` on the changed and new files clean; `next build` compiled successfully (both runs); the catalogue check clean (850 rows).

**The unfixed code: NOT run for this task.** The integration spec imports `dispatch-batch.ts`, which did not exist on `dev`, so it cannot compile there (the same situation as 0057's three specs); the API and end-to-end specs would find no route (the same 404 that 0057 recorded for the cron route before it existed), but I did not run them against the old build to confirm it. What each test would prove is in its title.

**The new code, run 1: 77 passed, 0 failed** (desktop project; the existing communication specs are in the same run). **Run 2, after the one wording change in `SendingProgress` (the end of the finished line now says "three attempts in all") and the docs, on a rebuilt lane 1, with the phone project added: 86 passed, 0 failed.** Run 1's tests: `route-role-guard` (the two new routes listed, no stale entries), `dispatch-batch` (4 integration tests: a batch takes ten, sends them and says how many are still due; only this school's messages are counted and sent; a message waiting out its back-off is not due; a failure is counted as will-be-tried-again with a reason that does not quote the address), `communication-queue` API (who may call: administrator and campus administrator may, a teacher, an anonymous caller and another school's administrator may not; next sends a batch of ten and says how many are left, and with no provider key the messages fail closed with the reason and without the number; another school's waiting messages are not counted and not sent), `communication-batches` end-to-end (opening Communication with messages due carries on in the background, shows how far it got and says when all are sent; nothing due shows no line; when the server cannot be reached the line says sending is paused and Try again carries on), plus the existing `communication`, `communication-tags-recipients`, `cron-dispatch`, `dispatch-drain`, `dispatch-due`, `communication-composer-tags` and `communication` accessibility specs, all green.

**Not run:** the whole suite; mutation passes (deferred).
