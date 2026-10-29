# 0023: Who may confirm which payment reference (ISS-0029)

- **Period / Focus:** 2026-10-22 (register row ISS-0029, seen while fixing ISS-0025)
- **Status:** Completed: merged into `dev` as PR #60 (`108849e`)
- **Priority:** High (money route; a member of a school could read another family's payment and invoice ids)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** `dev`; branch `claude/fix-payment-status-access`
- **Started:** 2026-10-22; **Ended:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
`GET /finance/payments/[ref]/status` confirms a payment with the gateway and fulfils it. Only a member who may see the payment's invoice (finance staff, the pupil, a linked guardian) can confirm it; a reference that is unknown, belongs to another school, or is not theirs is the one refusal of an unconfirmed payment, with no ids; and the gateway is not asked for a reference the member may not confirm.

## 2. Context & Related Docs
- The route was open to every role of the school. Any member (a pupil, a teacher, another family's guardian) who knew or guessed a reference of the school was answered with the `paymentId` and `invoiceId` of that payment.
- `fulfillPayment` looked the reference up across schools, so a reference of ANOTHER school answered 404 where an unknown one answered 400: the two answers showed that the reference exists.
- The visibility rule for invoices already exists (`invoiceVisibility(requester)`, used by `getStudentInvoice` and the invoice list); the route now uses the same rule, so a payment is as visible as its invoice.
- Register row: `docs/issues/README.md` ISS-0029. The public register never carries the steps that trigger a problem, and neither does this file.

## 3. Work Breakdown
- [x] `confirmPaymentForRequester(tenantId, reference, requester)` in `src/lib/finance/service.ts`: looks the payment up inside this school, through `invoiceVisibility(requester)`; none found is a `FulfilmentRefusal` ("not found for this member") and the gateway is not asked; a payment already fulfilled answers `{ success, alreadyFulfilled: true, paymentId, invoiceId }`; otherwise `fulfillPayment`.
- [x] `fulfillPayment` with a school override first checks the reference exists in THAT school (`payment.count`), before any gateway call, so a reference of another school is refused as an unknown one.
- [x] The route calls `confirmPaymentForRequester` with the member's user, role, permissions and campus.
- [x] `tests/api/payment-status.spec.ts` (4 tests): guardian and administrator get the state; another family's guardian, another pupil and a teacher get the one refusal and `data: null`; a reference of another school equals an unknown one byte for byte; a payment the gateway has not confirmed stays PENDING and is refused for its own guardian too.
- [x] Docs: `docs/issues/README.md` (ISS-0029), `docs/functions/school-app.md` (service and route rows), `docs/tasks/current-tasks.md`, the progress tracker.
- [ ] Not done, on purpose: no rate limit on the route (as before); the webhook path (`processPaystackWebhook`) is unchanged, its credential is the signature.

## 4. Unified Verification & Quality Gates
- Failing first (the new spec on a production build of `dev`): the "another family's guardian, another pupil and a teacher" test and the "another school" test failed; the "own guardian and administrator" test passed as a control.
- On the branch: see the PR for the counts.
- Not run: the whole setup, unit, integration and api projects and the e2e and https projects on the branch; a full suite on the merged `dev`.

## 5. Notes
- The refusal is the same for every case a member must not be able to tell apart: unknown, another school's, not theirs. A payment the member may confirm but the gateway has not confirmed gets that refusal too, which cannot be told apart from the rest by design.
