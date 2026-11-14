# 0064: The timetable's slot form and the notice composer offer the school's own choices, and open with the right values (found by the walkthrough, task 0053)

- **Period / Focus:** 2026-11-14 (a flow-audit finding: a lesson could not be scheduled by a person, and a notice could not be addressed to a class)
- **Status:** Done (design first, then built; the record is section 5)
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-class-arm-choices` / PR into `dev`
- **Started:** 2026-11-14

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On the Academics page (Timetable) the slot form offers the school's class arms, subjects and teachers, so that a lesson can be scheduled, opened again and changed; the notice composer on the overview offers the class arms. Both forms open with the values of what they edit (or blank, for a new one), every field is tied to its label, and a lesson card can be used with the keyboard.

## 2. How it was found, and what was wrong

The walkthrough's observers listed a `404 GET /api/v1/schools/<code>/academics/classes` on the overview and on Academics, at every load, in the first recon of chapters C02 and C03 (task 0053, section 8). Nothing broke on screen: the 404 was swallowed and the choice was simply empty. Reading the two callers (`TimetablePanel.tsx`, `AnnouncementsFeed.tsx`) and the forms they feed:

The components catalogue (`docs/components/school-app.md`) had already written two of these down as plain facts ("no such route ... so both lists arrive empty"; "form state is set ... on the first render only"). Nobody had been told what they meant: that a lesson cannot be scheduled.

1. **A route that does not exist.** Both ask for `academics/classes` and read `data.groups`. The route is `academics/class-groups` and answers `data.classGroups` (each with its live `arms`, `listClassGroups`). So the class-arm choice of a lesson and of a notice was always empty.
2. **A shape that is not the route's.** The timetable reads the teachers as `data.items[].user.name`; `GET people/staff` answers `data.staff[]` with `firstName` and `lastName`. The teacher choice was always empty, and **the slot form's class-arm and teacher selects are `required`, so a lesson could not be scheduled by a person** (only by an API call). The subjects were asked for with the route's default page, 25, so a school with more subjects than that was shown the first 25.
3. **A form drawn once.** `SlotEditModal` and `AnnouncementComposerModal` stay mounted and take their starting values from `useState(initial…)`, which runs once, the first time they are drawn, with nothing to edit: **a lesson opened for editing showed the defaults of a new one, and a second notice opened with the words of the first.** (A saved edit would then have sent those stale values.) A choice that was blank when the form was first drawn also stayed blank when its list arrived.
4. **Unlabelled fields.** Every `<label>` in both forms was a plain sibling of its field (no `htmlFor`), the two timetable filters had an empty `sr-only` label, the dialogs had no name, the audience buttons of a notice did not say whether they were on, and a lesson card was a `div` with a click handler that the keyboard could not reach.

## 3. Decisions

- **D1. Fix what is wrong, keep the screens.** The routes and their rules are right and are not touched; the two callers ask for the right route and read its real shape (`class-groups?limit=100`, `people/staff?category=TEACHING&limit=100`, `subjects?limit=100`; 100 is the routes' ceiling).
- **D2. Draw a form only while it is open, keyed by what it edits** (`{open && <Form key={slot?.id ?? "new-<day>"} />}`), so it takes its starting values when it is drawn. In the slot form the three choices fall back to the first of their list when nothing was chosen, so a list that arrives after the form opened is not left blank (what is shown is what is sent).
- **D3. Tie the labels (`htmlFor` and `id`), name the dialogs (`aria-labelledby`), give the audience buttons `aria-pressed`, name the two filters, and make a lesson card a button** (`role="button"`, `tabIndex`, Enter and Space, an `aria-label` that says the subject, class, teacher and time). The words on screen are unchanged.
- **D4. Not replaced by the shared `Dialog` component.** It would add a focus trap, Escape and a return of focus, but it is a rewrite of two forms and of how they are tested; offered, not built (section 4).
- **D5. No route, library, schema or migration change.**

## 4. Not in this task

- The two forms are still hand-rolled modals with no focus trap and no Escape, and deleting a lesson or a notice still uses the browser's `confirm()`. Moving them to the shared `Dialog` is the maintainer's call.
- The teacher choice lists the first 100 teaching staff records; a school with more would need a search in the select.

## 5. Work breakdown and build record

- [x] Design (this file).
- [x] The code: `TimetablePanel.tsx`, `AnnouncementsFeed.tsx` (routes and shapes), `SlotEditModal.tsx` and `AnnouncementComposerModal.tsx` (labels, names, starting values), `TimetableCanvas.tsx` (the form drawn while open, filters named, cards as buttons).
- [x] `tests/e2e/class-choices.spec.ts` (2 tests, desktop and phone): a lesson is scheduled from the school's own arm, subject and teacher (in the database as chosen), its card is a button reached by the keyboard, its form opens with its own values and can be changed, a new lesson's form opens blank; a notice is addressed to a class arm and an audience, and the form opens blank the next time; axe (WCAG 2.2 A/AA) with both forms open in both themes.
- [x] Catalogue (the five rows of `docs/components/school-app.md` now say what the components do), tracker, HANDOVER 6.35.

**Build record (2026-11-14, worktree `octalve-edu-walk`, `TEST_LANE=2`, a production build of exactly the tree tested).**

- Gates in order: `pnpm typecheck` exit 0; `eslint` on the five components and the spec exit 0; `pnpm build` exit 0 (the unfixed tree, and the fixed tree twice); Prettier `--check` clean on the changed files.
- **Failing first**, `tests/e2e/class-choices.spec.ts` on the unfixed build (the spec present, the five components as on `dev`): **4 failed, 1 passed** (the one is the `setup` project). The failures are the right ones: `getByRole('dialog', { name: 'Schedule New Lesson Slot' })` not found (the dialog had no name), and the notice form's class-arm option `<tag> Form 1 A` found 0 times (the choice was empty), on the desktop and on the phone.
- A first fixed build passed the notice tests and failed the lesson tests on one thing of my own: the card's name said the arm ("A") where the test, and a person, expect the class and the arm ("Form 1 A"). The name now says both.
- **The fixed build: the four tests pass on the desktop and on the phone**, in a run with the neighbouring specs (`academics`, `responsive-and-a11y`, `shell`, `communication`): **123 passed, 6 failed, 46 skipped (tests that name one viewport)** in 21.8 min. **None of the six is from this change, and each was looked at:**
  - **Five on the phone** (`responsive-and-a11y`: sessions, grade scales, students, staff, a member of staff looking) fail with `controls smaller than 44x44 CSS px ... button[More information] 16x16`: the info icon of task 0055, which is 16 px with a 24 px touch target by the maintainer's decision; the spec's 44 px rule was not told. They fail the same way without this change (the element is not one this task touches); with a one-line exemption for the info icon in that spec all five pass (11 passed in the re-run). **That exemption is its own pull request**, not this one.
  - **One on the desktop** (`responsive-and-a11y`, the Users page: ten screens, each scanned in both themes) ran out of its 30 seconds. Run alone it timed out again on both viewports (the machine's load average was above 5, another project's server was running); with the suite's own allowance for a loaded machine, `TEST_TIMEOUT_SCALE=2`, it passes on both. It never reached a failed assertion, and the Users page is not touched here.

**Not run, and not claimed:** the api, integration, unit and https projects (no route, library or schema changed), a screen reader, mutation passes (deferred to the end of PHASE 2, the maintainer's call).
