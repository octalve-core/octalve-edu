# 0036: Report remarks — the teacher's and the principal's words on a pupil's report card

- **Period / Focus:** 2026-11-10 (report cards; ported from AlEemaan's task 0016/0028 area, with Octalve's access rules)
- **Status:** Built; PR into `dev`
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-report-remarks` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A report card carries two remarks for the term: the **teacher's** and the **principal's**. Task 0031 built the card without them ("not ported"). This task lets the right people write them, shows them on the card (screen and print), and shows a pupil or guardian only what is final.

## 2. Context

- AlEemaan keeps one row per pupil and term (`ReportRemark`), written by administrators, editable until any of the pupil's results for the term is published.
- Octalve's card is `getStudentReportCard` (`src/lib/results/service.ts`) behind `GET /api/v1/schools/[code]/people/students/[id]/report-card`; the staff screen is `CardsPanel` + `ReportCard`. Roles that read it: administrator, teaching and non-teaching staff, pupil, parent. A teacher reaches only the pupils of the arms they are assigned to (`assignedArmIds`), a campus rule limits staff to their campus.
- A result is DRAFT → SUBMITTED → APPROVED → PUBLISHED → LOCKED. A pupil or parent sees PUBLISHED results only.

## 3. Decisions

- **D1. One row per pupil and term, two remarks.** `ReportRemark(tenantId, studentId, periodId)` unique; `teacherRemark` and `principalRemark`, each text of 1 to 500 characters or null; who wrote each (`teacherRemarkByUserId`, `principalRemarkByUserId`); a row with both null is deleted, never stored (a check says one is present). Composite foreign keys to the pupil and the term, so a remark can never point at another school's pupil or term. Row-level security like every tenant table.
- **D2. Who writes what.** The **principal's** remark: the school administrator only (403 for anyone else, with a sentence). The **teacher's** remark: the administrator, or a teacher who is assigned to the pupil's arm for that term's session (by a subject assignment or a timetable slot, the rule the results list uses). A teacher who is not is answered with the 404 an unknown pupil gets (nothing confirmed), as the roll-call and result routes do. Non-teaching staff, pupils and parents write nothing. A campus administrator is not on the results role lists (open decision D7 of task 0031) and stays off.
- **D3. Editable until anything is published.** Once any of the pupil's results for the term is PUBLISHED or LOCKED the remarks are final: 409 with a sentence. This is AlEemaan's rule and it makes the visibility rule in D4 safe: whatever a pupil sees will not change under them.
- **D4. What a pupil or parent sees.** The remarks, only when at least one of the pupil's results for the term is published (exactly when D3 freezes them). Staff always see them, drafts included.
- **D5. A blank clears.** `null` or only spaces clears a remark; a key left out is left alone; at least one of the two keys must be present. Text is trimmed, `\r\n` becomes `\n`, other control characters are refused, 500 characters at most (the database checks length and non-blank too). Nothing else is trimmed or rewritten.
- **D6. Audited without the words.** `REPORT_REMARKS_SAVED` in the school's audit log with the pupil, the term and which remarks changed (set, changed or cleared), not the text: remarks are personal writing about a child and the card is the place to read them. A save that changes nothing is a 200 with `changed: false` and writes nothing.
- **D8. A bug of task 0031, found on the way and fixed.** The card showed a pupil or a parent PUBLISHED results only. A term's results go PUBLISHED, then LOCKED when the term is closed, and a locked result is a published one that can no longer change; so on the day the term was closed the pupil's card (and the class position, which counts the same results) went empty. A pupil or parent now sees PUBLISHED and LOCKED results, as the public verification page and the promotion rule already do. Failing first: the new API test fails on `dev` (the card's `subjects` is `[]`).
- **D9. No support `area`.** The route is state-changing, so it declares none (a support session is read-only; `unit/route-area-guard` enforces it).
- **D7. The card says what the viewer may do.** The card API returns `remarks: { teacher, principal, editable, canWriteTeacher, canWritePrincipal }` so the screen shows an editor only where a save will be accepted.

## 4. Work breakdown

- [x] Migration `20261125090000_report_remarks`; Prisma model.
- [x] Pure rules (`src/lib/results/remarks.ts`): the text clean-up, the permission matrix, what a viewer sees.
- [x] Service: save (access, freeze, upsert or delete, audit); the card reads them.
- [x] Route `PUT .../people/students/[id]/report-remarks`.
- [x] Screens: remarks on the card (screen and print), the editor in the Cards panel.
- [x] Tests: unit (rules), API (every role, every refusal, freeze, visibility, clearing, school boundary), screens (desktop and phone, both themes).
- [x] Docs: tracker, HANDOVER, catalogues, CLAUDE.md banner.

## 5. Not in this task

- A remark per subject (the card already has the grade remark per subject).
- Remark templates or a bank of phrases.
- The PDF of the card (task 0038 includes the remarks).

## 6. Build record and tests (2026-11-10)

**What changed.** Migration `20261125090000_report_remarks` (one new table, tenant-scoped, row-level security, composite keys; nothing existing changes); `src/lib/results/remarks.ts` and `remarks-service.ts` (new), `service.ts` (the card carries `remarks`; pupils and parents see PUBLISHED and LOCKED results: D8), the route `PUT /api/v1/schools/[code]/people/students/[id]/report-remarks` (new), `RemarksEditor.tsx` (new), `ReportCard.tsx` (the remarks, printed with the card), `CardsPanel.tsx` (the editor under the card), `model.ts`.

**Deployment.** Run `20261125090000_report_remarks` on the hosted databases after `20261124090000_streams`. Additive; the release before it never reads the table, so it can run before the code is deployed. The maintainer runs it; an AI session never does.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors; `pnpm build` OK; Prettier clean on every file changed; catalogues in sync.

**Tests (one lane, one worker, the production build).**
- Unit `report-remarks-rules` (new): the clean-up table, the permission matrix, who is shown what, the audit's change word.
- API `report-remarks` (new): who writes which remark (the administrator both with authors recorded; a teacher of the arm the teacher's only and nothing at all when the request also asks for the principal's; the teacher of another arm, and one who teaches nothing, told what an unknown pupil is told; non-teaching staff, a pupil, a parent 403; signed out 401; another school's administrator), what a remark may say, the row and the audit (a row with nothing left is deleted; a save that changes nothing writes nothing; the audit never holds the words; an author stays with their remark; the database refuses what the application would not write, including another school's pupil), two first saves at once, the freeze for every status, what the card shows to whom, and the locked-results bug.
- Screens `report-remarks-screens` (5 tests, desktop and phone = 10, new): both remarks written and cleared by the administrator; the teacher's field only for a teacher (the editor is not printed, the remarks are); 501 characters refused on the screen; final remarks once published; a registrar reads and cannot write. Axe (WCAG 2.2 A/AA) and horizontal overflow in both themes. The existing `results-screens` pass beside them.
- **Regression:** the whole `unit` and `api` projects on the first build: **2,611 passed, 2 failed** (the two guards below, which this task caused and fixed). After the fixes, on a build of the branch rebased onto `dev` with streams (task 0035) merged: every unit spec, the report-card, results, promotion, streams and IDOR API specs, and the remarks and streams screens: **1,157 passed, 0 failed.**
- **Mutation check.** In a copy, five rules were broken (the locked-results fix reverted; a teacher allowed both remarks for any pupil; drafts shown to pupils; no freeze; any teacher allowed for any arm). After a rebuild **10 of the new tests failed**, each mutation caught; the copy was restored.
- **What the first full run found** (two guards of the suite did their job): the route declared a support `area` (`unit/route-area-guard`: state-changing handlers declare none), and the unit spec held literal control characters (`unit/source-hygiene`: write them as escapes). Both fixed.
- **Not run:** the rest of the browser suite, the HTTPS project, anything against a hosted database, the migration on a hosted database.
