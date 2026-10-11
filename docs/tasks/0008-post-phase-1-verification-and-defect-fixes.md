# [0008]: Post-Phase-1 verification and defect fixes

- **Period / Focus:** 2026-10-11 (verify what Phase 1.3–1.8 claimed, fix what the review found)
- **Status:** In Progress — full suite finished 2026-10-11: 1728 passed, 6 failed, 23 skipped (stale e2e tests, below)
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/phase-1-3-attendance` (HEAD `ddfb1c6`) / no PR yet
- **Started:** 2026-10-11 UTC
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Know the real test state of the Phase 1 stack (1.2–1.8, merged only into feature branches), then fix the defects found by code review, each with a test that fails first, and land the stack through `dev`.

## 2. Context & Related Docs
- ADR 0011 (`dev`/`master`/`prod`; `dev` does not exist yet), ADR 0013 (comprehensive messages), ADR 0007 (mutation passes at end of Phase 2).
- The previous AI reported "all quality gates green" listing only unit, RLS, build, typecheck, lint, format and `tasks:check`; the API and e2e suites for 1.3–1.8 were not shown.
- `fork/master` stops at PR #12; PRs #13–#17 merged into each other's feature branches.

---

## 3. Work Breakdown

### Module A: Verification
- [x] Static gate on the newest tree: typecheck, lint, format:check clean (2026-10-11)
- [x] `pnpm build` then the whole suite, one lane (`TEST_LANE=1 TEST_TIMEOUT_SCALE=3`), on `claude/phase-1-3-attendance` HEAD `ddfb1c6`, 1.5 h: **1728 passed, 6 failed, 23 skipped** (the skips are viewport-specific tests that skip themselves on the other project)
- [x] The 6 failures are all stale e2e expectations, none an application defect, but they show the earlier "all green" claims did not include the e2e suite: (1) `academics.spec.ts:51` (desktop + phone): the page now has a fifth section, *Attendance* (added in 1.3), the test still expects four; (2) `academics.spec.ts:69` (desktop + phone): the staff read-only test lands on Attendance instead of Sessions, so "Sessions" is not found; (3) `shell.spec.ts:39` (desktop) and `shell.spec.ts:208` (phone): *Settings* is now a link (1.7) while the tests still expect "coming soon" text. Fixing the tests is part of this task (ISS-0012).

### Module A2: Stale tests the suite exposed
- [ ] Update `academics.spec.ts` (five sections, Attendance first) and `shell.spec.ts` (Settings is a link) to match the shipped behaviour, then re-run those specs on desktop and phone

### Module B: Defects found by reading (not yet reproduced)
- [x] Finance: `receiptNo` from a count of successful payments, no unique constraint → duplicate receipt numbers under concurrency; manual payment accepts a client `receiptNo`
- [x] Finance: webhook returns 200 when fulfilment fails and leaves the event unprocessed → a lost payment is never retried
- [x] Finance: webhook route falls back to the public secret `test_mock_secret_key`; invalid deliveries still write rows; `evt_${Date.now()}` ids can collide
- [x] Finance: manual-payment route returns raw `err.message` (all seven finance routes now use `financeFailure`)
- [ ] Results: `transition` open to every `TEACHING_STAFF` for any result (no ownership/campus check); a teacher can revert APPROVED→SUBMITTED; approver can approve their own entries
- [ ] Results: `approvedByStaffId`/`enteredByStaffId` hold user ids, no foreign key
- [ ] Results: public verification returns admission number + surname (decide with the maintainer)

### Module C: Landing
- [ ] Create `dev` on octalve-core and the fork; retarget the stack; one `dev` → `master` PR (needs the maintainer's approval)

---

## 4. Unified Verification & Quality Gates
- [x] `tsc --noEmit` / typecheck clean (0 errors) on `ddfb1c6`
- [x] Lint & formatting clean on `ddfb1c6`
- [x] full suite: 1728 passed / 6 failed (stale tests) / 23 skipped — see Module A
- [ ] Each fix: test fails first, then passes

---

## 5. Notes, Findings & Deviations
- Mutation passes: not run — pending, end of Phase 2.

## 6. Output & Deliverables
- **Commits:** —
- **PR:** —
- **Docs:** this file

- 2026-10-11: F2/F3/F3a/F4 done on `claude/fix-phase-1-review-findings`: `unit/paystack-mode` 7, `unit/finance-paystack`, `integration/finance-webhook` 4, `api/finance` + `api/finance-adversarial` 14 passed (finance subset: 70 passed, 0 failed incl. IDOR audit and rules); typecheck, lint, format:check clean. The new webhook/integration tests were not run against the old code (the old shapes differ, so they could not have passed). Still to do: F1 receipt numbers (migration), F5 results transitions, the 6 stale e2e tests, then the full suite.
- 2026-10-11: F1 done: reproduced first (25 concurrent fulfilments → 9 distinct receipt numbers), then migration `20261021090000_receipt_counter` (counter table + RLS, duplicates renamed `-Rn`, partial unique index, counter seeded from the highest issued number), `allocateReceiptNo`, supplied numbers must be unused (409). `integration/finance-receipts` 4, `finance-webhook` 4, `rls` 68: 76 passed, 0 failed. Found and fixed on the way: my first draft of the migration called `app_grant_runtime_privileges()`, which re-granted UPDATE/DELETE on the append-only audit tables; two RLS tests caught it. Not applied to the `octalve_edu` dev database yet.
