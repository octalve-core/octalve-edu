# 0063: A screen to add a campus (found by the walkthrough, task 0053)

- **Period / Focus:** 2026-11-14 (a flow-audit finding: the school's administrator can switch "Multi-Campus Mode" on and can give a person a campus, but there is no screen on which a campus is made)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-campuses-screen` / PR into `dev`
- **Started:** 2026-11-14

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On the school's Settings page the administrator sees a "Campuses" section: the school's campuses in a list, and a field and a button to add one. After it, a campus can be chosen everywhere a campus is chosen (a campus administrator's invitation, a class, an academic session, a pupil), and the walkthrough can make a campus the way a person would, by typing.

## 2. Context: what was found, and how

- The walkthrough's rule (task 0033, section 2, shared by both products): whatever a person cannot do by clicking and typing is a finding, and the findings are fixed. While planning chapter C02 of Octalve's journey ("the school: campuses, school type, settings, profile") the screens were read for the one that makes a campus.
- `POST /api/v1/schools/[code]/campuses` exists (plan 0.5.3 B; ADMIN only; the name is trimmed and checked, unique in the school, rate-limited, audited as `CAMPUS_CREATED`) and has its API tests (`tests/api/campuses.spec.ts`). **Nothing in `src/components` or `src/app` calls it for writing**: `grep -rn "/campuses" src --include=*.tsx` finds only the program-campuses panel (`ProgramView.tsx`, a different route, which lists the campuses a program runs in). `tx.campus.create` appears in exactly one place, that route. So a campus can be made by an API call, or by hand in the database, and never by a person.
- What that leaves a school with: the Settings page offers "Multi-Campus Mode", the Users page offers a campus when a campus administrator is invited, the Classes and Sessions panels offer "Whole school and every campus" and each campus, and the platform page counts campuses, but a school that starts with none (the first-run wizard and the platform's onboarding both make a school with no campus) cannot get one. A campus administrator, whose campus is required by a database CHECK (ADR 0016), therefore cannot be invited either.
- Also seen while reading, not changed here: `multiCampusEnabled` is saved, audited and shown, and **read by nothing else** (`grep -rln multiCampusEnabled src` finds four files: the settings validation and the delta rules in `lib/school-settings` (`http.ts`, `rules.ts`), the settings panel and the audit log's field labels). It does not hide or show any campus control. Recorded in section 5 for the maintainer.

## 3. Decisions

- **D1. A section on the Settings page, not a new page.** Settings is the school administrator's page (it answers 403 to everyone else, as the API does), already holds one section per switch with an `h2` and an explanation, and ADR 0016 says that changing campuses is the school administrator's and not a campus administrator's. A new page would need a navigation entry, a breadcrumb name and a row in three catalogues for a list of names.
- **D2. Add and list; nothing else.** The route has `GET` (a page of campuses; an administrator sees all) and `POST`. There is no rename and no archive route, and ADR 0004 says a thing is archived, never deleted, so a rename or an archive would be a new route, a migration for an `archivedAt` column and a rule for what happens to a campus's people and classes. That is its own task and is offered to the maintainer in section 5; the walkthrough does not need it.
- **D3. Always shown, whatever "Multi-Campus Mode" says.** The switch is read by nothing, so tying the section to it would hide the only way to make a campus behind a switch that changes nothing. When the school has none, the section says so in a sentence.
- **D4. Inside the page's disabled fieldset.** A support view only reads (ADR 0017): the page already switches the whole school form off with a `fieldset disabled`, and the section sits in it, so a support person sees the list and cannot type. The API refuses a write from a support view anyway.
- **D5. The server's words are shown.** A blank name, a name that is too long or has characters that cannot be used (400) and a name the school already has (409) are the server's sentences, shown next to the field; a 429 and a lost connection use the shared sentences of `failureText`. The client adds no second set of rules.
- **D6. No new route, no migration, no schema change.** The screen uses the two routes that exist.

## 4. Work breakdown

- [x] Design (this file, written before the code).
- [x] `src/components/settings/CampusesPanel.tsx`: the section (list, form, notices); mounted in `settings/page.tsx` inside the fieldset, after the school's own settings.
- [x] `tests/e2e/campuses-screen.spec.ts` (4 tests, run on a desktop and on a phone): a school with no campus; two campuses added by typing (listed in name order, the spaces tidied, saved, audited, still there after leaving the page); the same name again and a blank name refused in the server's words and nothing made; the new campus offered where a campus is chosen (the invitation of a campus administrator); a campus administrator who types the address is refused the page. Axe (WCAG 2.2 A/AA) and horizontal overflow in both themes. **Failing first on the unfixed build** (section 6).
- [x] Catalogue (`docs/components/school-app.md`), tracker (`docs/tasks/current-tasks.md`), HANDOVER 6.33.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 5. For the maintainer (decisions I did not take, because they change what a campus is)

1. **Rename and archive a campus.** Needs a route pair, an `archivedAt` column (a migration, yours to run) and a rule for the people, classes and sessions of an archived campus. Not built.
2. **"Multi-Campus Mode" does nothing.** It is stored, audited and shown, and read by nothing. Either it should hide the campus controls (the campus choice on invitations, classes, sessions, the campus filter) for a one-campus school, or it should be removed. The simpler school is probably the point of the switch; I have not wired it because that changes screens for every school that has campuses today.

## 6. Build record and tests

Gates, in the order tsc, lint, build, tests (2026-11-14, worktree `octalve-edu-walk`, `TEST_LANE=2`, a production build of exactly the tree tested):

- `pnpm typecheck`: exit 0. `eslint` on `CampusesPanel.tsx`, `settings/page.tsx` and the spec: exit 0, no problems. `prettier --check` on the four changed files: clean (the two new files were formatted with `--write`, which only re-wrapped one sentence; `page.tsx` was already formatted).
- `pnpm build`: exit 0, on the unfixed tree (the panel's file present, its mount removed from `page.tsx`) and on the fixed tree.
- **Failing first**, `tests/e2e/campuses-screen.spec.ts` on the unfixed build: **6 failed, 3 passed** (the `setup` project, and the guard test "a campus administrator who types the address is refused the page" on the desktop and on the phone, which holds before and after: it is there so the new section never reaches a campus administrator). The six failures are the right ones: `getByRole('heading', { name: 'Campuses', level: 2 })` not found (the two "adds two by typing" tests), `getByRole('list', { name: 'Campuses' })` empty where `['Main campus']` was expected (the two "server's own words" tests), and `getByLabel('Campus name')` never found, a 120 s timeout (the two "offered in the invitation" tests).
- The same spec on the fixed build: **9 passed in 1.2 min** (setup, and the four tests on the desktop and on the phone).
- The specs that visit the Settings page or could be touched by a new section on it, on the fixed build: `finance-standing-screens`, `programs-screens`, `report-card-gate-screens`, `results-approvers-screen`, `shell`, `support-access` and `info-tips`, desktop and phone: **115 passed, 50 skipped (tests that name one viewport), 0 failed** in 10.9 min. The support view's switched-off fieldset is covered by `support-access` and `shell`; the new field and button sit inside it.

**Not run, and not claimed:** the whole suite (the `api`, `integration`, `unit` and `https` projects: this change touches no route, no library and no schema), a screen reader, mutation passes (deferred to the end of PHASE 2, the maintainer's call), the hosted database (there is no migration).

## 7. Output

- **Branch:** `claude/octalve-campuses-screen`; no migration, no new route, no environment variable.
- **Also found, for the walkthrough:** the chapter that makes the campuses (C02) can now type them, and the chapter that invites a campus administrator (C03) can now choose the campus.
