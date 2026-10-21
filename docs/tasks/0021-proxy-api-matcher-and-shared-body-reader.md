# 0021: The proxy must not make Next wait for an API request body, and one shared reader for a request body

- **Period / Focus:** 2026-10-21 onward (found while verifying slice 1 of task 0020 and starting the shared body reader)
- **Status:** Pending (nothing of the proxy fix is written; the reader is a pushed work-in-progress branch, not verified)
- **Priority:** High (a failing test on `dev`)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** the proxy fix: a new branch off `dev`; the reader: `claude/fix-own-body-reader` (pushed, one commit `c8466f7`, no PR)
- **Started:** 2026-10-21 (probing); **Ended:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
(a) A request body that never ends is answered with the route's own refusal (413) again, as before PR #47. (b) Every route that reads its own request body reads it in one shared way: bounded, parsed once, a NUL character refused, a body that is not JSON a 400.

## 2. Context & Related Docs
- `tests/api/body-cap-chunked.spec.ts` "a chunked body that passes the cap and then stalls still gets its 413" fails ALONE on `dev` (no answer within 20 s); it passed in task 0017's runs, so the regression came after: PR #47 (`src/proxy.ts`, the matcher entry `{ source: "/api/:path*" }`). Cause, read in `node_modules/next/dist/server/body-streams.js`: for a request that goes through the proxy Next clones the body and `finalize()` awaits the request's `end` before the route runs, so a body that never ends is never answered and the routes' own cap never gets its say.
- **AlEemaan has the identical matcher entry** (`src/proxy.ts`, added by its twin of #47) and is probably affected the same way; NOT verified there: run its chunked-body test (task 0034, `tests/unit` and `tests/api` of its bounded body read) on a production build before changing anything.
- Task 0019 (the malformed-path rule that needs the proxy for `/api`), task 0017 (the bounded body read), `HANDOVER.md` section 6 "Start here".

## 3. Work Breakdown
### Module A: the proxy (do this first)
- [ ] Limit the API entry of the matcher in `src/proxy.ts` to paths that can be malformed, i.e. that contain a percent sign (for example `{ source: "/api/(.*%.*)" }`); check by running that an ordinary API request no longer goes through the proxy and that a malformed one still gets its 400.
- [ ] Re-run `tests/api/malformed-path.spec.ts`, `tests/integration/proxy.spec.ts` and `tests/api/body-cap-chunked.spec.ts`; the stall test is the failing-first evidence (it fails today on `dev`).
- [ ] Comment in `src/proxy.ts` on why the API entry is narrow (a proxied request is buffered to its end).

### Module B: the shared reader (`claude/fix-own-body-reader`, `c8466f7`, NOT verified)
- [x] Written: `readJsonBody()` in `src/lib/api/validate.ts`; the 16 routes that read their own body, the payment webhook and the student restore route use the shared reading; `tests/unit/route-body-guard.spec.ts`, `tests/api/own-body-routes.spec.ts`, +1 `setup.spec.ts`, +3 chunked stalls in `body-cap-chunked.spec.ts`, +6 unit tests, the profile test's NUL wording; catalog rows.
- [ ] Re-create the worktree (`git worktree add ../octalve-edu-body claude/fix-own-body-reader`), `pnpm install --frozen-lockfile`, copy `.env`, `pnpm build`, run the specs named above, then the whole setup, unit, integration and api projects on your own lane; reword the commit (what, why, decisions, tests run and not run); PR into `dev`; merge after Vercel.
- [ ] A lane-4 run of ten spec files on the branch (before the last edit of the profile test) gave 220 passed and 5 failed: the profile NUL-wording test (fixed after the run) and the four chunked stalls (they need Module A).

### Module C: AlEemaan
- [ ] Check its proxy matcher and chunked-body tests (above); the same fix if it fails. Port the shared reader (its `req.json()` routes answer 500 for a body that is not JSON: see its `docs/HANDOVER.md`).

## 4. Unified Verification & Quality Gates
- [ ] Failing-first for Module A: the stall test fails on `dev` today (seen alone, twice, on two builds).
- [ ] `pnpm build`, prettier, the catalogs, the whole unit, integration and api projects.

## 5. Notes
- In Octalve the 16 routes already answered 400 for a body that is not JSON (each had its own try/catch); the reader's gain is the bounded read, the NUL scan and one guard test. In AlEemaan the same routes answer 500.

## 6. Output & Deliverables
- Not started: no PR.
