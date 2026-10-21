# 0022: Invoice numbers are unique under concurrency (ISS-0030)

- **Period / Focus:** 2026-10-21 (register row ISS-0030, found while fixing ISS-0025)
- **Status:** Completed on the branch (verified below; PR open)
- **Priority:** Medium (money records; a failed bill run, not a wrong charge)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** `dev`; branch `claude/fix-invoice-numbers`
- **Started:** 2026-10-21; **Ended:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Two bill runs for one school at the same moment never take the same invoice number, never fail on the unique index (`@@unique([tenantId, invoiceNo])`) and never bill a pupil twice; and a number that is already used is passed over, not an error.

## 2. Context & Related Docs
- `generateInvoicesForPeriod` (`src/lib/finance/service.ts`) took the next number from `count(invoices of the school) + 1`. Receipt numbers (ISS-0001) already come from a per-school-and-year counter row and certificate numbers from a per-school advisory lock; invoice numbers were the one family left on a count.
- The unique index means a second run that took the same number did not write a duplicate: it failed, the bill run answered a server error, and nothing of that run was kept. A count also reuses a number when an invoice has been removed, or collides with one typed by hand.
- Register row: `docs/issues/README.md` ISS-0030. The public register never carries the steps that trigger a problem, and neither does this file.

## 3. Work Breakdown
- [x] `generateInvoicesForPeriod` takes `pg_advisory_xact_lock` on `invoice-number:<school>` first, so one bill run per school runs at a time (the pattern of certificate numbers). A second run for the same term then finds the first run's invoices (the existing idempotency check) and skips them.
- [x] `allocateInvoiceNo`: one past the number of invoices the school holds, and on past any number already used (at most 50 times, then the run is refused and rolled back with a `FinanceRefusal`), like `allocateReceiptNo`.
- [x] `tests/integration/invoice-numbers.spec.ts` (3 tests): two runs for different terms at the same moment; two runs for the same term at the same moment; a number already used is skipped.
- [x] Docs: `docs/issues/README.md` (ISS-0030), `docs/functions/school-app.md` (service row), `docs/tasks/current-tasks.md`, the progress tracker.
- [ ] Not done, on purpose: the number is still `count + 1` rather than a counter row (no migration). The format and the numbers of existing invoices do not change.

## 4. Unified Verification & Quality Gates
- Failing first (the new spec on the unfixed `generateInvoicesForPeriod`): all 3 tests failed.
- On the branch: the 3 new tests pass; `tests/integration/phase-1-lifecycle-walk.spec.ts` (it bills a term) 10 of 10 pass; the finance API specs (`finance`, `campus-admin-finance`, `idor-audit`) 38 passed; `tsc`, eslint, prettier, the catalogs (415 rows) and `pnpm build` are clean.
- Not run: the whole setup, unit, integration and api projects and the e2e and https projects on the branch; a full suite on the merged `dev`.

## 5. Notes
- Another route that creates invoices would have to take the same lock; today `generateInvoicesForPeriod` is the only place that creates one (`src/app/api/v1/schools/[code]/finance/invoices/route.ts` calls it).
