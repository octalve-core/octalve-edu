# 0037: The payment gate on report cards — a school can hold a card back from a pupil who owes fees

- **Period / Focus:** 2026-11-10 (report cards; ported from AlEemaan's task 0028, with Octalve's settings and finance)
- **Status:** Built; PR into `dev`
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-report-card-gate` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A school may choose not to release a pupil's report card to the pupil and their parents while school fees are owed. It is the school's choice, off until the school turns it on, and staff are never held back from the card.

## 2. Context

- AlEemaan (task 0028) has a superadmin setting `block_unpaid_report_cards` (off by default); when on, a pupil or parent is refused the card and told what is owed; staff always read it.
- Octalve's card is `getStudentReportCard`; STUDENT and PARENT roles read it through the same API. There is no pupil or parent results screen yet, so the gate is enforced in the API where they would meet it (and in the PDF, task 0038).
- Octalve keeps on/off school settings as "ceiling switches" over `TenantSetting` (`src/lib/settings/ceiling-switch.ts`): the school's value is the ceiling and a campus can only narrow it; the school's value is changed by the administrator with a fresh proof; every change is audited; each has a route under `settings/` and a `SwitchSettingPanel` on the Settings page.
- An invoice's `totalAmount` is already net of discounts; its status is UNPAID, PARTIALLY_PAID, PAID or WAIVED; it has an optional `dueDate`.

## 3. Decisions

- **D1. A ceiling switch, read the other way round.** Key `results.reportCardsOpen`: ON (the default, nothing stored) means report cards are released whatever is owed; OFF means they are held for pupils who owe. A ceiling switch is "on only when the school AND the campus are on", so the school turning it off holds cards everywhere, a campus can turn it off for itself and can never turn it back on where the school has it off: exactly "a campus may only tighten". Audit action `REPORT_CARD_GATE_CHANGED`. The school's value is the administrator's, with a fresh proof; a campus's own is its administrator's, with none.
- **D2. Who is held.** A STUDENT or a PARENT, for the pupil's card. Staff (administrator, teachers, non-teaching staff) are never held. The gate is judged for the pupil's own campus (the pupil's campus, else the school's value alone).
- **D3. What counts as owed.** The pupil's school-fee invoices that are UNPAID or PARTIALLY_PAID and **due** (no due date, or the due date has passed), summed as total minus paid. A WAIVED or PAID invoice owes nothing; an invoice issued in advance for a later term and not yet due does not hold this term's card (a parent should not lose a card for next term's bill). Program fees (a different ledger) are not school fees and do not count.
- **D4. The refusal says what to do.** 403 `REPORT_CARD_WITHHELD` with "This report card is being held until the outstanding school fees of ₦X are paid. Please contact the school office.", the amount formatted as everywhere else in the app.
- **D5. Staff are told, not blocked.** When the gate is on for the pupil's campus and the pupil owes, the card API gives staff `feeHold: { outstanding }` and the Cards panel shows "This card is held from the pupil and their parents until ₦X is paid." so nobody is surprised that a parent cannot open it. Otherwise `feeHold` is null. A pupil or parent never receives it: they receive the refusal.
- **D6. Fail closed on a question the server cannot answer.** The gate is read in the same transaction as the card; an error is an error (500), never a card released.

## 4. Work breakdown

- [x] Rules (`src/lib/results/fee-hold.ts`, pure): what is owed from invoices and today's date.
- [x] The switch (`results.reportCardsOpen`), its route `settings/report-cards`, the panel on the Settings page.
- [x] `getStudentReportCard`: refuse a STUDENT or PARENT; `feeHold` for staff.
- [x] The Cards panel notice.
- [x] Tests: unit (what is owed), API (every role, the school and a campus value, every invoice state, the due date, the setting's own rules), screens (the setting and the notice, desktop and phone, both themes).
- [x] Docs: tracker, HANDOVER, catalogues, CLAUDE.md banner.

## 5. Not in this task

- A pupil or parent results screen (the API and PDF are where they meet the gate).
- A per-pupil exemption ("release this one card anyway"): release the card by turning the setting off for the campus, or settle or waive the invoice.
- Holding anything else for unpaid fees (the portal, the results by token on the public verification page, which show a grade and no fees).

## 6. Build record and tests (2026-11-10)

**What changed.** No migration: the setting is a row of the existing `TenantSetting` table. `src/lib/results/fee-hold.ts` and `report-card-gate.ts` (new), `service.ts` (`getStudentReportCard` refuses a STUDENT or PARENT while the card is held and gives staff `feeHold`), `http.ts` (`REPORT_CARD_WITHHELD`, 403) and the report-card route (passes the sentence through), the route `GET`/`PATCH /api/v1/schools/[code]/settings/report-cards` (new), `ReportCardGatePanel.tsx` (new) mounted on the Settings page (not in a support view), the Cards panel notice, `model.ts`.

**Deployment.** Nothing to run: no migration. The gate is off for every school until its administrator turns it on, so deploying changes nothing for anyone.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors; `pnpm build` OK; Prettier clean on every file changed; catalogues in sync.

**Tests (one lane, one worker, the production build).**
- Unit `fee-hold` (new): what is owed (unpaid, part-paid, paid, waived, due today, not yet due, no due date, several invoices, an overpayment, exact in kobo) and the words.
- API `report-card-gate` (new): off by default; a pupil and a parent refused with the amount and what to do and no mark in the refusal; staff read the card and are told what holds it; a pupil who owes nothing is not held (no invoice, paid, waived); what counts (a part-paid balance, the sum of due invoices, an invoice not yet due); judged per pupil; released the moment the setting is turned back on or the invoice is paid; a pupil with no campus; a campus that holds its own pupils' cards and no others; a campus cannot release what the school holds and cannot touch another campus; who may change it (the school's administrator with a fresh proof, a campus administrator for their own campus with none, nobody else, nobody signed out, another school's administrator); every change audited, an unchanged save writes nothing, `null` restores the default.
- Screens `report-card-gate-screens` (3 tests, desktop and phone, new): the school turns the hold on with its password and the setting reads back in words (and can be turned off again); staff see the notice on a held card (and it is not printed); no notice when nothing is owed. Axe (WCAG 2.2 A/AA) and horizontal overflow in both themes.
- **Mutation check.** In a copy, four things were broken (the gate never applied; held by default; due dates ignored; a waived invoice counted). After a rebuild **11 of the new tests failed**; the copy was restored.
- **Regression:** the whole `unit` and `api` projects and the related screens (`results-screens`, `report-remarks-screens`, `finance-standing-screens` and the new ones) on the final build: **2,705 passed, 2 failed.** Both failures were this task's: the new settings route was not registered in two guards' lists (`unit/route-area-guard`: a GET route declares a support area or is listed as out of reach with a reason; `unit/route-role-guard`: a handler that lets a campus administrator write says where the campus is checked). Registered with their reasons (the same ones the standing switch gives); the three guard specs then passed (12 tests).
- **Not run:** the rest of the browser suite, the HTTPS project, anything against a hosted database.

**Left for the maintainer.** There is no pupil or parent results screen yet, so the hold is seen by a pupil or parent through the API only (and the PDF of task 0038); a screen for them is a separate piece of work. Turning the setting on is the school's decision: it holds cards for pupils who owe fees that are due.
