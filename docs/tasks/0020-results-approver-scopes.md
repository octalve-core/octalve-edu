# 0020: Results are approved by assignment: generally, per section or per class (ADR 0018)

- **Period / Focus:** 2026-10-21 onward (the maintainer's decision on how approvers are assigned, answering the open question of task 0018)
- **Status:** In Progress (the ADR is merged as PR #51 and accepted by the maintainer on 2026-10-23; slice 1 is merged as PR #54; slices 2 to 4 are not started)
- **Priority:** High
- **Assignee:** Agent (Claude); the maintainer accepts the ADR and runs the migration on the hosted database
- **Target Branch / PR:** `dev`; PR #51 (the ADR, merged); slice 1 PR #54 (`claude/results-approver-scope-rules`)
- **Started:** 2026-10-21 01:12:08 UTC (the first commit of the ADR)
- **Ended:** —
- **Duration:** — (the ADR took 3 min 23 s from its first commit to its merge)

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Approving results is assigned by scope instead of being one on/off permission: a person who may approve results is assigned **General** (every class of their campus), a **Section** (for example primary, JSS or SSS) or a **Class** (for example JSS 2), the school administrator sets this in settings, and the person sees and acts on only what is assigned to them (a General approver on their whole campus). Octalve first, AlEemaan after with the same design (branches for campuses, the superadmin for the administrator).

## 2. Context & Related Docs

- [ADR 0018](../adr/0018-results-are-approved-by-assignment-generally-per-section-or-per-class.md) (Accepted): the decision, the three details the maintainer confirmed on 2026-10-23, the alternatives and what enforces it.
- The maintainer's words (2026-10-21): "we can assign staff for result approval generally or per section ( jss, sss, primary ) or per class (jss2 jss3 etc ) but based on superadmin settings: so they see what is assigned to them; General Approvers see their whole campus's results". And, asked whether to apply it to Octalve as well: yes, Octalve first and AlEemaan after.
- Task 0018 (teacher assignments for results): a teacher who holds `CAN_APPROVE_RESULTS` kept the campus-wide results list as an interim exception that the maintainer was not asked about; this task replaces it.
- `src/lib/results/rules.ts` (`canTransitionResult`), `src/lib/results/service.ts` (`transitionResultStatuses`, `queryResults`), `src/lib/attendance/access.ts` (`assignedArmIds`), `src/lib/members/service.ts` (`changeMember`), `prisma/schema/tenancy.prisma`, `academics.prisma`, `results.prisma`.
- Three details were the agent's proposed defaults and the maintainer confirmed all three on 2026-10-23 ("yes to all three"; the build follows them): a section belongs to one campus and a class group is in at most one section; "per class" means the class group (all its arms); only the school `ADMIN` assigns scopes.

---

## 3. Work Breakdown (Grouped by Module / Sub-Phase)

### Module A: The decision (`claude/results-approver-scopes`, PR #51)
- [x] ADR 0018 written and merged with the status Proposed (two commits; the second corrected two things found while reading `transitionResultStatuses`: an action on an out-of-scope result is refused like a missing permission, not "not found", and a teacher's own submit is not an approval and is not scoped). Merge commit `b6729c8`, 2026-10-21 01:15:31 UTC.
- [x] The maintainer's yes on the three details (2026-10-23): the ADR is Accepted.

### Module B: Slice 1, the model and the rules (`claude/results-approver-scope-rules`, PR #54, merged)
- [x] Schema: `Section`, `ClassGroup.sectionId`, `ResultApprovalScope` (kind `GENERAL` | `SECTION` | `CLASS`).
- [x] Migration `20261030090000_results_approval_scopes`: the tables, a check that a section's name is 1 to 80 characters, one live section name per campus (case-insensitive), a check that a scope's kind and target agree, a unique index on a person's scope rows, a BACKFILL that gives every membership that holds `CAN_APPROVE_RESULTS` a `GENERAL` scope (before row-level security is enabled), and the policies (`Section`: read, insert, update; `ResultApprovalScope`: read, insert, delete).
- [x] `src/lib/results/approver-scope.ts`: `approverScope` and `inScopeResultIds`, the one place that answers "which results may this person approve".
- [x] `transitionResultStatuses`: approve, return, publish, revert and lock need the result to be in the approver's scope (an `ADMIN` is held to none; the author's own submit is not scoped); an out-of-scope result is refused as `UNAUTHORIZED` with its own wording and the batch moves nothing.
- [x] `queryResults`: a teacher sees their assigned arms plus their scope's arms; a `GENERAL` approver is held to the campus rule alone.
- [x] `changeMember`: granting `CAN_APPROVE_RESULTS` gives a `GENERAL` scope (audit `RESULT_APPROVAL_SCOPE_CHANGED`); taking the permission away removes every scope.
- [x] Tests: `tests/api/results-approver-scope.spec.ts` (new), `tests/integration/rls.spec.ts` (two tables, their policies), `tests/support/db.ts` (`grantApprovalScope`) used by the three results specs that make an approver, `tests/integration/members.spec.ts` (the new audit row).
- [x] Catalog rows (`docs/functions/school-app.md`) in the same commit.
- [x] `pnpm build` clean (type-checks source and tests), prettier clean; a targeted run on lane 3 of 11 spec files: 192 passed, 2 failed (both mistakes in the tests, repaired).
- [x] The whole `setup` + `unit` + `integration` + `api` run on the branch's build (lane 3): 1832 passed, 3 failed of 1835; the two `mfa.spec.ts` failures pass alone, the third is `body-cap-chunked.spec.ts` "a chunked body that passes the cap and then stalls", a failure on `dev` since PR #47 (the proxy matcher makes Next wait for the end of an API request body), not this change.
- [x] Failing-first by MUTATION (the spec needs the new tables, so it cannot run on an unfixed build): with `approverScope()` made to answer "general" for everybody, 12 of the 21 new tests fail ("Expected 403, Received 200", lists too wide) and 9 controls pass.
- [x] The migration rehearsed over seeded data (five memberships in two schools: exactly the three holders of `CAN_APPROVE_RESULTS` got a GENERAL scope).
- [x] Commit message reworded in full, pushed, PR #54 opened into `dev`, Vercel SUCCESS, merged with `guarded-merge.sh`: merge commit `4dd25a1`, 2026-10-21 08:12 UTC.
- [ ] The maintainer runs `20261030090000_results_approval_scopes` on the hosted database before the results code is deployed there.

### Module C: Slice 2, the settings API (two pull requests, planned 2026-10-23)
Both parts are `ADMIN` only (never delegable: a `CAMPUS_ADMIN` and every other role are refused), need the same fresh re-authentication as the school settings (`verifyStepUpProof`: an authenticator or recovery code when two-step is on, otherwise the person's password; wrong proof refused, rate-limited) and write an audit row in the same transaction.

**2a. The setting and the rule that reads it** (branch `claude/results-approver-settings-api`)
- [x] Schema and migration `20261031090000_unsectioned_class_approval`: enum `UnsectionedClassApproval` (`GENERAL_OR_CLASS_ONLY`, `ANY_SECTION_APPROVER`) and `SchoolSettings.unsectionedClassApproval` with the default `GENERAL_OR_CLASS_ONLY`. Additive; the code that names the column needs the migration first, like slice 1.
- [x] The school settings pipeline carries it: `ALLOWED_SETTING_FIELDS`, `UpdatableSettings`, `validateSettingsPayload`, `updateSettingsSchema`; a change goes to `SettingsChangeAudit` with the old and new value. `GENERAL_OR_CLASS_ONLY` to `ANY_SECTION_APPROVER` is flagged `isWeakeningSecurity` (it widens who can approve).
- [x] `approverScope` reads the setting in the same transaction. Under `ANY_SECTION_APPROVER`, a person with at least one live Section scope also gets the arms of the class groups that have no section and sit in the same campus as one of their sections (a section with no campus covers the class groups with no campus). A Class or General scope behaves as before; a person with no scope still gets nothing; an archived section grants nothing, so it widens nothing.
- [x] Tests: the rule as a table (both values by General, Section, Class, no scope, an archived section, a class group of another campus); the API matrix of `tests/api/results-approver-scope.spec.ts` extended with the setting turned on (list and an action); the settings spec for the new field (validation, audit row, the weakening flag, step-up refusal); failing first.
- [x] Docs: the catalog rows (`school-settings`, `approver-scope.ts`), the tracker, current-tasks, HANDOVER.
- Result (2026-10-23): failing first by mutation (`approverScope` made to ignore the setting): 2 of the 9 new tests fail (the Section approver reaching the class group of the same campus; the administrator turning it on and the list following) and 7 controls pass. On the fixed build, lane 8: the new spec, `settings-rules`, `settings`, `results-approver-scope`, `results-list-scope`, `members`, `rls`, `route-area-guard`, `setup`, `phase-1-0-foundations`: 194 passed, 0 failed. `tsc`, eslint, prettier, the catalogs (415 rows) and `pnpm build` clean. Not run: the e2e and https projects; the whole other projects; a full suite on the merged `dev`. The settings screen (slice 3) does not show the field yet, so it is changed through the API until then.

**2b. Sections and approvers** (branch `claude/results-approver-sections-api`)
- [x] `GET .../settings/sections` (sections with their class groups, archived ones marked, and the class groups with no section); `POST .../settings/sections` (name 1 to 80 characters, optional campus, sort order); `PATCH .../settings/sections/[id]` (rename, reorder, archive and restore); `PUT .../settings/class-groups/[id]/section` (place a class group in a section or take it out; a class group is in at most one section).
- [x] `GET .../settings/approvers` (everyone who holds `CAN_APPROVE_RESULTS` with their scopes) and `PUT .../settings/approvers/[userId]/scopes` (replace the person's scope set with a list of General, Section and Class entries; the person must hold the permission; targets must belong to this school; an empty set is allowed and means no approving).
- [x] Refusals: a duplicate live section name in a campus is 409; a target in another school or campus is "not found"; every route is `ADMIN` only; the GET routes declare `area: "settings"`.
- [x] Audit: `SECTION_CREATED`, `SECTION_RENAMED`, `SECTION_ARCHIVED`, `SECTION_RESTORED`, `CLASS_GROUP_SECTION_CHANGED` and the existing `RESULT_APPROVAL_SCOPE_CHANGED`, each with before and after.
- [x] Tests: role matrix, step-up, cross-school and cross-campus targets, the duplicate name, the one-section-per-class-group rule, the scope replace, and the effect on the results list; `integration/rls` already covers the tables; the route-area and role guards; failing first.
- [x] Docs: catalog rows for every route, the tracker, current-tasks, HANDOVER.
- Result (2026-10-23): failing first by MUTATION (the routes do not exist on `dev`, so every test would fail there; the stronger check is that the rules matter): with the campus check on scopes, the permission check and the campus match for placing a class group removed, 2 of the 13 new API tests fail and 11 controls pass. On the fixed build, lane 8: the new API spec (13), the new rules unit spec, `settings`, `settings-rules`, `results-unsectioned-class-approval`, `results-approver-scope`, `results-list-scope`, `members`, `rls`, the route-role, route-area, route-body and lint guards: 201 passed, 0 failed. `tsc`, eslint, prettier, the catalogs (424 rows) and `pnpm build` clean. Found by the first run: the new write limiter (60 per administrator per window) was exhausted by the spec's own ~90 changes; it is 120, as the academics writes use. Not run: the e2e and https projects; the whole other projects; a full suite on the merged `dev`. Decisions: a person tied to a campus is refused a section or class group of another campus (the campus rule applies on top of any scope, so it would look like it grants something and grant nothing); a class group with no campus is open to everyone and is placed only in a section with no campus; General cannot be combined with other entries; an archived section can only be restored; archiving a section leaves its class groups and the scopes naming it in place (they cover nothing until it is restored). The settings screen is slice 3, so these routes have no screen yet.

### Module D: Slice 3, the settings screen
Plan (2026-10-23, written before the code; the routes it calls are slice 2b's, so no server change is needed):
- **Where.** `/schools/[code]/settings` already has two tabs (Configuration, Audit History). A third, **Results approval**, sits between them; the page, its role check and the support-view `fieldset` stay as they are. The new setting `unsectionedClassApproval` is a select in the Configuration tab's "Academic & Grading Controls" card under the approval switch, and goes through the existing staged-changes bar and step-up dialog (it shows in the audit history like any other field).
- **Results approval tab** (`ResultsApprovalPanel`; two lists loaded with `useApi` from `GET .../settings/sections` and `GET .../settings/approvers`):
  - *Sections.* A form to add one (name, campus or "All campuses"); each section as a card with its campus, its class groups (each with a "Move to" select that offers the live sections of the same campus and "No section"), rename, archive and restore; a last card for the class groups that are in no section, each with a "Place in" select. An archived section shows as archived, offers Restore only, and keeps its classes.
  - *Approvers.* Each person who holds the permission, with name, email, role, campus, and their scopes in plain words ("Everything", "Section: JSS", "Class: JSS 2"). A person with no scope says "Approves nothing yet" (fail closed; shown as a notice, not as an error). "Change where they approve" opens an editor: an "Everything (General)" box that, when ticked, takes the other boxes away (the API refuses General with others), then the sections and the class groups as boxes, limited to what fits the person's campus (the API answers 409 for another campus, so the screen never offers what it will refuse; an item with no campus fits everybody, as on the server).
  - *Every write asks for the fresh proof* (the password, or the authenticator code when two-step is on) through the existing `StepUpModal`, which now takes any summary of what is about to change (a name, from, to) and not only a setting. A refusal is shown in the dialog in the server's words (a taken name, a different campus); success closes it, reloads both lists and says what was done in a status line; focus goes to the summary line when the control that had it is gone.
  - *States.* Loading; a load error with a Try again button; the empty school (no sections: what a section is for and the first one to add; no approvers: where to give the permission, a link to Users); the 429 and network sentences of the shared helpers.
- **Tests.** `tests/e2e/results-approvers-screen.spec.ts` (desktop and phone projects): the journey through the screen (add a section, place two classes, give an approver the section, change it to one class, give General and see the others go, archive and restore), the refusals shown (a taken name), the keyboard path, the empty school, and axe on each state (idle, editor open, step-up dialog open, a refusal shown) in both themes; plus a check that what the screen did is what the results list then follows. The server rules are covered by the 13 API tests of slice 2b.
- Found while building it (2026-10-25), not caused by it: (1) the Configuration tab's five on/off switches are 44 x 24 px, under the 44 x 44 the screens of this app hold themselves to on a phone (the tab had no mobile test before); the new screen's test leaves them out of the size check and measures its own select, and they are ISS-0033 in `docs/issues/README.md`. (2) Two light-theme contrast failures that the new test's axe pass caught on code that was already there: the "unsaved changes" pill and the security warning in the step-up dialog used `amber-600` text; both now use the `warn` tokens.
- Fixed afterwards (2026-10-25, `claude/fix-settings-switch-and-step-up-state`): ISS-0033 (the five switches are now the shared `Switch`, a 44 x 44 button around the 44 x 24 track, and the Configuration tab is now inside the phone size check), and `StepUpModal` no longer keeps the typed password or code after it closes (its form is mounted only while open; the journey test reopens the dialog after a refused attempt and expects an empty field). Failing first: with the old code 3 of the 13 tests failed (the phone size check on the Configuration tab and the empty field, desktop and phone).
- [x] The `unsectionedClassApproval` select in the Configuration tab (and the step-up dialog taking any summary)
- [x] `ResultsApprovalPanel`: sections, class groups, the unplaced ones
- [x] `ResultsApprovalPanel`: approvers, their scopes, the editor
- [x] Empty, loading, error and success states; keyboard; both themes; phone width; axe (the e2e spec above)
- [ ] Docs: the page and component catalogs, the tracker, current-tasks, HANDOVER

### Module E: Slice 4, AlEemaan
- [ ] The same design in AlEemaan (branches for campuses, the superadmin for the administrator); its own ADR or a note that points to this one; its own migration for the maintainer to run.

### Module F: Docs
- [x] This task file, the register row 24, `octalve_edu_progress.md`, `HANDOVER.md` section 6 (6.0 and "Start here") and the banner of `CLAUDE.md` (written while slice 1 was being verified; each slice's merge updates them).

---

## 4. Unified Verification & Quality Gates
- [x] `pnpm build` (type-checks source and tests) and prettier clean on slice 1.
- [x] Targeted run on lane 3 (production build, 11 spec files: the new spec, `rls`, the three results specs, the two members specs, `permissions`, `phase-1-lifecycle-walk`, the route-area guard, `source-hygiene`): 192 passed, 2 failed. The two: the members spec expected the audit rows of a change that now also writes a scope row (updated), and one test of the new spec saw a staff record that an earlier test had left behind (a `beforeEach` now removes it).
- [x] The two repaired tests re-run, then the whole unit, integration and api projects (Module B).
- [x] Failing-first by mutation (Module B).
- [ ] NOT run so far: the e2e projects and the https project (no page changed in slice 1).

---

## 5. Notes, Findings & Deviations
- **Why the scope is rows, not a list on the membership:** the ADR's alternatives: a list of ids has no foreign keys and no row-level-security target; a table with its own policy is the pattern of every tenant table.
- **Why a section is a new table, not a label on the class group:** a typo would split a section in two and the settings page would have nothing to offer.
- **The default that keeps today's behaviour:** every current holder of `CAN_APPROVE_RESULTS` becomes `GENERAL` in the migration, and every later grant does too until an administrator narrows it, so nothing changes on the day the migration is run.
- **Fail closed:** a person who holds the permission and has no scope row approves nothing and sees nothing beyond their assigned arms.
- **A dependency on the order of deployment:** the code names the new tables, so the migration is run on the hosted database BEFORE the code is deployed there (the older code ignores the new tables, so the other order is the one that breaks).
- **Open questions for the maintainer:** none open. The three details are answered (yes, 2026-10-23) and so is whether an approver may approve a class group with no section: it is a school setting (`unsectionedClassApproval`, ADR amendment of 2026-10-23).

## 6. Output & Deliverables
- **PRs:** #51 (the ADR; merged `b6729c8`, 2026-10-21 01:15:31 UTC); #54 (slice 1; merged `4dd25a1`, 2026-10-21 08:12 UTC).
- **Migration (the maintainer's to run, once slice 1 is merged):** `20261030090000_results_approval_scopes`.
- **Docs:** `docs/adr/0018-...md`, this file, `docs/functions/school-app.md`.
