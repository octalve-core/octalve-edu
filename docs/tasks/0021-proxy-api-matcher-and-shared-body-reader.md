# 0021: The proxy must not make Next wait for an API request body, and one shared reader for a request body

- **Period / Focus:** 2026-10-21 onward (found while verifying slice 1 of task 0020 and starting the shared body reader)
- **Status:** In progress (module A merged as PR #56; module B, the reader, is verified and its PR is open; module C, AlEemaan, not started)
- **Priority:** High (a failing test on `dev`)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** `dev`; module A: PR #56 (merged); module B: branch `claude/shared-body-reader`
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
- [x] Limit the API entry of the matcher in `src/proxy.ts` to paths that can be malformed, i.e. that contain a percent sign (for example `{ source: "/api/(.*%.*)" }`); check by running that an ordinary API request no longer goes through the proxy and that a malformed one still gets its 400.
- [x] Re-run `tests/api/malformed-path.spec.ts`, `tests/integration/proxy.spec.ts` and `tests/api/body-cap-chunked.spec.ts`; the stall test is the failing-first evidence (it fails today on `dev`).
- [x] Comment in `src/proxy.ts` on why the API entry is narrow (a proxied request is buffered to its end).

### Module B: the shared reader (`claude/shared-body-reader`, verified)
- [x] Written: `readJsonBody()` in `src/lib/api/validate.ts`; the 16 routes that read their own body, the payment webhook and the student restore route use the shared reading; `tests/unit/route-body-guard.spec.ts`, `tests/api/own-body-routes.spec.ts`, +1 `setup.spec.ts`, +3 chunked stalls in `body-cap-chunked.spec.ts`, +6 unit tests, the profile test's NUL wording; catalog rows.
- [x] Worktree re-created, `pnpm build`, the specs named above, then the whole setup, unit, integration and api projects on lane 6: 1929 passed, 0 failed; commit reworded; PR into `dev`.
- [ ] Merge after Vercel.
- [x] Failing first on a production build of the old routes (the new and changed specs copied onto it): 14 of 52 failed (6 `readJsonBody` unit tests and the 2 guard tests, because the reader and its guard do not exist there; the sweep and the restore route's cap; the three chunked stalls, no answer within 20 s; the setup cap), 38 passed as controls.

### Module C: AlEemaan
- [ ] Check its proxy matcher and chunked-body tests (above); the same fix if it fails. Port the shared reader (its `req.json()` routes answer 500 for a body that is not JSON: see its `docs/HANDOVER.md`).

## 4. Unified Verification & Quality Gates
- [x] Failing-first for Module A: the stall test failed on `dev` (seen alone, twice, on two builds); passes with the fix.
- [x] `pnpm build`, prettier, eslint, the catalogs, the whole setup, unit, integration and api projects (module B: 1929 passed, 0 failed). NOT run: the e2e and https projects.

## 5. Notes
- In Octalve the 16 routes already answered 400 for a body that is not JSON (each had its own try/catch); the reader's gain is the bounded read, the NUL scan and one guard test. In AlEemaan the same routes answer 500.

## 6. Output & Deliverables
- Module A: PR #56, merged. Module B: PR open.
