# 0071: A refused question form shows its reasons where the person is looking (found by the walkthrough's question-bank chapter, task 0053)

- **Period / Focus:** 2026-11-15 (a flow-audit finding: pressing "Save as a draft" on a question form that is refused changes nothing the person can see)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium (a teacher presses Save, nothing visibly happens, and the reasons are above the top edge of the dialog)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-question-form-refusal` / PR into `dev`
- **Started:** 2026-11-15

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

When the question form refuses a save, the list of what is wrong is **brought into view** inside the dialog, so a person who had scrolled down to the Save button sees it without looking for it. Nothing about the words, the checks or the routes changes.

## 2. How it was found, and what is wrong

Walkthrough chapter C11 (task 0053), step "an empty form is refused". The screenshot taken after pressing **Save as a draft** shows the dialog scrolled to its foot (the Save button is at the bottom) and **no sign that anything was refused**: the alert ("The question is required." / "A question needs at least 2 options.") is the first thing in the form, above the fold of a dialog that is taller than the window (a desktop window 720 pixels high, a phone).

`QuestionForm.tsx` renders the problems as an `Alert` at the top of the form and does nothing else. A screen reader hears it (`role="alert"`), a sighted person does not see it: they pressed Save at the bottom of a long form, and the page looks the same. Every other save in the dialog that is refused does the same (a refusal by the server, a field too long), because they all go through `setProblems`.

The dialog is the scrolling box (`overflow-y-auto` on the `<dialog>`), so the fix is a scroll **inside** it, not of the page.

## 3. Decisions

- **D1. Scroll the problems into view when there are some.** A wrapper around the alert with a ref, and an effect that runs when the list of problems changes and calls `scrollIntoView({ block: "nearest" })`. `nearest` means: no movement when the alert is already visible (a short form on a tall screen), the smallest movement otherwise.
- **D2. Focus stays where it is.** Moving focus to the alert would also scroll, but it would take the keyboard away from the button the person pressed; the alert already announces itself (`role="alert"`). Only the view moves.
- **D3. No change to words, checks, routes or the model.** Only the form component.
- **D4. Not in this task, recorded.** The same shape (an alert at the top of a long dialog form, set after a Save at the bottom) may be in other dialogs; they were **not** checked one by one. The "Pictures" section of the same dialog has its own error line next to its own button, which is in view when the button is.

## 4. Not in this task

Other long dialog forms (D4); a confirmation inside the dialog after a successful first save (the form stays open and the "Saved as a draft" line is on the page behind it; a person sees the button change to "Save changes" and the Pictures section appear).

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/e2e/question-form-refusal.spec.ts` (2 tests, desktop and phone): an empty form is refused and the alert is **in the viewport** (failing first); axe and overflow in both themes with the refusal showing (a control: passes before and after).
- [x] The fix: `QuestionForm.tsx` (17 lines added, 8 changed; one file).
- [x] Catalogue row (`docs/components/school-app.md`), tracker TASK-0071, HANDOVER 6.42.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-15, worktree `octalve-edu-walk`, `TEST_LANE=2`, `TEST_TIMEOUT_SCALE=2`, a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` clean; `eslint` on the component and the spec clean; `pnpm build` exit 0; Prettier `--check` clean on the changed files (`QuestionForm.tsx` was clean at `HEAD`, so `--write` touched only my lines); the catalogue verifier 860 rows, 0 missing.
- **Failing first**, on the unfixed build (`src` as on `dev` `a8e0799`), desktop and phone: **2 failed, 3 passed**. The two failures are the first test, one per viewport, and both read `Received: viewport ratio 0` for the alert (the alert was in the DOM with the right text, and outside the part of the dialog that was visible). The three that passed are the `setup` project and the two control tests (axe and overflow with the refusal showing), true before and after.
- **The fixed build:** browser, desktop and phone (the new spec and `question-bank-questions`, which drives this form: an empty form refused in words, a draft saved, a picture added, a reviewer approving): **13 passed, 0 failed** (1 setup, 4 of the new spec, 8 of `question-bank-questions`); `unit` **1267 passed**.

**Not run, and not claimed:** `api`, `integration` and `https` projects (no route or schema changed), the other question-bank browser specs, the whole responsive spec (the new spec runs axe and overflow in both themes on the dialog that changed), mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**

**For the maintainer (open, not changed):** other long dialog forms with an alert at the top may do the same and were not checked one by one; the question dialog gives no confirmation of its own after the first successful save.
