# 0066: Three finance fields are named for a screen reader and can be clicked by their label (found by reading the source for the walkthrough's finance chapter, task 0053)

- **Period / Focus:** 2026-11-15 (an accessibility finding made before the walkthrough's finance chapter was written: three form fields have a visible label that is not tied to them)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium (the same class as task 0064: a person using a screen reader meets an unnamed field on the Finance page)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-finance-labels` / PR into `dev`
- **Started:** 2026-11-15

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On the Finance page every field of the fee schedule form and of the "Generate Term Invoices" dialog has an accessible name, and its visible label focuses it when clicked.

## 2. How it was found, and what is wrong

- Reading `src/components/finance` for the walkthrough's finance chapter (task 0053), the locators a person's eye uses ("Academic Period", "Due Date (Optional)", "Target Class (Optional)") do not exist for a browser: each is a `<label>` with no `htmlFor`, whose control has no `id` and which does not wrap it. A scan of every `<label>` under `src` for one with no `htmlFor` and no control inside it found seven: **three are real fields a person can reach**, one is a group label ("Delivery Channel", below) and three belong to a component nothing mounts (below). The three:
  - `InvoicesDashboard.tsx`, the "Batch Generate Term Invoices" dialog: **Academic Period** (a select) and **Due Date (Optional)** (a date field).
  - `FeeStructuresPanel.tsx`, the "Create Fee Schedule" dialog: **Target Class (Optional)** (a select). Its two other fields come from the `TextField` component, which ties its own label.
- So a screen reader announces "combo box" with no name, a click on the words does nothing, and a test (or a person with voice control) cannot say "Academic Period". The accessibility audit of the page (`responsive-and-a11y`) never opens these two dialogs, so it did not see it.
- **Not part of this task, and why:** `CertificatesConsole.tsx` has three more untied labels, but nothing mounts it (`grep` finds no use outside the file) and it is seeded with invented certificates: unreachable dead code, which is the maintainer's to remove or finish. `BroadcastComposer.tsx`'s "Delivery Channel" is a `<label>` over a row of buttons, not a field: a different, smaller question (a group name), left as it is.

## 3. Decisions

- **D1. Tie each label to its control with an id from `useId()`**, as the timetable and notice forms were fixed in task 0064 (`htmlFor` on the label, `id` on the control). Nothing changes on the screen: the same words, the same layout, the same classes.
- **D2. The three fields only.** The two components' other fields already have names; no other file is touched.
- **D3. No behaviour, route, library, schema or migration change.**

## 4. Not in this task

The dead `CertificatesConsole` and the "Delivery Channel" group label (section 2).

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/e2e/finance-form-labels.spec.ts` (1 test, desktop and phone): the two dialogs opened by the school's administrator; each field found by its label; a click on the label's words focuses the field; a fee is made and term invoices are generated through the labelled fields (the invoice is in the database); axe (WCAG 2.2 A/AA) and horizontal overflow with each dialog open, in both themes. Failing first on the unfixed build.
- [x] The fix in the two components (`useId()`, `htmlFor` and `id`; 16 lines added, 5 changed, no visible change).
- [x] Catalogue rows of the two components (they say the fields are tied), tracker, HANDOVER 6.37.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-15, worktree `octalve-edu-walk`, `TEST_LANE=2`, a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` exit 0; `eslint` on the two components and the spec exit 0; `pnpm build` exit 0 (the unfixed tree and the fixed tree); Prettier `--check` clean on the changed files; the catalogue verifier 860 rows, 0 missing.
- **Failing first**, `tests/e2e/finance-form-labels.spec.ts` on the unfixed build (the spec present, the two components as on `dev`): **2 failed, 1 passed** (the one is the `setup` project), on the desktop and on the phone. The first run failed at the options of "Target Class (Optional)" (0 found), which could also have meant an empty class list, so a line was added that asks for the field itself first; the second run on the same unfixed build failed on exactly that: `getByRole('dialog').getByLabel('Target Class (Optional)')` **element(s) not found**, on the desktop and on the phone. That is the finding: the field has no name.
- **The fixed build:** `unit` **1267 passed**; the browser run of the new spec, `finance-standing-screens` (the Finance page, the payment rules, the standing screens: 7 tests) and the whole `responsive-and-a11y` spec, on the desktop and on the phone, with `TEST_TIMEOUT_SCALE=2`: **73 passed, 0 failed**, 21.8 min. The new test passes on both viewports, including axe in both themes with each dialog open.

**Not run, and not claimed:** the `api`, `integration` and `https` projects (no route, library or schema changed), the whole suite, a screen reader (the names are what axe and the browser's accessibility tree report), mutation passes (deferred to the end of PHASE 2, the maintainer's call). **No migration, no environment change.**

**For the maintainer (open, not changed):** `CertificatesConsole.tsx` is mounted nowhere and is seeded with invented certificates (and has three more untied labels): remove it or finish it; "Delivery Channel" in `BroadcastComposer.tsx` is a label over a row of buttons (a group name, not a field).
