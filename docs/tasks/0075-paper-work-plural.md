# 0075: The Forms list does not call "paper work" "paper works" (found by the walkthrough's paper-work chapter, task 0053)

- **Period / Focus:** 2026-11-16 (a wording defect seen on the first screenshot of chapter C13)
- **Status:** Done (the record is section 5)
- **Priority:** Low (a wrong word on a screen every teacher who sets paper work sees)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-paper-work-plural` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The Paper work list says "Paper work", and its empty state "No paper work yet.", not "Paper works" and "No paper works yet.".

## 2. How it was found, and what is wrong

Walkthrough chapter C13, step 114 (the screenshot of the Paper work tab of a school with none): the heading reads **"Paper works"** and the empty state **"No paper works yet. Write the first one with “New paper work”."** `FormsList.tsx` builds the plural of the kind's name by adding an "s" (`{upper(noun)}s`, `No {noun}s yet`, `The {noun}s couldn't be loaded.`), which is right for "practice set" and "questionnaire" and wrong for "paper work", which is not a thing that has a plural (the school sets "paper work", as it sets "homework"). The same list's buttons ("New paper work"), the form's title and the page's own header already say "paper work".

## 3. Decisions

- **D1. A second name map, not a rule.** `KIND_NOUNS` beside `KIND_NOUN` in `components/forms/model.ts` holds the name for more than one ("practice sets", "questionnaires", "paper work"). A rule ("add an s unless...") would be cleverer than three words need.
- **D2. Three places in `FormsList.tsx`** use it: the heading, the empty state, and the load-failure sentence. Nothing else in the forms screens appended an "s" to the noun (searched: `noun}s`, `}s</h2>`).
- **D3. No change to the pupil's lists** (`PupilPaperWork` already says "Paper work").

## 4. Not in this task

The counts' plural (`plural(n, "question")` and the like) are separate and correct.

## 5. Build record and tests

**Build record (2026-11-16, worktree `octalve-edu-walk`, `TEST_LANE=2`, `TEST_TIMEOUT_SCALE=2`; `dev` at `7364e45`).**

- **Failing first**, with `src` identical to `dev` (the build tested was `dev`'s, made for the C12 whole run; `src` had not changed since): `tests/e2e/forms-list-wording.spec.ts`, desktop and phone: **4 failed, 5 passed**. The four failures are the paper work list's two tests per viewport; the first read `Received string: "Paper worksNew paper workNo paper works yet. Write the first one with “New paper work”."`. The five that passed are the `setup` project and the practice-set and questionnaire lists on each viewport (their words were already right). The control (axe and overflow) asserts the empty state first, so it failed for the same reason and its axe scan did not run on the unfixed page.
- **Gates in order, on the fixed tree:** `tsc --noEmit` exit 0; `eslint` on the two sources and the spec exit 0; `pnpm build` exit 0 (a production build of exactly the tree tested); Prettier `--check` clean on the changed files (`FormsList.tsx` and `model.ts` were clean at `HEAD`).
- **The fixed build:** `unit` **1268 passed**; browser, desktop and phone, the new spec plus `forms-screens.spec.ts` (which drives these lists): **29 passed, 0 failed**.

**Not run, and not claimed:** `api`, `integration` and `https` (no route or schema changed), the rest of the browser suite, mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**
