# 0065: A pupil's or a guardian's sign-in account can be linked to their record (found by the walkthrough, task 0053)

- **Period / Focus:** 2026-11-14 (a flow-audit finding: an invited pupil or guardian signs in to a portal that has nothing for them, because nothing connects their account to their record)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** High (the pupil's and guardian's portal, built in tasks 0024 to 0030, cannot be reached by a real pupil or guardian without it)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-account-links` / PR into `dev`
- **Started:** 2026-11-14

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On a pupil's page the school's administrator (or a campus administrator, for their own campus) links the pupil's sign-in account to the pupil's record, or unlinks it; on a guardian's row of that page the same for the guardian. After it a pupil who signs in as a student sees their own work, and a guardian who signs in as a parent sees their children.

## 2. Context: what was found, and how

- The walkthrough has to sign in as every kind of person (task 0053). Planning the pupil's and guardian's chapters, the way the portal knows who a pupil or a guardian is was followed: `resolveStudentForUser` (`lib/question-bank/practice-service.ts`) finds a pupil by `StudentRecord.userId = <the signed-in user>`; `getStudentForViewer` and `listChildrenForGuardian` (`lib/portal/portal-helpers.ts`) find a guardian's children through `GuardianRecord.userId = <the signed-in user>` and an `APPROVED` link. The pages `My work` and `My children`, the practice, forms and questionnaire routes all go through these.
- **Nothing sets those two columns.** `tx.studentRecord.create` and `update` never write `userId`; no guardian code does either; the invitation service links only `staffRecordId` when a person accepts (`lib/invitations/service.ts`); the only writers are the tests, straight in the database (`tests/support/qbank-world.ts`). The schema comment says it plainly: "`userId` exists for the 1.4 student sign-in; no route sets it in 1.2", and the guardian service says "Phase 1.4 adds a linking-code claim". That phase was never built. A staff record, by contrast, has `link-account`, `unlink-account`, `linkable-accounts` and an invitation that carries the record.
- **So an invited STUDENT or PARENT member signs in and finds an empty portal** (`My work` has no pupil to show, `My children` no child). The database is ready for the link: `TenantMembership` has `studentRecords` and `guardianRecords` back-relations, a composite foreign key keeps the account inside the school, and the partial unique indexes `StudentRecord_account_once` and `GuardianRecord_account_once` allow one record per account per school.

## 3. Decisions

- **D1. The same shape as staff, for pupils and for guardians: link an existing account, unlink it.** Three routes each (`GET .../linkable-accounts`, `POST .../link-account { userId }`, `POST .../unlink-account`) under `people/students/[id]` and `people/guardians/[id]`; the same refusals (`ALREADY_LINKED_ACCOUNT`, `ACCOUNT_MISMATCH`, `ACCOUNT_TAKEN`, `NOT_LINKED`, `NOT_FOUND`, `ARCHIVED`) with words that name a pupil or a guardian. The account is made on the Users page (an invitation with the role Student or Parent), as for staff: nothing about how an account is made changes.
- **D2. Who may.** The school's administrator, and a campus administrator for the records and accounts of their own campus (`CAMPUS_WRITE_ROLES`, the staff routes' rule, `studentScope` for a pupil, `guardianScope` for a guardian). Teachers, non-teaching staff, pupils and guardians are refused (403). A support view never writes.
- **D3. The account has to fit.** An ACTIVE member of THIS school whose role is `STUDENT` (for a pupil) or `PARENT` (for a guardian), who is not already linked to another record of that kind; a campus administrator chooses among their own campus's members. A guardian record is one person across all their children, so linking it reaches every child they are linked to.
- **D4. Concurrency and the net.** The check and the write are in one transaction under an advisory lock (as `lockStaff`), the write is conditional (`userId IS NULL`), and the partial unique index is the net underneath: a collision it still catches is answered as `ACCOUNT_TAKEN`, not as a 500.
- **D5. Audited, without personal data beyond the account's id:** `STUDENT_ACCOUNT_LINKED` / `STUDENT_ACCOUNT_UNLINKED` and `GUARDIAN_ACCOUNT_LINKED` / `GUARDIAN_ACCOUNT_UNLINKED`, through `auditPeople`.
- **D6. The screen.** A "Sign-in account" section on the pupil's page (state, who it is, Link / Unlink) and a "Sign-in account" line with the same buttons on each guardian row of that page. The record's view carries `account` (`none` or `linked` with the person's name and email, whether their access was switched off, and whether their role no longer fits), as the staff view does; the lists carry it too (a small "Has a sign-in" pill is not added: not asked for).
- **D7. No migration, no new column, no environment change.** The columns, the foreign keys and the unique indexes exist already.
- **D8. Not built (offered):** an invitation that carries the record and links it when it is accepted (what a staff record has; it needs `studentRecordId` and `guardianRecordId` on `Invitation`, a migration the maintainer runs), and a code a guardian claims their child with (the "Phase 1.4" idea).

## 4. Work breakdown

- [x] Design (this file).
- [x] `src/lib/people/accounts.ts` (`linkableAccounts`, `linkAccount`, `unlinkAccount` for the two kinds) and `person-account.ts` (the `PersonAccount` the views carry); `StudentView` and `GuardianView` carry `account`.
- [x] Six routes; `peopleFailure` words that name a pupil or a guardian; the GET routes declare `area: "people"` for the support-area guard.
- [x] The screens: `AccountDialogs.tsx` (link and unlink dialogs), the pupil's page ("Sign-in" section) and the guardian rows on it.
- [x] `tests/api/people-accounts.spec.ts` (10 tests: every refusal, every role, the campus rule, the audit rows, two at once, the portal before and after), `tests/e2e/people-accounts-screens.spec.ts` (3 tests, desktop and phone: linking and unlinking by clicking; a member of staff sees and cannot change; a guardian and a pupil who sign in find nothing before the link and their own things after it; axe and overflow in both themes).
- [x] Catalogues (`docs/functions`, `docs/components`, `docs/pages` for the school app), tracker, HANDOVER 6.36.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 5. Not in this task

- Everything under D8, and the Users page's invitation for a pupil or a guardian (unchanged).

## 6. Build record and tests

**Build record (2026-11-15, worktree `octalve-edu-link`, `TEST_LANE=3`, a production build of exactly the tree tested: `dev` at the merge of PR #140, plus this change).**

- Gates in order: `tsc --noEmit` exit 0; `eslint` on the changed `.ts` and `.tsx` files exit 0; `pnpm build` exit 0 (the unfixed tree, the fixed tree, and the fixed tree again on top of `dev`'s two newer merges); Prettier `--check` clean on the changed files.
- **Failing first**, both new specs on the unfixed build (the specs present, `src` as on `dev`): `people-accounts.spec.ts` **10 failed, 1 passed** (the one is the `setup` project), `people-accounts-screens.spec.ts` **6 failed, 1 passed**. The failures are the right ones: the six routes answer 404 (they do not exist), and the pupil's page has no "Sign-in" section.
- **The fixed build, API:** `people-accounts.spec.ts` **11 passed** (the ten tests and the setup). They prove: only an administrator (or a campus administrator for their own campus) may choose, link or unlink, and a teacher, a non-teaching member, a parent, a pupil, a deactivated member and another school's administrator get the one 403 body; an unknown record, another school's record and a malformed id are the same 404; the choices are the active members who sign in as a student (or a parent) and are not linked yet; every wrong choice is refused with words that name a pupil or a guardian; an archived pupil cannot be linked; an account switched off, or whose role was changed, is shown as such; **two requests at once make one link** (four accounts offered to one pupil link one; one account offered to four pupils links one); and **the point**: through the real portal routes, before the link the pupil's practice and the guardian's children do not know them, after it they do, and after an unlink they do not again.
- **The fixed build, browser:** the first run passed 5 of 7 and failed "THE POINT" on desktop and on phone with a strict-mode violation of my own spec: `getByRole('tab', { name: 'Practice' })` found two tabs (the page's "My work sections" and the practice area's nested one). The locator is scoped to the page's own tab list; the rerun is **7 passed** (the setup and the three tests on the desktop and on the phone), and the same three tests pass in the final run below.
- **A neighbour test had to change, on purpose:** the first neighbour run, `tests/api/people-students.spec.ts` "POST makes a student ... the response is the record and nothing else about the school", failed because that test pins the exact list of the student's keys and the view now carries `account` (decision D6). The list now includes `account`, and the test also asserts that a new pupil's account is `{ state: "none" }` (so the person's id, name and address appear only once linked). The same run showed the people guardian and staff specs, the tenant-boundary specs and the portal practice specs unchanged.
- **Final run, the tree above (build, then the three projects):** `unit` **1267 passed**; `api` (this task's spec and its nine neighbours: students, guardians, staff, import, program people, campus-admin people, tenant boundary, portal practice, practice-set guards) **138 passed**; the browser run (this task's three tests, `people`, `campus-admin-setup`, `class-choices` and the whole `responsive-and-a11y` spec, on the desktop and on the phone, with `TEST_TIMEOUT_SCALE=2`) **103 passed, 0 failed** in 20.7 min, including the responsive spec's test of the pupil's page on the phone (the page this task changes, which the first neighbour run could not reach, see below).
- **Two things that were not from this change, and each was looked at:** (1) in the neighbour run before `dev`'s newer merges, `responsive-and-a11y` failed on the phone on `button[More information] 16x16`: the info icon against that spec's 44 px rule, which PR #140 had already fixed on `dev` (the branch was cut before it). (2) the tests after it in that run failed in milliseconds with `browserType.launch: Executable doesn't exist ... chromium_headless_shell-1194`: another project's `playwright install` had removed the browser this repository needs from the shared cache (the cache's link list named only that project and one other). Reinstalled with `pnpm exec playwright install chromium` from both checkouts, which also registers them, and the run repeated.

**Not run, and not claimed:** the `https` and `integration` projects (no TLS, cookie or schema behaviour changed), the whole suite, a screen reader, mutation passes (deferred to the end of PHASE 2, the maintainer's call). **No migration, no environment change** (decision D7): the columns, foreign keys and unique indexes were already in the schema.

**For the maintainer (open, not built):** an invitation that carries the record and links it when it is accepted (a migration), and a code a guardian claims their child with (decision D8). Until then the school's administrator links by hand, on the pupil's page, after the person has accepted the invitation as Student or Parent.
