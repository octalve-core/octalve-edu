# 0024: The question bank in Octalve Edu (parity with AlEemaan's task 0032, slices 1 and 2)

- **Period / Focus:** 2026-10-26 onward (the maintainer's order of 2026-10-19: Octalve follows AlEemaan slice by slice, before the walkthrough)
- **Status:** In Progress (slices A to E merged as PRs #68, #69, #70, #71 and #72 on 2026-10-26; the parent view of the bank, the hosted migration and the image store remain)
- **Priority:** High
- **Assignee:** Agent (Claude); the maintainer runs each migration on the hosted database before the code that needs it is deployed there, and supplies the image-store credentials
- **Target Branch / PR:** `dev`; slice A `claude/qbank-1-foundation`
- **Started:** 2026-10-26 UTC
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Teachers of a school write reusable questions, a reviewer assigned by the school approves them, and the questions can be browsed, kept secret from pupils until a person with authority releases them, and illustrated, exactly as in AlEemaan, but tenant-scoped: every row belongs to one school, a school's bank never crosses into another's, and the platform administrator reads none of it. This task is the first two slices of the design (the foundation, and the bank core: write, review, read, pictures, screens). Use in assessments, pupil practice, reports, forms, marking and printing are later slices.

## 2. Context & Related Docs

- `docs/development-history/forms-and-question-bank-parity.md`: how every AlEemaan idea maps onto Octalve, the rules every table and route must follow (RLS, composite keys, `auth.tenant.run`, ADR 0001 to 0004), and decisions D1 to D6 (all decided; D4: the setting `bank.parents.view`, one of `NONE`, `SUMMARY`, `FULL`, default `NONE`, used from slice 4).
- AlEemaan's `docs/tasks/0032-forms-and-question-bank.md` (merged there as PRs through #96): the behaviour rules and the tests this build repeats. Where the code is the same it is copied (`labels`, the settings rules, the secrecy rules in `rules.ts`, `overlap`, `images`, `item-input`, the storage adapters) with its unit tests; where it touches data it is rewritten for tenancy.
- ADR 0016 (the platform administrator) and 0017 (support access): no question bank route declares an `area`, so a support session reaches none of it, and a test proves it.

---

## 3. Work Breakdown

The slices follow AlEemaan's, grouped so that each pull request leaves something that works and can be tested.

### Slice A: the schema, the migration and the pure parts (`claude/qbank-1-foundation`)
- [x] `prisma/schema/question-bank.prisma` and ONE additive migration, `20261101090000_question_bank`, for everything slices 1 and 2 need (AlEemaan did it in two): six enums and nine tables (items, pictures, versions, class tags, reviews, reviewers, similarity flags, the audit trail, the switches). Every table carries `tenantId`, every child points at its parent by `(tenantId, id)`, and a person is always a membership of THIS school (a composite key to `TenantMembership`), so a row can never point into another school. Row-level security is enabled and forced in the same file as each `CREATE TABLE`; items are read, written and edited but no policy lets the application delete one (ADR 0004).
- [x] The database rules: the CHECKs, the unique reviewer and switch indexes, the picture-count trigger (at most 4, the parent row locked first), the append-only triggers (review, version, audit; a whole school being removed is the one exception, as in ADR 0003's locks), the forward-only visibility trigger (UTC), the approval check, and a check that a switch change records the fresh re-authentication (D3).
- [x] Copied with their unit tests: `labels`, `validation`, `settings` (the 15 keys plus `bank.parents.view`: NONE, SUMMARY or FULL, default NONE, a campus may only choose less), `overlap`, `images`, `item-input`, and the storage adapters; `rules` rewritten for a school (a membership with no campus covers every campus; the school's `ADMIN` and a `CAMPUS_ADMIN` replace AlEemaan's superadmin and branch administrator) with six new tests for that.
- [x] Integration tests (38 with the setup test) in `tests/integration/question-bank-schema.spec.ts`: the migration is additive, every rule above, a campus or a person of ANOTHER school refused on every table, the runtime role's policies (no context shows nothing; school B sees none of A's rows; an insert for A is refused; items are never deleted; pictures, tags and flags are replaced as sets; history is only added to). `rls.spec.ts` lists the nine tables.
- [x] Mutation checks on the database itself (each restored, the control re-run green): the picture limit raised to 5, the visibility trigger dropped, the visibility rule using the server's local clock, the review append-only trigger dropped, the cascade exception removed, a switch's insert policy opened, the submitter's membership key dropped, the re-authentication check dropped, a delete policy added for items. Each failed the spec.
- [ ] Not in this slice: no service, route or screen (slices B to E); no real image store.

### Slice B: reviewers and switches (`claude/qbank-2-reviewers-settings`)
- [x] `reviewers-service` and `settings-service` inside `auth.tenant.run`; `audit` (with the proof's time); `http` (strict bodies, the limiter, `requireFreshProof`). The routes under `/api/v1/schools/[code]/question-bank/` (`reviewers`, `reviewers/[id]`, `settings`), ADMIN and CAMPUS_ADMIN, NO support area. Every change, school-wide or campus, needs the fresh re-authentication (D3) and is audited in the same transaction.
- [x] The campus rules: the school's administrator assigns and changes for any campus or the whole school; a campus administrator for their own campus only (another campus 403 from `createCampus`, the whole school 403, another campus's row 404, a school-wide row 403); a campus may only narrow a switch; `scope CAMPUS` with a null campus is a 400 (null is not "mine").
- [x] The screen: `/schools/[code]/question-bank` with Reviewers and Settings tabs, the step-up dialog, the nav entry for the two roles. Covers is a select, not radio buttons (a phone control must be 44 px).
- [x] Tests: `tests/api/question-bank-admin.spec.ts` (16: who may call, the proof, every campus rule, the audit rows, concurrency, two schools, the support view), `tests/e2e/question-bank-admin-screens.spec.ts` (desktop and phone, axe in both themes), the nav and route guard unit specs.
- [x] Mutation checks (each restored and a control re-run green): a campus allowed to widen a switch, the fresh proof not checked, pupils and parents accepted as reviewers, the proof's time not recorded, a Remove button offered for a school-wide reviewer. Each failed the spec that names it.

### Slice C: the questions and their review (`claude/qbank-3-items`)
- [x] `viewer` (an active membership of THIS school, the school's administrator, reviewer rows, the subjects taught per campus), `items-common`, `items-service`, `review-service`, `items-http`; seven routes under `/api/v1/schools/[code]/question-bank/` (`items`, `items/[id]`, `submit`, `approve`, `reject`, `retire`, `review-queue`), the four staff roles, NO support area. Every write is one transaction through `auth.tenant.run` that re-reads the person, locks the item, asks `rules.ts`, and writes the item, an append-only review row, a version snapshot and an audit row.
- [x] What a school adds: `campusId` defaults to the writer's own campus; `null` is a school-wide question (the school's administrator, or school-wide teaching staff in a school with no campuses); a campus of another school is a 404; another school's question is "Not found" in every verb; `mayAuthorIn(viewer, null)` in `rules.ts`.
- [x] Tests: `tests/api/question-bank-items.spec.ts` (ported from AlEemaan's 29 and extended: two schools, a school-wide membership, a school with no campuses, the support view), `rules` unit tests for the school-wide case.
- [x] Found while building it: the review queue of a reviewer for every campus was empty because an empty `{}` inside `OR` is not "everything". Fixed here (the condition is left out) and in AlEemaan's merged code.
- [x] Found while building it: `tests/unit/route-area-guard.spec.ts` had been failing on `dev` since slice B, because the question bank's GET routes declare no support area. They are now on the out-of-reach list with the reason (the bank is the school's own teaching material, which a support view must not read).
- [x] Mutation checks on `question-bank-items.spec.ts` (each failed a test, then restored; control 33 passed): the list not asking `staffMaySee`, the overlap shown to everyone, the decision rule skipped, another school's campus accepted, the review queue without the every-campus condition, the right to set visibility unchecked.

### Slice D: pictures (`claude/qbank-4-pictures`)
- [x] `images-input` (one `file`, an `alt` of at most 300 characters, `decorative`; nothing else), `images-service` (`addImage`, `removeImage`, `readImage`, each inside `auth.tenant.run`) and three routes under `items/[id]/images`: POST (multipart), GET (the bytes) and DELETE. A picture is part of the question, so adding or removing one is an edit by the same people: a new version with a snapshot, an `EDITED` review row for a reviewer, an audit row.
- [x] The school is in every storage key (`octalve/<tenantId>/question-bank/<imageId>`) and in every query; the item is looked up inside the school before the store is asked anything, and the file is stored before the row and removed again if the row is refused. A removed picture's file is deleted after the row. No store configured is a `503` after who is asking.
- [x] `read-body.ts` gains `readBoundedBytes` and `readBoundedForm` (a form is read no further than the picture limit plus 64 KB and only then parsed); the test servers have `IMAGE_STORE=memory` and the test runner none, which is where the `503` is checked.
- [x] Tests: `tests/api/question-bank-images.spec.ts` (17 with the setup project: add and serve with nothing but pixels, descriptions, hostile files, the size limits, the picture limit and a race, who may add, serve and remove, another school, the support view, removal, retired questions, no store), `tests/unit/read-body.spec.ts`.
- [x] Mutation checks (each failed a test, then restored; control 17 passed): the school missing from the key, a picture served without the access check, no limit check in the transaction, anyone who can see a question allowed to change its pictures, the bank-off switch ignored, no `EDITED` review row for a reviewer, the form type not checked, a description not required, the read cap too loose.
- [ ] Not run for this slice: the browser projects (the screens are slice E), the full suite on merged `dev`. The hosted deployment needs `IMAGE_STORE` and that backend's credentials before pictures work there.

### Slice E: the screens (`claude/qbank-5-screens`)
- [x] The page opens for the four staff roles (a pupil or parent gets the 403 view, and the page still declares no support area). Tabs: Browse and My questions for every staff member, Review queue for a reviewer or an administrator (`canReview`), Reviewers and Settings (slice B) for the school's administrator and a campus administrator. The navigation shows "Question bank" to staff too.
- [x] Components under `components/question-bank/`: `QuestionsPanel` (the three lists), `QuestionDetail`, `QuestionForm` (with pictures), `DecisionDialogs`, `TagInput`, `model.ts` (plain code, no zod, since a client component must not import it), `say.ts`, and `BankApi.tsx` (the school's API base through a context). A button the server's `can` flags would refuse is not drawn; the overlap warning is drawn only when the server sent it.
- [x] Who a question is written for: a person tied to one campus is not asked; a school administrator or school-wide teacher chooses between the whole school and a campus (`mayAuthorIn` decides which are offered).
- [x] A nested dialog's `close` event bubbled to its parent and closed it (the Approve dialog took the detail dialog with it): `Dialog` now reports only its own closing. `sendForm` added to `postJson`; `TextAreaField` added.
- [x] Tests: `tests/e2e/question-bank-questions.spec.ts` (a teacher writes a question with a picture and sends it; a reviewer approves it with a subject and classes; a question is sent back with a reason and corrected; an exam approver sees the overlap warning and chooses who may see it while the writer never sees a word of it), `tests/e2e/question-bank-admin-screens.spec.ts` (updated: the Reviewers tab is no longer the first, a teacher now finds the page with the staff tabs only), `tests/unit/question-bank-model.spec.ts`, `tests/unit/shell-nav.spec.ts`. Axe (WCAG 2.2 A/AA) and a horizontal-overflow check on every state in both themes, on desktop and a phone.
- [ ] Not done in this slice: mutation checks of the screens (the server rules behind them are mutation-checked in slices C and D); `bank.parents.view` is not read yet (the slice that shows questions to parents).

---

## 4. Unified Verification & Quality Gates
- [ ] `tsc --noEmit` clean, lint clean, `pnpm build`, then the tests (in that order).
- [ ] Each slice: tests that fail first where the rule is new (a mutation of the rule, restored byte for byte), the two-school and RLS tests, axe in both themes on every screen.
- [ ] Docs in the same change: catalogs, this file, HANDOVER, the tenant-RLS table list.

---

## 5. Notes, Findings & Deviations

- Octalve's migration is one file for what AlEemaan did in two (its foundation and its core), because nothing here has been deployed.
- Real runs against Cloudinary, R2 and S3 need credentials and are reported NOT run until the maintainer supplies them.

### Review of slices 3 to 10 (PR #79) and the fixes made on its branch (2026-10-28)

A read of the ported slices (against the fixes already made in AlEemaan) found that Octalve carried the same bugs, two more of its own, and one dead feature. They are fixed on the PR's branch, each with a test that failed first on a production build of the unfixed code (`TEST_LANE=2`):

- **The public survey link could not work.** `forms/public/[token]` read and wrote the form tables through the bare database client with no school selected, which row-level security answers with no rows and refuses every write; it also ignored the school in the address, and had no limit on requests. Now: migration `20261102150000_questionnaire_public_share` adds `app_share_token()` and a SELECT-only policy `form_public_share` on `Form` (one PUBLISHED questionnaire, by its share token: the shape of the certificate and invitation links); `forShareToken(token)` reads the survey, then the school context is set from the row it found (`trustedTenantId`, like an accepted invitation) and the questions and the answer go through the school's own policies. The school in the address must own the survey and not be suspended (else the same `404` as an unknown token); reads and answers are limited per address (120 and 60 per 5 minutes; a class on one school connection fits).
- **A guardian or a pupil could read any pupil's practice history.** `GET portal/practice/history?studentId=` returned the student of that id with no check who asked (any pupil, any guardian of the school). `getStudentForViewer` now decides: a pupil their own record only, a guardian the pupils an APPROVED link names (`portal-helpers` was catalogued as doing exactly this and did not), an administrator any; anyone else's id is `404`.
- **Printing** took any question of the school by id: now `staffMaySee` (a draft that is not yours, a secret question of a subject you do not teach, another campus's question are `404`), and a form or a quiz of another campus is `404` (`mayReachCampus`). A refusal logs nothing.
- **Non-teaching staff** could build, close, mark, print and read pupils' answers: the routes named `BANK_STAFF_ROLES` while the catalog said teaching staff. Forms routes now use `FORM_STAFF_ROLES` (ADMIN, CAMPUS_ADMIN, TEACHING_STAFF); non-teaching staff keep the question bank (review), the list and detail of forms, the print log and the reports.
- **The daily cap** counted answered questions only (any number of sets could be opened before answering one): now answers plus the unanswered part of open sets, under a per-pupil lock; **two answers to one question** both stored: now checked and written under a per-set lock; an answer is refused once the school switches pupil access off; a pupil with **no class** was offered the questions written for any class.
- **Anonymous questionnaires** kept the pupil's id and the same instant on the participation, the response and its answers (a join re-identified everyone): now an HMAC participation code under a key derived from `MFA_ENCRYPTION_KEY` (the same for one pupil and survey, different across surveys), the day only on all three records, and a second or simultaneous answer is `400 ALREADY_SUBMITTED`. **`bank.smallSummary.min` was never read:** an anonymous questionnaire's results are now withheld below it, counting the pupils who answered.

**Found and NOT fixed here (own follow-up):** the forms module is campus-blind on access by id (about 40 lookups use the school only), so a teacher or campus administrator of one campus can read, update and close another campus's forms and read its results; it needs the maintainer's rule for what a campus teacher may see and write of the school-wide forms (the printing check already uses "the whole school's, or your own campus's"). Also not here: the AlEemaan decisions about manual marking (creator or administrator only, manual questions only), practice-set start/submit checks and question-report dedupe apply to the same ported code and are made in AlEemaan first.
