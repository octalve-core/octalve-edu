# 0031: Promotion and the Results screens (the Octalve Edu port of AlEemaan's tasks 0025, 0037 and the results screens of 0014 to 0017)

- **Period / Focus:** design written 2026-11-09, before any code, at the maintainer's request ("start", then "implement all in one go then test one by one"). Sources: AlEemaan's `docs/tasks/0025-p7-student-promotion.md`, `0037-promotion-screens-and-checks.md`, and its `src/lib/promotion/*`, `src/lib/academics/results.ts`, `src/components/results/*`.
- **Status:** built 2026-11-09 on `claude/octalve-promotion` and tested (section 7). Waiting for the migration `20261123090000_promotion` on the hosted databases and for the maintainer's decisions in section 8.
- **Priority:** High (a school cannot roll a class into the next session, or enter and publish marks from a screen, without them)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** off `dev`. Three commits in one PR: database, code and tests, docs.

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
(a) **Promotion:** at the end of a session an administrator picks a class, sees each pupil's term averages and what the rule advises (promote, repeat, graduate), overrides any of them with a reason, and rolls the class into the next session in one safe, repeatable step, with a history of every roll.
(b) **Results screens:** Octalve has a results API (record, query, transition, report card) and orphan components, but **no page**. A teacher cannot enter marks, an approver cannot review them and a registrar cannot print a report card without writing API calls. This task adds the page and the three small read endpoints it needs.

## 2. What is read from the code on 2026-11-09 (the facts the design stands on)
1. **Octalve's enrolment is one row per pupil per session** (`@@unique([tenantId, studentId, sessionId])`) pointing at an arm. There is no `className`/`arm` text copy as in AlEemaan; the class is reached through the arm. So a promotion writes a status on the source row and creates a row in the target session.
2. **There is no branch.** The scope is the school and, for a campus administrator, their campus (ADR 0016). A class group may be school-wide (`campusId` null) or belong to a campus; a session may be school-wide or a campus's own calendar.
3. **`evaluatePromotion` already exists** in `src/lib/results/ranking.ts` (average and a passed-subjects ratio) and is used by the report card's "promotionOutcome". AlEemaan's promotion rule is different (the mean of the term averages against a pass mark, and a terminal class graduates). The two are kept apart: the report card keeps its own wording; the rollover uses AlEemaan's rule, because that is the golden rule the maintainer approved for AlEemaan, and says so on screen.
4. **Octalve's marks are `Result.score` / `maxScore`** per pupil, subject and period, with `status` DRAFT, SUBMITTED, APPROVED, PUBLISHED, LOCKED. Only PUBLISHED and LOCKED results count towards an average (a draft is not a result a school has stood behind).
5. **The save path exists**: `POST .../academics/results` (`recordStudentResults`) already validates components against a scheme, grades the score, locks the rows and audits a changed score. The screen reuses it; no second writer is built.
6. **`getStudentReportCard` reads the pupil's *current* ACTIVE enrolment**, whatever the session. After a promotion that is the new class, so the card of a *past* term would show the new class, and its class rank would be drawn from the new arm's pupils. This is an existing limit that promotion makes real. It is fixed here: the card uses the enrolment of **the period's own session** (any status), and the rank is computed over the pupils of that arm in that session.
7. **Role lists.** The results API admits `ADMIN`, `TEACHING_STAFF`, `NON_TEACHING_STAFF` (and `STUDENT`, `PARENT` for the card); a `CAMPUS_ADMIN` is not on it. Approval authority is the permission `CAN_APPROVE_RESULTS` with a scope (ADR 0018), already enforced in `transitionResultStatuses`. These lists are **not changed** by this task; see section 6, decision D7.
8. **`recordStudentResults` for a teacher** requires an ACTIVE enrolment in an arm they are assigned the subject in; the sheet endpoint reuses the same rule so the screen never offers what the save would refuse.

## 3. Design

### 3.1 Database (one additive migration, `20261123090000_promotion`)
Two tables, both with `tenantId`, composite foreign keys on `(tenantId, id)`, forced row-level security through `app_tenant_id()`, and **append-only** (`REVOKE UPDATE, DELETE, TRUNCATE FROM app_user`): a promotion is evidence of what was decided, so it is never edited.
- `PromotionBatch` (id, tenantId, sourceSessionId, targetSessionId, sourceClassGroupId, targetClassGroupId null for a terminal class, passMark, totals evaluated / promoted / repeated / graduated / withdrawn / skipped, executedById, notes, createdAt).
- `PromotionRecord` (id, tenantId, batchId, studentId, sourceEnrollmentId, targetEnrollmentId null, overallAverage, termAverages JSON, decision, decisionMode AUTOMATIC / OVERRIDDEN, overrideReason, createdAt).
- Enums `PromotionDecision` (PROMOTED, REPEATED, GRADUATED, WITHDRAWN) and `PromotionDecisionMode`.
- Because the tables are append-only, the batch is written **once, with its final totals**, after the pupils are processed in the same transaction (AlEemaan wrote an empty header and updated it; that needs UPDATE, which is refused here).
- CHECKs: counts are non-negative; `passMark` between 0 and 100; `overrideReason` present when the mode is OVERRIDDEN; a record that is PROMOTED or REPEATED has a target enrolment, one that is GRADUATED or WITHDRAWN has none.

### 3.2 Rules (pure, `src/lib/promotion/rules.ts`)
A word-for-word port of AlEemaan's rules with "branch" removed: `computeStudentSessionAverage`, `evaluatePromotionRecommendation`, `resolveNextClassGroup` (by `sortOrder`; two classes of the same rung are parallel streams, never the next class of each other), `resolveTargetArm` (same arm name, else the first live arm), `validateSessionPromotionEligibility`, `sessionAfter`, `defaultPromotionSessions`, `sessionPairProblem`. The final-term check is **shown, not enforced** (the same open decision as AlEemaan's 0037: a school may promote early after a transfer or a restructure).

### 3.3 Service (`src/lib/promotion/service.ts`) and the refusals it makes
AlEemaan's task 0037 lists nine faults found after its first version; every one is built in from the start here:
1. Source and target sessions must belong to the school (another school's is the same 404 as an unknown one), be live (not archived), differ, and the target must begin after the source.
2. **Campus rule (new, Octalve only):** the two sessions must have the same `campusId` (both school-wide, or both the same campus's), and a class group of a campus may only be rolled between school-wide sessions or that campus's own. A campus administrator may only promote classes of **their own campus**; a school-wide class is the school administrator's (403), another campus's is a 404.
3. Unknown source class: 404, never a 500.
4. An override may name only a pupil on the roll, PROMOTED only where there is a next class, an arm that is a live arm of the class the pupil goes to, and an arm only for a pupil who is moving.
5. A stale `targetClassGroupId` (classes changed since the preview) is a 409.
6. Each pupil is processed with a compare-and-set `updateMany` on the ACTIVE status, so two administrators pressing the button together process each pupil once.
7. The source enrolment moves to PROMOTED, REPEATED, ALUMNI or WITHDRAWN. **A suspended pupil** (`standing` SUSPENDED) is still on the roll and is evaluated like any other (a suspension is not a reason to lose a year); an **expelled** pupil's enrolment is EXPELLED, not ACTIVE, so they are not on the roll and are not touched.
8. **A pupil who already has an enrolment in the target session is skipped**, not overwritten: AlEemaan upserts over it, which can silently move a pupil an administrator placed by hand. Here the source row is left ACTIVE, no record is written, the preview marks the row, and the result says how many were skipped.
9. The **target arm follows the final decision** (the matching arm of the next class for a promotion; the pupil's own arm for a repeat), not the advised one.
10. Archived pupils (`archivedAt`) are not on the roll.
11. The execute writes one `AuditLog` row for the whole roll (who, which class and sessions, the totals), in the same transaction, in addition to the batch.
12. The history returns `recommendedDecision` per record, recomputed from the stored average, the batch's pass mark and its terminal flag (no second copy in the database).

### 3.4 API (all under `/api/v1/schools/[code]/academics/promotion/`)
| Route | Method | Who | What |
|---|---|---|---|
| `preview` | GET | ADMIN, CAMPUS_ADMIN (class in own campus) | dry run for one class: the roster, term averages, advice, arms |
| `execute` | POST | same | the roll, with overrides and notes; strict zod body; returns the batch and `skipped` |
| `batches` | GET | same | the history (a campus administrator sees their campus's classes' batches) |
| `batches/[id]` | GET | same | one batch with its records |
Support view: read-only (the `academics` area, which `withAuth` already holds). Failures carry `PROMOTION_REFUSED` and the status of the refusal.

### 3.5 Screens
A new **Promotion** section in Academic setup (`?section=promotion`), shown to the administrators who may use it and hidden from staff (a teacher gets the existing 403 view if they type it). Three parts: the picker (source session, target session, class: the sessions start on `defaultPromotionSessions`, the target list offers only later sessions of the same calendar), the preview table (term columns by the school's own word for a period, the overall average, the advice badge, an override dropdown with arm and a required reason, the already-enrolled mark), a confirm dialog that says whether it is the last term, how many will move where, and that a repeated run is safe; and a history list with a details dialog. The tables are labelled scrollable regions (`tabIndex=0`, a visible focus ring) because AlEemaan's follow-up (0037) found axe's `scrollable-region-focusable` failing on a phone.

### 3.6 The Results page
`/schools/[code]/results` (new; breadcrumb "Results"; support area `results`). Reachable by `ADMIN`, `TEACHING_STAFF` and `NON_TEACHING_STAFF`, the roles of the results API. Three tabs, as real links (`?tab=`), so reload and the back button work:
- **Marks**: pick the term, the arm and the subject (only the pairs the person may enter: an administrator every arm with an offered subject, a teacher their assignments, other staff none); the sheet shows each pupil with the scheme's parts (the components of the class group's scheme, else the school-wide one, else a single total), the running total, the grade, the status; saving posts to the existing record route; a result that has left DRAFT is read-only with its status; "Submit for review" sends the DRAFT rows to SUBMITTED through the existing transition route.
- **Review**: the results of a term by status for the person's scope (the existing `GET results`), the existing approval console wired to the transition route; reasons are required where the rule requires them.
- **Report cards**: pick the term and the arm, see the class list, open one pupil's card (the existing report-card route and `ReportCardView`), print it.

Three new read endpoints (GET only, `area: "results"`):
- `.../academics/results/options`: the terms of the active session (the current one marked) and the (arm, subject) pairs this person may enter.
- `.../academics/results/sheet?periodId&classArmId&subjectId`: roster of the arm for the period's session, the scheme and its components, the saved result of each pupil. Same assignment rule as the save, so a teacher outside the assignment gets 403 and another campus's arm is a 404.
- `.../academics/results/roster?periodId&classArmId`: the pupils of an arm in the period's session with how many of their results are published (for the cards tab); read by the people who may read the results of that arm.

### 3.7 Not in this task
Report remarks (teacher and principal comments), the payment gate on report cards and PDF export (AlEemaan 0028), promotion of **programs** or higher-education course registrations (a program's completion is task 0027), a revert of a batch (the batches are append-only evidence; a mistake is corrected by moving the pupil by hand, which the people screens already allow), a result-sheet **import** from a spreadsheet, and adding `CAMPUS_ADMIN` to the results API (D7). Each is listed in `docs/HANDOVER.md`.

## 4. Decisions made here, with the secure option chosen (the maintainer's standing rule)
- **D1** The batch and its records are append-only; the batch is inserted once with final totals.
- **D2** A pupil already enrolled in the target session is skipped, never overwritten.
- **D3** The rollover uses AlEemaan's rule (mean of term averages against the pass mark); the report card's own "promotionOutcome" is unchanged.
- **D4** Only published or locked results count towards an average.
- **D5** The two sessions of a roll must share a calendar (same `campusId`). A campus administrator rolls the classes of their own campus, and the school's classes only inside their own campus's calendar; a school-wide class in the school's own calendar moves every campus's pupils, so it is the school administrator's (403). A class of one campus is never rolled in another campus's calendar.
- **D6** The report card reads the enrolment of the period's own session, and ranks over that arm and session.
- **D7** The results API's role lists are not widened for `CAMPUS_ADMIN` here. Widening it would let a campus administrator publish results, which ADR 0018 gives to a permission with a scope; that is a decision for the maintainer, not a side effect of a screen. Said in the HANDOVER.
- **D8** The final-term check is advice, not a refusal (as in AlEemaan); the confirm dialog says so.

## 5. Work breakdown
- [x] Schema `prisma/schema/promotion.prisma` and migration `20261123090000_promotion` (RLS, composite keys, append-only, CHECKs); the RLS integration list and the append-only expectations updated
- [x] `src/lib/promotion/{rules,validation,service,http}.ts`; the four routes; route-role-guard and campus-scope registrations
- [x] Report card: the period's own enrolment and rank
- [x] `src/lib/results/sheet.ts` (options, sheet, roster) and the three GET routes
- [x] Promotion section and components; the Results page, nav entry, breadcrumb, tabs and components
- [x] Tests: unit (rules table), API (promotion: happy path, override rules, each refusal of 3.3, concurrency, campus isolation, tenant isolation, append-only, history; results: options, sheet, roster, access), the report-card fix, integration (RLS), browser (both themes, phone, axe, no horizontal overflow)
- [x] Docs: this file, `current-tasks.md`, the three catalogues, `HANDOVER.md`, the `CLAUDE.md` banner

## 6. Verification plan (in the maintainer's order)
`tsc`, eslint, Prettier on new files, `pnpm build`, then the specs one by one on a test lane (`TEST_LANE`), each new spec first on an unfixed base where the fix is a fix (the report-card change), then the whole suite once. **Never run on a hosted database; the migration is the maintainer's to run.**

## 7. Build record (2026-11-09)
**What exists.** The migration `20261123090000_promotion` (two enums, `PromotionBatch` and `PromotionRecord`, a unique `(tenantId, id)` index on `StudentEnrollment`, composite foreign keys, CHECKs, forced row-level security, `REVOKE UPDATE, DELETE, TRUNCATE`); `src/lib/promotion/` (`choices`, `rules`, `validation`, `service`, `http`); four routes under `/academics/promotion/`; the Promotion section of Academic setup (`PromotionPanel`, `PromotionPreviewTable`, `PromotionHistory`); `src/lib/results/sheet.ts` and three GET routes (`/academics/results/options`, `/sheet`, `/roster`); the Results page `/schools/[code]/results` (Marks, Review, Report cards; `MarksPanel`, `ReviewPanel`, `CardsPanel`, `ReportCard`, `ResultsNav`); a "Results" entry in the sidebar (the school administrator after Finance, so the phone's first four entries are unchanged; staff after People); and the report-card fix of D6.

**Decisions made while building** (beyond D1 to D8).
- A roll in which **nobody** was processed (the class was already rolled, or another roll reached every pupil first) is refused with 409 instead of writing an empty batch. "Safe to repeat" means a second run changes nothing and says why.
- **Every override carries a reason**, not only a change of decision: an arm picked by hand is an override too, and the database refuses an OVERRIDDEN record with no reason.
- Promoting into a next class **that has no arm** is refused before the first write (409, naming the class).
- The execute route declares **no support `area`**: a platform support view is read-only (the guard `route-area-guard` forbids it for a state-changing handler), so support can preview and read the history but not roll.
- The orphan results components (`ResultsApprovalConsole`, `ResultsEntryGrid`, `ReportCardView`) were **replaced, not reused, and deleted**: they used a fixed colour palette and `dark:` classes that this app's theme switch does not drive (the same defect found in the finance components), had no scrollable-region labels and were mounted by no page. Their behaviour (a status filter, approve / publish / return with a reason / lock, a print-friendly card) is in the new panels, on the theme's tokens.
- The card's summary no longer says PROMOTED or REPEATED for a **term**: it says "On track" or "Below the mark". A term card is not a promotion (D3).
- A teacher's entry options are their **subject assignments only** (a timetable slot says when a class meets, not who answers for its marks), but they may READ the class list of an arm they meet or hold an approver scope for.
- `CertificatesConsole` (not mounted by any page) value-imported `CertificateStatus` from `@prisma/client`; changed to a type import and string literals so the new client-imports guard can be strict.

**What the tests found** (all fixed; none reached `dev`).
1. **A race in my own roll.** Three rolls fired at once: two answered 201. The second roll's preview saw the pupils as ACTIVE, but by the time it read who already had a place in the next session the first roll had committed, so it concluded "already placed" for everyone it had just seen moved and recorded a batch that "left them as they were". The decision is now made **under the row lock**: after locking the source enrolments, the target enrolments are read again, and a pupil whose source enrolment is no longer ACTIVE is "dealt with", never "skipped".
2. **A phone zoomed out on the preview.** Visually hidden labels and captions (`sr-only`, absolutely positioned) inside the scrolling table region were not clipped, because the region was not their containing block; a label in the last column widened the page to 677 px and the phone shrank it to fit. `relative` on the region fixes it. The overflow check in the browser specs compared the page with `innerWidth`, which a phone grows with the overflow, so the check passed whatever the page did; it now compares with the **visual viewport** (`min(innerWidth, visualViewport.width)`). The same weak check is in `programs-work-screens.spec.ts`, `finance-*` and other specs written earlier: not changed here, listed in the HANDOVER.
3. **The pointer was intercepted** on the phone (Playwright reported a table header "intercepting" a button below it): the same bug, seen through the shrunk layout.
4. `removeCreatedTenants` could not remove a school that had a promotion (the restricting keys); the two tables are cleared first in `tests/support/db.ts`.
5. The route-area guard, the sidebar tests and the RLS catalogue lists (the append-only list and the "every tenant table has RLS" list) needed the new routes, entries and tables.
6. A client-imports guard written for this task found `CertificatesConsole` importing the Prisma runtime into the browser (see above).

**Tested (2026-11-09, test lane 1; order tsc, lint, build, tests).** tsc clean, eslint 0 errors (6 old warnings in files this work does not touch), `pnpm build` OK, Prettier clean on every file this work added and on every changed file that was clean at `dev`, catalogues 797 of 797. One by one: `promotion-rules` (unit, 14), `results-client-imports` (2), `promotion` (API, 26), `results-sheet` (API, 12), `report-card-session` (API, 1), `promotion-screens` (browser, 4 on desktop and 4 on a phone) and `results-screens` (6 and 6), all with Axe in both themes. **Failing first:** `report-card-session` against a build of unmodified `dev` (d6fac98, lane 2) fails at the after-promotion assertion and passes here. The other new specs test code that does not exist on `dev`. **Full suite** (setup, unit, integration, api, e2e-desktop, e2e-mobile; 3911 tests; 1.6 hours; lane 1): **3856 passed, 51 skipped, 4 failed.** All four failures were older browser specs that hard-code the menus this task extends, not defects: `academics.spec.ts` (desktop and phone) expected seven Academic setup sections and now there are eight (Promotion), and two `shell.spec.ts` sidebar lists (an administrator's Administration section, and staff's links) lacked the new Results entry. The expectations were updated (Promotion after Grading; Results after Finance for an administrator and after People for staff) and the two files re-run on their own: 67 passed, 46 skipped, 0 failed. The unit spec for the same lists (`shell-nav`) had been updated earlier in the task; the browser copies were missed because the full suite had not yet run.

**Not run.** A failing-first run of the screens on `dev` (they are new), the HTTPS project, the walkthrough rows, mutation passes (deferred to the end of Phase 2), anything on a hosted database.

## 8. Left for the maintainer
- **Run `20261123090000_promotion` on the hosted databases**, after `20261122090000_progress_records`. Additive; the release before never reads it, so it can run before the code is deployed.
- **D7:** should a campus administrator reach the Results page and the results API (to review and publish their own campus's marks)? Today they cannot (the API's role lists are unchanged). Approval authority is a permission with a scope (ADR 0018), so this is a policy decision, not a side effect of a screen. **Approved by the maintainer on 2026-11-11 and built in task 0046** (`docs/tasks/0046-campus-admin-results.md`): they enter, import and read their own campus's marks and write the teacher's remark; approving and publishing stay with the permission and its scope, which a campus administrator cannot hold (a database constraint).
- **The final-term check** is advice, not a refusal (D8), as in AlEemaan. Say if it should become a refusal that an administrator can override with a reason.
- **The save does not tie a result's parts to the scheme.** `POST /academics/results` checks that the parts add up to the score and that each part is within its own maximum, but not that the part names and maxima are the class's scheme: a client can send its own. The Marks screen sends the scheme's parts, so a teacher using it cannot make this mistake, but a hand-made request can. **Done in task 0032** (`0032-result-scheme-tie.md`): the save is tied to the scheme and the first save locks it. Task 0032 also found that this task's **Marks screen could not enter the exam mark of a real scheme** (the sheet offered only the scheme's components; the exam is the separate `examMax`), because this task's fixtures were hand-made schemes the product cannot make; fixed there.
- **Parallel streams.** When several classes share the next rung (a Science and an Arts stream after a common JSS3), the roll picks the same one every time (the campus's own, then the first by name); a school with streams needs a way to say which stream a pupil goes to. Not built.
- **Report remarks, the payment gate and PDF export** of AlEemaan's report card (its task 0028) are not ported.
- **A bulk result import** from a spreadsheet and the **revert** of a roll (the records are append-only evidence; a mistake is corrected by moving the pupil by hand) are not built.
