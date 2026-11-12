# 0057: Queued messages are sent by a secret-protected route a scheduler calls (option A of task 0054), and queuing no longer needs Redis

- **Period / Focus:** 2026-11-12 (the maintainer's decision on the open finding of task 0054: "go with your recommendation", read as option A; see section 3, D0)
- **Status:** Done (built and tested; the maintainer's setup in D8 is open)
- **Priority:** High (until now NOTHING sent an Octalve message: a broadcast, an absence alert, a results or an invoice notice stayed "queued" for ever; and queuing itself needs a Redis that may not exist where the app runs)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-dispatch-drain` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Task 0054 found that `enqueueNotificationDispatch` writes a `NotificationDispatch` row in `QUEUED` and pushes a BullMQ job, and that **nothing in the repository takes the job off the queue** (the worker exists, is tested, and is never started). So no message has ever left. The maintainer was offered three ways out (section 5 of 0054) and answered "go with your recommendation". My recommendation was B (a worker host) if a process can run, otherwise A (a cron route). Nothing says a second host exists, and the maintainer works on Vercel, so this builds **A**: the database row is the queue, and a route that a scheduler calls takes the due rows and runs the existing dispatch lifecycle on each.

## 2. Context

- **What exists and is kept:** `processDispatchLifecycle` (`QUEUED/RETRYING` to `PROCESSING` to `SENT`, `RETRYING` or `FAILED`, with the audit-log rows and error sanitising), `defaultNotificationDispatcher` (Resend for e-mail, Termii for SMS and WhatsApp, "ready" for In-App), and the senders that fail closed when no key is set (0054). `tests/integration/communication-queue.spec.ts` tests the lifecycle on the real database and is unchanged.
- **What the push to BullMQ costs.** `enqueueNotificationDispatch` pushes a job to Redis (`REDIS_URL`, default `127.0.0.1:6379`) after writing the row. Where no Redis is reachable the push throws (seen on the unfixed code against a port nothing listens on: `ECONNREFUSED`, then "Connection is closed", after 98 ms), AFTER the row was written, so a broadcast on such a host fails half done; and with a drain that reads the database, the push does nothing useful. (My first draft of this paragraph said the push "hangs"; I had not run it. It fails fast here; a host that drops the packets instead of refusing them could still make it wait.)
- **RLS has no "all schools" context.** `forTenant` sets one school; there are contexts for a user, an invitation, a verification token and a share token, and none that reads every school. A drain needs every school's rows. A new policy would be a migration (the maintainer's to run) and a wider door in the security model. But the `Tenant` table has no `tenantId` column (it IS the school), so it is outside RLS, and `resolve-tenant.ts` already lists tenants without a context: list the schools, then read and write each school's rows inside that school's own `forTenant` transaction.
- **What Vercel does** (read from Vercel's documentation on 2026-11-12, not from memory; the sources are listed in the PR): a Cron Job is a `crons` entry in `vercel.json`; it calls the route with `GET`; when a `CRON_SECRET` environment variable is set it sends `Authorization: Bearer <CRON_SECRET>` (the secret is read at deployment, so a changed value needs a redeploy; at least 16 random characters are recommended); cron jobs run only on production deployments. **On the free (Hobby) plan a cron may run once a day, and a more frequent expression makes the deployment FAIL.** A newer feature, "Schedules", is documented with a 15-minute minimum on Hobby in one page and a once-a-day limit in another, so I did not rely on it.

## 3. Decisions (mine; the maintainer may correct)

- **D0. Option A, read from "go with your recommendation".** My recommendation was conditional (B if a process can run, otherwise A). Everything visible says Vercel only, so A. If a worker host exists, say so: B is already built (`createNotificationDispatchWorker`), it needs the enqueue to push jobs again, and this task's drain and the worker must then not both run (the worker has no claim step).
- **D1. The row is the queue.** `enqueueNotificationDispatch` writes the row and returns; it no longer pushes to BullMQ, so a broadcast needs no Redis. The result keeps its shape (`jobId` is now always undefined). The BullMQ definitions and the worker stay in the tree for option B and are not used.
- **D2. A drain per school, inside that school's transaction.** `drainDispatchQueue` lists the schools that are not suspended (`suspendedAt` null), then for each: reads the due rows in `forTenant`, claims them, and processes them. RLS is untouched; no migration.
- **D3. Claiming is a compare-and-swap, so a row is sent by one run only.** A candidate is claimed with `updateMany({ where: { id, tenantId, status: <seen>, updatedAt: <seen> }, data: { status: PROCESSING } })`; only a run that changes one row proceeds. Two overlapping runs (a retry by the scheduler, a manual call) cannot send the same row. The claim moves `updatedAt`, which is the lease start.
- **D4. What is due.** `QUEUED` always. `RETRYING` once its back-off has passed: 1 minute after the first failed attempt, doubling after each (BullMQ's backoff was 1 second doubling; a scheduler cannot honour seconds). `PROCESSING` older than a 10-minute lease (a run that was killed mid-send). This is at-least-once delivery: a run that dies AFTER the provider accepted a message and before `SENT` is written sends it again after the lease. The attempts limit is 3, as in `DEFAULT_DISPATCH_JOB_OPTIONS`; the third failure is `FAILED`.
- **D5. Limits per run.** A budget of 8 seconds of wall-clock (no new row is claimed after it) and at most 100 rows, at most 20 per school per pass, so one school cannot starve the others and a short function is not cut off; the rest waits for the next run. The numbers are options of the function.
- **D6. The route is a secret check and nothing else.** `GET /api/v1/cron/dispatch-notifications`. `Authorization: Bearer <CRON_SECRET>`, compared in constant time. **It fails closed:** `CRON_SECRET` unset or shorter than 16 characters answers 503 and nothing runs; a missing or wrong header answers 401. The answer is counts only (schools visited, rows claimed, sent, retrying, failed, whether the budget cut the run), never an address, a body or an error text. It is on the route-role guard's allowlist with that reason.
- **D7. The schedule shipped is DAILY, because it is the only one that is safe on every plan, and the maintainer must change it.** `vercel.json` has one `crons` entry, `0 6 * * *` (06:00 UTC). A faster default would fail the deployment on the free plan, and I do not know the plan. **Until it is changed, messages leave once a day.** To send sooner: on a paid plan `* * * * *` (every minute) or `*/5 * * * *`; or any scheduler that can call a URL with a header (a GitHub Actions schedule, a hosted cron) can call the same route every few minutes; or Vercel's Schedules if the plan allows. The route does not care who calls.
- **D8. What the maintainer must do** (not done by me): set `CRON_SECRET` (random, at least 16 characters) for the Production environment in Vercel and redeploy; set the sender variables (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `TERMII_API_KEY`, `TERMII_SENDER_ID`), as already listed; and decide the schedule (D7). Without `CRON_SECRET` the daily call is refused with 503, which is the safe failure.
- **D9. Not built here:** a note on the Broadcast screen about when messages leave (it says "queued", which stays true); an index on `(status, createdAt)` (a migration, and not needed at this size); sending right after queuing through `after()` (a faster path for small broadcasts, its own design); removing BullMQ and ioredis from the tree.

## 4. Work breakdown

- [x] Design (this file).
- [x] The tests first (unit, integration on the real database, API on the route); run against the unfixed code and each failure read (section 6).
- [x] `lib/queue/dispatch-drain.ts`, `dispatch-due.ts`, `dispatch-lifecycle.ts`, `cron-auth.ts`, the route, `vercel.json`, the enqueue without the push, `.env.example`.
- [x] The tests pass on the built branch (lane), together with the existing communication specs, and the whole unit, integration and API projects.
- [x] Docs: the function catalogue, HANDOVER section 6.30, 0054's decision, the tracker.

## 5. Not in this task

- The walkthrough chapters (Octalve's is not started); a worker host (option B); a change of plan or a decision on the schedule (the maintainer's); the Resend and Termii accounts (the maintainer's, later, for production); mutation passes (deferred to the end of PHASE 2, the maintainer's call).

## 6. Build record and tests

All numbers below are from the logs of these runs (lane 1, database `octalve_edu_lane1_test`, a production build of this branch), not from memory.

**Gates.** `tsc --noEmit` exit 0; `eslint` on the changed and new files exit 0; `prettier --check` on every changed and new file (not `.env.example`) clean; `next build` compiled successfully.

**The unfixed code (the new tests against the tree before the change; the three specs that import modules which did not exist yet, `cron-auth`, `dispatch-due` and `dispatch-drain`, were held out of that build because the build type-checks `tests/`, so they cannot fail on the old code except by not existing).** 18 tests run, **8 failed, 10 passed** (24 s). Each failure read:
- `route-role-guard` "the allowlist has no stale entries": the allowlist already named `GET v1/cron/dispatch-notifications/route.ts` and the handler did not exist yet (received `["GET v1/cron/dispatch-notifications/route.ts"]`).
- `dispatch-enqueue-no-redis`: against a port nothing listens on the old enqueue threw `ECONNREFUSED`, then "Connection is closed", after 98 ms, with the row already written. (My first draft of the design said the push "hangs"; the log says it fails fast. The text is corrected.)
- `cron-dispatch` (6 tests): every one of them got **404** (the route did not exist) where the test expects 401, 405 or 200.

**The new code, the files of this task plus every existing communication spec (unit, integration, api, e2e on desktop and phone):** 141 passed, 0 failed (60 s). The new specs: `cron-auth` 5, `dispatch-due` 9, `dispatch-drain` 14, `dispatch-enqueue-no-redis` 1, `cron-dispatch` 6 (35 tests); the existing communication specs are unchanged.

**The whole unit, integration and API projects, on the final tree: 3,715 passed, 0 failed (19.3 minutes).** The end-to-end project as a whole, the https project and the Solo-mode server were NOT run (only the communication end-to-end specs above).

**Targeted mutation checks on the sending rules** (four edits to the source, each run against the specs, source restored after each; this is NOT the deferred full mutation pass):
1. Claim without the compare-and-swap (`where` without `status` and `updatedAt`): killed by `dispatch-drain` "two runs at the same time send each row once" (1 failed, 14 passed).
2. A `PROCESSING` row always due (the lease removed from `isDue`): **survived the drain spec** (15 passed), because the query that reads the candidates already applies the lease; it is killed by the unit spec `dispatch-due` (2 failed: the lease test and the "clock ran ahead" test). An equivalent mutant at the drain level, covered where the decision is made.
3. A `RETRYING` row always due: **survived the drain spec** (15 passed), and this one was a REAL gap: the query knows only the first minute of the back-off, so nothing in the drain spec asked whether the SECOND wait is two minutes. Fixed by a new assertion in the drain spec (90 s after the second failure the row is not taken). Re-run: killed by the drain spec (1 failed, 14 passed) and by the unit spec (3 failed).
4. Suspended schools not excluded: killed by `dispatch-drain` "a suspended school's messages are left alone, and sent once it is not suspended" (1 failed, 14 passed).
After the new assertion the unmutated drain spec: 15 passed.

**Not run, and not claimed:** a real send through Resend or Termii (no key exists); a call from Vercel Cron on a deployment (cron runs only on production deployments, and there is none from this branch); the full mutation passes (deferred to the end of PHASE 2, the maintainer's call); a run against a Postgres with more than one connection pool under real load (the claim is tested with two runs started together on the real database, 14 specs).
