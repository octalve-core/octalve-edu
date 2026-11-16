# 0073: A refused "New practice set" or "New questionnaire" form shows its reasons where the person is looking (found by the walkthrough's forms chapter, task 0053)

- **Period / Focus:** 2026-11-16 (the same defect as task 0071, found in the next chapter: pressing the save button of a refused long dialog form changes nothing the person can see)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium (a teacher presses Create, nothing visibly happens, and the reasons are above the top edge of the dialog)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-forms-refusal-in-view` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

When the builder (`FormBuilderDialog`: a practice set, a questionnaire or paper work) refuses a save, the list of what is wrong is **brought into view** inside the dialog. Nothing about the words, the checks or the routes changes.

## 2. How it was found, and what is wrong

Walkthrough chapter C12 (task 0053), step 105 "an empty practice set is refused". The screenshot after pressing **Create practice set** shows the dialog scrolled to its foot (the button is there) and **no sign that anything was refused**: the alert ("Give it a title.", "Write the question for question 1.") is the first thing in the form, above the top edge of a dialog that is taller than the 720-pixel window. A screen reader hears it (`role="alert"`); a sighted person pressed Save at the bottom of a long form and the page looks the same. This is the shape task 0071 fixed in the question bank's form and recorded as open ("other long dialog forms with an alert at the top may do the same", D4); this is the first of them checked.

## 3. Decisions

- **D1. The same fix as 0071.** A wrapper with a ref around the alert, and an effect that calls `scrollIntoView({ block: "nearest" })` when the list of problems changes and is not empty. `nearest` moves nothing when the list is already visible; the dialog is the scrolling box, so only it moves.
- **D2. Focus stays where it is** (on the button that was pressed); the alert announces itself.
- **D3. Only `FormBuilderDialog`.** `FormEditDialog` (the same alert at its head) has four fields and the class choices, a form that fits the window on a desktop; it was not made to scroll in the walkthrough and was not changed. Recorded below.
- **D4. No change to words, checks, routes or the model.**

## 4. Not in this task

`FormEditDialog` (D3); the other long dialog forms of the app (the Users, Academics and Finance dialogs): not checked one by one. The refusal sentences themselves are unchanged.

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/e2e/forms-refusal.spec.ts` (3 tests, desktop and phone): an empty practice set and an empty questionnaire are refused and the alert is **in the viewport** (failing first); axe and overflow in both themes with the refusal showing (a control).
- [x] The fix: `FormBuilderDialog.tsx`.
- [x] Catalogue row (`docs/components/school-app.md`), tracker TASK-0073, HANDOVER 6.44.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-16, worktree `octalve-edu-walk`, `TEST_LANE=2`, `TEST_TIMEOUT_SCALE=2`, a production build of exactly the tree tested; `dev` at `7325e23`).**

- **Failing first**, on a build of the unfixed tree (`src` identical to `dev`), desktop and phone: **4 failed, 3 passed**. The four failures are the first test for each kind (practice set and questionnaire) on each viewport, all reading `Received: viewport ratio 0` (the alert was in the DOM with the right text and outside the visible part of the dialog). The three that passed are the `setup` project and the control (axe and overflow with the refusal showing), one per viewport.
- **Gates in order, on the fixed tree:** `tsc --noEmit` exit 0; `eslint` on the component and the spec exit 0; `pnpm build` exit 0; Prettier `--check` clean on the changed files (`FormBuilderDialog.tsx` was clean at `HEAD`, so `--write` was not needed).
- **The fixed build:** browser, desktop and phone, the new spec plus `forms-screens.spec.ts` (which drives this dialog: practice sets, questionnaires and paper work written, published and closed): **27 passed, 0 failed**; `unit` **1267 passed**.

**Not run, and not claimed:** `api`, `integration` and `https` projects (no route or schema changed), the rest of the browser suite, mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**
