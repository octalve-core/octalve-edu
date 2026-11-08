# 0029: Part payment "if allowed" (the Octalve Edu port of AlEemaan's task 0046)

- **Period / Focus:** design written 2026-11-04 (docs only); requested by the maintainer on 2026-11-03 for AlEemaan ("a person can also pay part payment if allowed"). The source is AlEemaan's `docs/tasks/0046-part-payment.md` (built and tested on its branch `claude/programs-p1`).
- **Status:** F1 (the column, the rule, the settings, the enforcement in both payment paths, the routes, the lock) built 2026-11-08 on `claude/octalve-parity`, not yet tested or merged; F2 (the screens) is blocked because Octalve has no mounted Finance page (section 5). Waiting for the migration `20261114090000_tenant_settings_part_payment` on the hosted databases.
- **Priority:** Medium
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch and one PR off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
Whether an invoice may be paid in parts becomes a rule the school controls: on or off, with an optional smallest part (an amount or a percentage of the invoice), a school-wide value that a campus can only tighten, and a way to say "this one invoice must be paid in full". The default keeps what happens today.

## 2. What is the same, and what is not (read from the code on 2026-11-04)
Same (see AlEemaan's 0046): the pure rule `checkPart` (the payment that settles the balance exactly is always allowed), the policy and the ceiling (strictest of school and campus), `Invoice.payInFull`, enforcement **inside the transaction** of the two places a payment is started or recorded, and **never** in the webhook path (money already taken is never refused).

Different, on purpose:
1. **Where it is enforced.** Octalve's functions are `initializePayment(tenantId, invoiceId, userEmail, amount?)` and `recordManualPayment`, both under `forTenant(tenantId).transaction`; `fulfillPayment` and `processPaystackWebhook` are the paths that must stay untouched; `confirmPaymentForRequester` (ISS-0029: who may confirm which reference) is read before building, to be sure it cannot be used to settle a part the rule would have refused.
2. **Who may set it.** ADR 0016 says a campus administrator may *not* configure fees (structures, discounts, invoice generation) but may record manual payments. The part-payment rule is fee configuration, so here **only an `ADMIN` sets the school's rule and a campus's stricter rule**, and a `CAMPUS_ADMIN` only reads it; "pay in full" on one invoice is also an `ADMIN`'s. If the maintainer wants a campus administrator to tighten their own campus's rule, as AlEemaan's branch administrator can, it is one switch in the service.
3. **Row lock and the double-take race.** AlEemaan found that two payments recorded at the same moment could together take more than an invoice's balance, because the invoice was read without a lock; its fix (`SELECT ... FOR UPDATE` at the start of both paths) also makes the rule hold under a race. Octalve's task 0022 fixed invoice numbers under concurrency, not this. Before building, read `recordManualPayment` and `initializePayment` for the same hole; if it is there, fix it with the lock and a test, as its own commit and bug note.
4. **The settings store** is the generic tenant-and-campus table that task 0027 adds (P0); a change of the school-wide value uses the existing step-up proof.
5. **Tenant and RLS.** `Invoice.payInFull` is one column with a default (additive); no new table.

## 3. Work breakdown
- [x] F1 Migration (`Invoice.payInFull`); the pure rule and the policy; the settings service and route; enforcement in the two payment paths; the invoice flag route
- [ ] F2 The Finance screens (payment rules, the record-payment dialog, the invoice detail)
- [ ] Tests: unit (the rule table, the policy ceiling), API (both payment paths, the race, the webhook still accepts, who may edit, campus isolation), the route-role-guard source test, browser (both themes, phone)

## 4. Not in this task
A pay button for a payer, instalment schedules, reminders for the next part, late fees; the same exclusions as AlEemaan's 0046. Program invoices come with the fees slice of task 0027.

## 5. Build record (2026-11-08)
**What exists.** The migration `20261114090000_tenant_settings_part_payment` (additive: `Invoice.payInFull`, and the generic `TenantSetting` table of task 0027 slice P0 with row-level security, composite keys, a key-name check, a size check and one value per school, campus and key). `src/lib/finance/part-payment.ts` (the pure rule, ported word for word with "campus" for "branch"), `part-payment-service.ts` (the stored policy, `setPolicy`, `setPayInFull`, `partPaymentFor`), `part-payment-validation.ts`, `GET/PATCH /api/v1/schools/[code]/settings/part-payment`, `PATCH .../finance/invoices/[id]/pay-in-full`, and the enforcement and the row lock in `initializePayment` and `recordManualPayment`. `GET .../finance/invoices/[id]` now also returns `partPayment` (the sentence, the smallest part for this invoice and the flag).

**Decisions made while building.**
- The double-take race was there. `recordManualPayment` read the invoice without a lock and did not refuse more than the balance up front (only the status calculation later); `initializePayment` read it without a lock. Both now lock the invoice row (`FOR UPDATE`) first, and the manual path refuses more than the balance with the same words the online path always used. This is the "fix it first" the design asked for; it is in the same commit as the rule because the rule needs the lock to hold under a race.
- Only an `ADMIN` changes the rule, the school's and a campus's, and the invoice's "pay in full" (ADR 0016: fee configuration). A campus administrator and a bursar read the rule; the school's administrator sees every campus.
- The school's own rule needs the fresh proof (`stepUp`, the existing one); a campus's tightening does not (task 0027 section 2, point 6).
- `fulfillPayment` and the webhook are untouched: money already taken is never refused (tested by starting a payment, changing the rule and delivering the webhook).
- A campus's value must be at least as strict as the school's, kind by kind; a looser value that got into the table by hand is ignored (the stricter of the two applies).
- A campus may turn part payments OFF whatever smallest part the school has: paying in full is stricter than any smallest part (the first draft refused it as "removing the smallest part"; found by the API test and fixed in `tighterThan`).
- The sentence for a settings screen names ONE amount and ONE percentage at most: two amounts (the school's and the campus's) are shown as the larger, since that is the one that applies. An amount and a percentage stay two ("whichever is more"), because which is larger depends on the invoice.
- A smallest part given as a percentage may have up to two decimals (12.5 is valid, 12.345 is refused), the same strict reading as for an amount.

**Tested (2026-11-08, test lane 4; order tsc, lint, build, tests).** tsc clean, lint 0 errors (6 old warnings in files this work does not touch), production build OK. Unit project 837/837, integration project 691/691, the whole API project 1,383 passed / 2 failed, the browser specs for the Forms screens and sign-in 79 passed / 2 skipped (desktop and phone). The 2 API failures (`nul-in-input` on `portal/practice/children`, and the route table of `question-bank-parity-gates`, which lacks 10 Forms routes that exist) are NOT from this work: they fail the same way on a clean build of the base commit 455f3a0 (lane 5). Failing-first: the new API specs were copied onto that unfixed base build and all 49 fail there (the code is not there), then pass here. NOT run: the full browser suite and the HTTPS project (no screen was built; the portal and sign-in specs were run), a hosted database.

**Not built.** F2, the screens: Octalve has finance components (`src/components/finance/`) but no page mounts them and the sidebar has no Finance entry, so there is nowhere yet to put "Payment rules", the record-payment sentence or the "pay in full" switch. Mounting a Finance page is a task of its own (a decision for the maintainer). Not run yet: the tests (see section 6).
