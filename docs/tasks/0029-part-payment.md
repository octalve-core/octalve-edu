# 0029: Part payment "if allowed" (the Octalve Edu port of AlEemaan's task 0046)

- **Period / Focus:** design written 2026-11-04 (docs only); requested by the maintainer on 2026-11-03 for AlEemaan ("a person can also pay part payment if allowed"). The source is AlEemaan's `docs/tasks/0046-part-payment.md` (built and tested on its branch `claude/programs-p1`).
- **Status:** Design only. Nothing is built here.
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
- [ ] F1 Migration (`Invoice.payInFull`); the pure rule and the policy; the settings service and route; enforcement in the two payment paths; the invoice flag route
- [ ] F2 The Finance screens (payment rules, the record-payment dialog, the invoice detail)
- [ ] Tests: unit (the rule table, the policy ceiling), API (both payment paths, the race, the webhook still accepts, who may edit, campus isolation), the route-role-guard source test, browser (both themes, phone)

## 4. Not in this task
A pay button for a payer, instalment schedules, reminders for the next part, late fees; the same exclusions as AlEemaan's 0046. Program invoices come with the fees slice of task 0027.
