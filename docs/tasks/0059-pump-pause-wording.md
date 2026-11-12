# 0059: The sending line said "the server could not be reached" when another screen was sending the rest

- **Period / Focus:** 2026-11-12 (a known flaw of task 0058, recorded in its tracker entry and PR; the maintainer asked for the flaws and gaps to be fixed)
- **Status:** Done
- **Priority:** Low (wording only; no message is lost either way)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-pump-pause-wording` / PR into `dev`
- **Started:** 2026-11-12

> Written after the five-line change, not before it: the fix is small and the failing test was written and run first (section 3). It is AlEemaan's task 0067, applied to this app's own copy of the hook.

## 1. Objective

The hook `useQueuePump` stops after five calls in a row that claimed nothing (another screen, or another tab, is sending the due messages). It then showed the same "paused" line as when the server cannot be reached ("Sending is paused at 0 of 8: the server could not be reached"), which is false: the server answered every call.

## 2. Decision

The paused state carries a reason: `unreachable` (three calls in a row got no answer or an error) or `elsewhere` (the server answered, but nothing could be claimed). The line says "another screen is sending the rest. Nothing is lost; choose Try again to check on it." for the second and keeps its wording for the first. "Try again" is the same button for both.

## 3. Build record and tests

- **Test first, on the unfixed build (lane 1, `origin/dev` 651fbc4 plus the new test):** `tests/e2e/communication-batches.spec.ts`, desktop: **4 passed, 1 failed.** The new test (every call answered "nothing claimed, 8 due") failed on "Sending is paused at 0 of 8: another screen is sending the rest". The existing "cannot be reached" test now also checks the full sentence and passed.
- **Fixed build (lane 1): 9 passed, 0 failed** (setup, desktop and phone): the four tests of the spec in each project, including the new one. `tsc --noEmit` exit 0 (after `prisma generate` in the fresh worktree); eslint on the changed files exit 0; Prettier clean on the changed files; the catalogue check clean (850 rows).
- **Not run:** the whole suite; mutation passes (deferred).
