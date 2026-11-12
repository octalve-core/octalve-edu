# 0054: The Communication senders fail closed, and the finding that nothing consumes the dispatch queue

- **Period / Focus:** 2026-11-12 (the maintainer: "what's the current state of emailing?", then "fix defect")
- **Status:** Built and tested; PR into `dev`
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/email-fail-closed` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

When a message reaches a sender and no provider key is set, the send must be a **failed send that says so**, not a "sent". This is the same change as AlEemaan's task 0053, made here so that the two products behave alike. This file also records a **second, larger finding** made while doing it: nothing in Octalve Edu consumes the dispatch queue (section 2), so no broadcast or automatic alert is ever delivered, with or without keys.

## 2. Context

Found on 2026-11-12 while answering "what is the state of emailing?" (read from the code and from the variable names, never the values, of the hosted Vercel project):

- `src/lib/communication/gateways/email.ts` (`sendEmail`, `sendBatchEmails`) and `termii.ts` (`sendTermiiMessage`, SMS and WhatsApp) answer `success: true` from a stand-in whenever `RESEND_API_KEY` or `TERMII_API_KEY` is missing, in every environment. The hosted project has neither variable.
- **Octalve queues; it does not send in the request.** `broadcastMessage` and the event triggers (absence, results published, invoice issued) call `enqueueNotificationDispatch` (`src/lib/queue/dispatch-service.ts`): a `NotificationDispatch` row in `QUEUED` and a BullMQ job in Redis. The Broadcast screen already says "queued", which is true.
- **Nothing takes the job off the queue.** `createNotificationDispatchWorker` (`src/lib/queue/dispatch-worker.ts`) and `defaultNotificationDispatcher` (`gateways/dispatcher.ts`) are defined, documented and unit-tested, but **no code in `src/`, no script and no `package.json` entry starts a worker or calls the dispatcher outside the tests** (searched the whole repository on 2026-11-12). So in every environment a dispatch stays `QUEUED` for ever. The sender fix below matters from the day a worker exists; until then no message is delivered at all.
- `src/lib/dev-tools.ts` is the one gate for "is this a development or staging build" (`devToolsEnabled(env)`, pure, fails closed to production). It is reused.

## 3. Decisions

- **D1. One rule, stated once** (same as AlEemaan): `src/lib/communication/gateways/stand-in.ts`, `standInAllowed(env)` is true only for `NODE_ENV=test` and where the dev tools are on; production never, whatever `DEV_TOOLS` says.
- **D2. Fail closed.** No key and no stand-in allowed: `sendEmail` (and so `sendBatchEmails`) and `sendTermiiMessage` return `success: false` with a sentence that names what is not set up and the variable, and nothing is recorded as sent. A worker's lifecycle then marks the dispatch failed with that sentence as its `lastError`. A key that IS set, and the stand-in where it is allowed, behave as before, so the existing suite is unaffected.
- **D3. The Broadcast screen is not changed**: it says "queued", which is accurate for a queue.
- **D4. The missing worker is NOT built in this task.** It is a decision for the maintainer (section 5), recorded in the HANDOVER and the tracker.
- **D5. Mutation passes are deferred** to the end of PHASE 2 with all the others (the maintainer's call).

## 4. Work breakdown

- [x] Design (this file).
- [x] `stand-in.ts`; `sendEmail` (and so `sendBatchEmails`) and `sendTermiiMessage` use it.
- [x] Tests: unit (the environment matrix of `standInAllowed`; `sendEmail`, the batch, SMS and WhatsApp in production with and without a key; the dispatcher; the in-app channel unaffected).
- [x] Docs: tracker, HANDOVER (section 6.29: the finding and the options), the function catalogue, `.env.example` comments.

## 5. For the maintainer: who delivers the queue? (not built)

Three ways to make queued messages leave; the choice depends on where a long-running process may run:

| Option | What it is | Cost |
| --- | --- | --- |
| **A. A cron route** | A route, protected by a secret, that Vercel Cron calls; it takes up to N `QUEUED` rows from the database and runs the existing dispatch lifecycle on each (no BullMQ worker needed). | Delivery is as frequent as the cron allows (every minute on a paid Vercel plan, once a day on the free one). Redis would no longer be needed for this. |
| **B. A separate worker host** | Run `createNotificationDispatchWorker(defaultNotificationDispatcher)` as its own Node process (a small VPS, Railway, Fly) with the same environment variables. The queue, retries and back-off already built are used as designed. | A process to run and watch. |
| **C. Send in the request** (as AlEemaan does) | Call the dispatcher where the row is made. | The simplest. A large broadcast holds the request open, and queue retries are lost. |

Recommendation: **B** if a place to run a process exists (it is what was built and tested); otherwise **A**. Say which, and where B may run.

**Decided (2026-11-12):** the maintainer answered "go with your recommendation" after asking what each option meant. Nothing says a second host exists and the maintainer works on Vercel, so this was read as **A**, and it is built in [task 0057](0057-dispatch-drain-by-cron.md): the database row is the queue, a secret-protected route a scheduler calls sends the due rows, and queuing no longer needs Redis. The schedule shipped is DAILY (the only one safe on every Vercel plan); the maintainer must set `CRON_SECRET` and may change the schedule. If a worker host does exist, say so (task 0057, D0).

## 6. Not in this task

- Sending real mail: no key exists to try it with. **Not tested against Resend or Termii**, and not claimed.
- The worker (section 5), `APP_URL`, a verified sender domain, any variable on the hosted project: the maintainer's.
- The account mail transport (`src/lib/email/transport.ts`): it already logs a production warning, and a failed send there is swallowed on purpose.

## 7. Build record and tests

**Static gates (on `claude/email-fail-closed`, in the order tsc, lint, build, tests):** `tsc --noEmit` clean; `pnpm lint` 0 errors (38 warnings that were there before); Prettier `--check` clean on the changed code files; `pnpm build` succeeded on lane 1.

**Tests (lane 1):** the two communication unit specs, 28 passed; **the whole unit project, 1,234 passed, 0 failed.** The existing `communication-gateways.spec.ts` needed the same change as AlEemaan's: it had only ever passed because of the bug (the suite declares itself production), so its file now runs under a staging environment with the dev tools on and restores it afterwards; its assertions are unchanged. No API or browser test touches the senders (nothing in `src/` calls the dispatcher, section 2), so none was run: not claimed.

**Regression proof (old gateways put back, the new unit spec run): 3 failed, 14 passed.** The three failures are the production tests (email and the batch, SMS and WhatsApp, the dispatcher); the 14 that pass cover unchanged behaviour (the stand-in where allowed, a set key, an invalid address, the pure matrix).

**Not run, and not claimed.** The whole suite; mutation passes (deferred, D5); any send through the real Resend or Termii (no key exists to try it with); the worker, which does not exist (section 5).
