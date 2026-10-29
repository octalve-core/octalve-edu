# 0019: A request that cannot be valid is a 4xx (NUL character, broken percent-encoding) and two tests that failed only under load

- **Period / Focus:** 2026-10-20 to 2026-10-21 (follow-up of the full-suite run on the merged `dev`, task 0017 and 0018)
- **Status:** Completed (merged into `dev` as PRs #47, #48 and #49 on 2026-10-20 and 2026-10-21)
- **Priority:** Medium
- **Assignee:** Agent (Claude); merged into `dev` under the standing authority to merge after the checks pass
- **Target Branch / PR:** `dev`; PRs #47, #48 and #49, listed in section 6
- **Started:** 2026-10-20 23:45:54 UTC (the first commit of the three branches)
- **Ended:** 2026-10-21 00:28:14 UTC
- **Duration:** 42 min 20 s from the first commit to the last merge (the probing and the failing-first runs before the first commit took longer)

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Three things the full-suite run on the merged `dev` and the probes after it turned up, each on its own branch off `dev`: a request that holds a NUL character, or a path whose percent-encoding cannot be decoded, is refused as a bad request (a 4xx) before any handler runs instead of answering a 500 (the same branch also fixes three routes that answered 500 for an id this school does not have); and the two tests that failed in that run (the email-change timing check and the account-menu e2e test) fail for reasons that lie in how they wait, so they are repaired and the proof is recorded.

## 2. Context & Related Docs
- The full suite on the merged `dev` before #45 and #46 (2026-10-20, lane 1, 2.1 h): 2159 passed, 23 skipped, 2 failed. The two failures are Module C.
- AlEemaan already refuses a path with broken percent-encoding in its proxy and replaces unusable path values (`lib/api/ids.ts`); Octalve did neither. This brings the two to the same rule for the path; the NUL scan of the query string and the JSON body is new in Octalve and is to be ported to AlEemaan.
- The 16 routes that read their own body (sign-in, two-step verification, passwords, email change, invitations, setup, profile) are not behind the body scan; see section 5.

---

## 3. Work Breakdown (Grouped by Module / Sub-Phase)

### Module A: Broken percent-encoding in a path (`claude/fix-malformed-path-is-400`, PR #47)
- [x] `src/proxy.ts` answers 400 `Bad request` (plain text, uncacheable) for a path whose percent-encoding cannot be decoded (`%ff`, a lone `%`, `%ED%A0%80`), for pages and for `/api/*`; the matcher now covers `/api/:path*` for this check, and a well-formed API request passes through unchanged. `src/lib/api/malformed-path.ts` holds the check.
- [x] Before: eight addresses under dynamic routes (pages and API routes, signed out) answered 500 over real HTTP; after: 400.

### Module B: A NUL character in a request (`claude/fix-nul-in-input`, PR #49)
- [x] `src/lib/api/no-nul.ts` (`holdsNul`, iterative: keys and values, any depth, no stack overflow on a million levels). `withAuth` refuses a NUL in a path segment (404 `NOT_FOUND`) and in the query string (400 `VALIDATION`), after the checks that say who may be here and before the handler; `validate()` refuses it in the JSON body (400 `VALIDATION`) before the schema is asked.
- [x] Before: 15 route-and-method pairs answered 500 for a path segment, 18 of 515 query-string cases (the people, member and subject lists among them) and five create routes for a free-text field of the body.
- [x] **Found by the extra path test on this branch and fixed in it:** an id this school does not have (any unknown id, nothing to do with a NUL) answered 500 on four route-and-method pairs. PATCH and DELETE `lms/assignments/[id]` and DELETE `lms/materials/[id]`: the services updated by id and the database said "record not found"; they now look the record up first and return `null`, and the routes answer 404 `NOT_FOUND`. GET `finance/payments/[ref]/status`: a payment the gateway does not confirm (unknown, still waiting, failed, a different amount) threw `FulfilmentRefusal`, which `financeFailure` did not know, so a person polling for the result of a payment got a 500 while it was waiting; it is now 400 `REFUSED` with the fixed text "The payment could not be confirmed." (the refusal's own text is for the webhook's log).
- [x] One existing row of `tests/api/campuses.spec.ts` changed: a NUL in a campus name is now refused by the central scan, so the message it expects is the scan's.
- [ ] Not covered, on purpose: the 16 routes that read their own body (none answers 5xx for a NUL today; a regression test keeps that true for 15 combinations). The next batch gives them one shared way to read the body, which scans it as `validate()` does.

### Module C: Two tests that failed under load (`claude/fix-two-load-sensitive-tests`, PR #48, two commits)
- [x] **The email-change timing check** (`tests/api/account-self-service.spec.ts`): 12 samples of each kind, the lower quartile instead of the median, a tolerance of 250 ms instead of 40, and a time budget of its own (240 s). Measured on this machine: identical code differed by 61 ms between medians in a control run and by 76 ms in the full run, and with a deliberate 60 ms leak by up to 178 ms; the samples are 1.6 to 2.8 s because each holds a bcrypt compare at cost 12. A 400 ms wait in the route is refused (a difference of 384 ms); a 60 ms one is not reliably seen (1 run in 6), and the comment says so.
- [x] **The account-menu e2e test** (`tests/e2e/shell.spec.ts`, `helpers.ts`): `signedInAs` waited for `/dashboard`, from which a person with one school is sent a moment later to the school's page, a second navigation that re-mounts the shell and closes a menu opened in between; it now waits for the page the person ends up on. Sign-in has 15 s instead of 5. Before: 1 pass in 3 runs at load 10 to 17; after: the whole shell spec 55 passed, 0 failed, 3 repetitions, desktop and phone, at load 20 to 27.

### Module D: Docs
- [x] Catalog rows (`docs/functions/shared.md`: `no-nul.ts`, `malformed-path.ts`, `validate.ts`, `with-auth.ts`, `proxy.ts`; `docs/functions/school-app.md`: the LMS service and its two routes, `finance/http.ts` and the payment-status route, which described the old 500s) in the same commits as the code.
- [x] This task file, the register row and section in `current-tasks.md`, `octalve_edu_progress.md`, `HANDOVER.md` section 6 and the banner of `CLAUDE.md`; the full-suite result is recorded in tasks 0017 and 0018.
- [x] Open the pull requests into `dev` and merge them (#47 at 23:47:42 and #48 at 00:04:24 and #49 at 00:28:14 UTC, each after its Vercel check was SUCCESS and with `base.ref` checked to be `dev`).
- [ ] After the promotion to `prod`: record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public).

---

## 4. Unified Verification & Quality Gates
- [x] `pnpm build` (type-checks source and tests), eslint and prettier clean on each branch; the code catalogs: 414 tracked files, 414 rows, none missing, extra, duplicate or broken.
- [x] **Every new test was run on an unfixed production build first:** NUL: of 21 API tests 15 failed for the intended reason (the path sweep found 53 pairs that were not a 404, 15 of them a 500; no query-string case of 515 answered with the NUL message and 18 answered 500; five of the 13 body tests answered 500, the rest a different 400) and the 6 controls passed (the first version of the spec; the extra path test, run on the build with the guard and without the unknown-id fixes, failed with the four 500s above, and the three tests of those fixes, two for LMS and one for finance, failed with a 500 where a 404 or 400 is expected while the 19 tests beside them passed); proxy: of 10 API tests the 8 about broken encodings failed (500 where 400 is expected) and the 2 controls passed.
- [x] On each branch's own build: NUL: the four new or changed spec files 67 passed, 0 failed (the first version of the spec); after the unknown-id fixes, on the branch fast-forwarded to `dev` (`ba7e48f`): the 14 spec files that sit next to the change (NUL, `with-auth`, `api-infrastructure`, campuses, LMS, finance, `malformed-path`, proxy, `people-import`, `tenant-boundary` and the source and route guards) 168 passed, 0 failed; the whole unit, integration and api projects on the build of the first version (`a17baa3` plus the guard): 1791 of 1794 passed, the three that did not being the old timing check that #48 repairs, one campuses row that expected the schema's message for a NUL (updated), and a `people-import` export test that timed out at its 240 s under load and passed alone in 1.3 minutes; the unit project on `dev` after #49: 396 passed; proxy: `malformed-path` 10, the proxy integration spec, `security-headers`, `csp`, `with-auth`: 52 passed, 0 failed (the first run had one failure of my own, a `%2E%2E` case that the URL parser turns into a redirect, replaced).
- [x] Timing check: on a production build with a throwaway delay in the route: delay 0 control, delay 400 ms (refused), delay 60 ms (6 runs, 1 refused); the final text: 3 of 3 runs pass. Shell spec: 55 passed in 3 repetitions.
- [ ] NOT run: the e2e projects and the https project on the NUL and proxy branches (no page changed); the mobile and https projects after the test changes; a full suite with all three merged; AlEemaan (its port follows).

---

## 5. Notes, Findings & Deviations
- **A mistake of mine, found by the probe:** the first version of the NUL scan read the query string inside `validate()`. The probe (a NUL in every position of every route) showed that several lists read their query string through their own helpers, outside `validate()`, and still answered 500, so the scan moved to `withAuth`, which every route goes through.
- **A second mistake, found by the experiment:** the timing check at 150 ms (AlEemaan's value) was inside the noise of a busy machine here (a run with a 60 ms leak came out at 178 ms), and 12 samples made the test slower than the 2-minute limit I gave the run once (a timeout, not an assertion). The tolerance is 250 ms and the test asks for 240 s. AlEemaan's 150 ms is left as it is and could be aligned.
- **Not changed, same shape:** the password-reset timing test (`tests/api/password-reset.spec.ts`, 40 ms on medians) passed in the same run; it has no measurement of failing.
- **Not changed:** other e2e specs sign in through the page and click straight away; they use assertions that wait and did not fail.
- **Known limits (also):** an id in the BODY of the LMS writes (the subject or class of an assignment) that this school does not have still reaches the database as an error; this task covers the id in the path.
- **Known limits:** the NUL scan covers routes behind `withAuth` (path and query) and `validate()` (body); a route that reads its own body is not behind the body scan (section 3, Module B). A public route with a path parameter (`verify`, `verify-certificate`) refuses a malformed token by its own check (400).
- **Test notes:** the report of a run that holds a NUL character in its own output is binary to `grep`: read it with `grep -a`. `pkill -f` with a pattern that is also in its own command line kills the command itself.
- **Not done here (written down privately, the repository is public):** items the review found outside these areas.

## 6. Output & Deliverables
- **Pull requests, all into `dev`:**

| PR | Branch | Merge commit | Merged (UTC) |
|---|---|---|---|
| #47 | `claude/fix-malformed-path-is-400` | `fef1c13` | 2026-10-20 23:47:42 |
| #48 | `claude/fix-two-load-sensitive-tests` (two commits) | `ba7e48f` | 2026-10-21 00:04:24 |
| #49 | `claude/fix-nul-in-input` | `cf32c30` | 2026-10-21 00:28:14 |

- **Merge gate used:** state open, `base.ref` is `dev`, the head is the commit that was tested, the Vercel check is SUCCESS, GitHub reports the PR mergeable; applied by a script that refuses unless every condition holds. The remote branches are kept.
- **Docs:** `docs/functions/shared.md`, this file, `docs/tasks/current-tasks.md`, `docs/development-history/octalve_edu_progress.md`, `docs/HANDOVER.md`, `CLAUDE.md`.
