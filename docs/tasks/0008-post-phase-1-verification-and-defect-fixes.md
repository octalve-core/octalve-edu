# [0008]: Post-Phase-1 verification and defect fixes

- **Period / Focus:** 2026-10-11 (verify what Phase 1.3–1.8 claimed, fix what the review found)
- **Status:** In Progress — **(running)** full one-lane suite on `claude/phase-1-3-attendance`
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
- [~] **(running)** `pnpm build` then the whole suite, one lane (`TEST_LANE=1 TEST_TIMEOUT_SCALE=3`), 1,757 tests, started 2026-10-11 ~10:20 local; output in the scratchpad `full-run.txt`
- [ ] Record the real result here (passed / failed / skipped, and every failure's cause)

### Module B: Defects found by reading (not yet reproduced)
- [ ] Finance: `receiptNo` from a count of successful payments, no unique constraint → duplicate receipt numbers under concurrency; manual payment accepts a client `receiptNo`
- [ ] Finance: webhook returns 200 when fulfilment fails and leaves the event unprocessed → a lost payment is never retried
- [ ] Finance: webhook route falls back to the public secret `test_mock_secret_key`; invalid deliveries still write rows; `evt_${Date.now()}` ids can collide
- [ ] Finance: manual-payment route returns raw `err.message`
- [ ] Results: `transition` open to every `TEACHING_STAFF` for any result (no ownership/campus check); a teacher can revert APPROVED→SUBMITTED; approver can approve their own entries
- [ ] Results: `approvedByStaffId`/`enteredByStaffId` hold user ids, no foreign key
- [ ] Results: public verification returns admission number + surname (decide with the maintainer)

### Module C: Landing
- [ ] Create `dev` on octalve-core and the fork; retarget the stack; one `dev` → `master` PR (needs the maintainer's approval)

---

## 4. Unified Verification & Quality Gates
- [x] `tsc --noEmit` / typecheck clean (0 errors) on `ddfb1c6`
- [x] Lint & formatting clean on `ddfb1c6`
- [~] **(running)** full suite — result not known yet
- [ ] Each fix: test fails first, then passes

---

## 5. Notes, Findings & Deviations
- Mutation passes: not run — pending, end of Phase 2.

## 6. Output & Deliverables
- **Commits:** —
- **PR:** —
- **Docs:** this file
