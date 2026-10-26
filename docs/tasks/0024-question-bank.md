# 0024: The question bank in Octalve Edu (parity with AlEemaan's task 0032, slices 1 and 2)

- **Period / Focus:** 2026-10-26 onward (the maintainer's order of 2026-10-19: Octalve follows AlEemaan slice by slice, before the walkthrough)
- **Status:** In Progress (slices A and B merged as PRs #68 and #69; slice C built, in review; D and E not started)
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

### Slice D: pictures
- [ ] Add, serve and remove, with the school in every storage key (`octalve/<tenantId>/question-bank/<imageId>`) and the tenant checked before the store is asked.

### Slice E: the screens
- [ ] Browse, My questions and Review queue, and the navigation entry for staff.

---

## 4. Unified Verification & Quality Gates
- [ ] `tsc --noEmit` clean, lint clean, `pnpm build`, then the tests (in that order).
- [ ] Each slice: tests that fail first where the rule is new (a mutation of the rule, restored byte for byte), the two-school and RLS tests, axe in both themes on every screen.
- [ ] Docs in the same change: catalogs, this file, HANDOVER, the tenant-RLS table list.

---

## 5. Notes, Findings & Deviations

- Octalve's migration is one file for what AlEemaan did in two (its foundation and its core), because nothing here has been deployed.
- Real runs against Cloudinary, R2 and S3 need credentials and are reported NOT run until the maintainer supplies them.
