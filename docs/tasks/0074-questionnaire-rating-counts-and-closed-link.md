# 0074: A questionnaire's rating answers are counted, and a closed questionnaire's link box says it is closed (found by the walkthrough's forms chapter, task 0053)

- **Period / Focus:** 2026-11-16 (two flow-audit findings from reading the screenshots of chapter C12)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium (1: the results of a rating question cannot be read once more than a few people answer) and Low (2: a sentence that is false for a closed questionnaire)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-questionnaire-results-and-closed-link` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

1. The results of a "Rating (1 to 5)" question show **how many people gave each rating**, as a choice question's results do.
2. The link box of a public questionnaire that has been **closed** says that it is closed, not that the link "works once the questionnaire is published".

## 2. How they were found, and what is wrong

**F1. Ratings are listed, not counted** (C12, step 113, the administrator reads what the staff answered). The Results tab showed the rating question with the single answer as a grey box reading "4", the way a written answer is shown. `aggregateQuestionnaireAnalytics` (`src/lib/forms/questionnaires.ts`) counts SINGLE, TRUE_FALSE and MULTI and sends every other kind down the "free text" branch, so a rating comes back as `textResponses: ["4", "5", "4", ...]`: with thirty answers the page is a column of thirty numbers and no totals. A rating has five fixed values; it is a choice.

**F2. A closed questionnaire's link box says it will work once published** (C12, step 111). `PublicLinkBox` takes `published` and, when it is false, says "The link works once the questionnaire is published." That is right for a draft. For a closed questionnaire it is false: nothing here publishes a closed questionnaire again (the page offers Publish only for a draft), and the link no longer opens (task 0072).

## 3. Decisions

- **D1. A rating is counted over its five values.** In the pure function, RATING joins the counted kinds with the options "1" to "5" (the label is the number). The answer is stored as a number (`validateAndNormalizeAnswers`), and the tally already compares by `String(value)`. The page needs no change: it draws `optionCounts` for any kind. No average is added (not asked for; the counts say more).
- **D2. Withholding is unchanged.** `withholdSmallSample` strips every question to its text below the minimum for an anonymous questionnaire, whatever the kind, so a rating's counts are held back exactly as a choice's are. Before this change a rating's raw values were held back by the same rule.
- **D3. The link box is told the status.** `PublicLinkBox` gets `closed` and says "This questionnaire is closed. Its link no longer opens." A draft keeps its sentence. Both callers (`FormsList`, `FormOverview`) pass it.
- **D4. No route, schema or migration change.** The analytics route's answer keeps its shape (`optionCounts` is already there for choices).

## 4. Not in this task

An average for ratings; reopening a closed questionnaire (there is no such action); the public link's own sentence (task 0072).

## 5. Work breakdown

- [x] Design (this file).
- [x] Tests first: `tests/unit/questionnaires.spec.ts` (a rating is counted over 1 to 5 and has no text list); `tests/e2e/questionnaire-results-and-closed-link.spec.ts` (desktop and phone: the Results tab shows each rating with its count; a closed public questionnaire's box says it is closed, in the list and on its page; axe and overflow in both themes).
- [x] The fix: `questionnaires.ts`, `PublicLinkBox.tsx`, `FormsList.tsx`, `FormOverview.tsx`.
- [x] Catalogue rows, tracker TASK-0074, HANDOVER 6.45.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-16, worktree `octalve-edu-walk`, `TEST_LANE=2`, `TEST_TIMEOUT_SCALE=2`; `dev` at `1589565`).**

- **Failing first**, with `src` identical to `dev` (the build tested was the one made for task 0073; `src` had not changed since, so no rebuild): `unit`, `questionnaires.spec.ts`: **1 failed, 5 passed**; the failure is the new test, `Received: ["4", "4", "5"]` where no text list is expected. Browser, the new spec, desktop and phone: **4 failed, 1 passed** (the `setup` project). The rating test found three list items where five are expected (the three raw answers); the closed-link test found the row and read "The link works once the questionnaire is published." in it.
- **Gates in order, on the fixed tree:** `tsc --noEmit` exit 0; `eslint` on the four sources and the two specs exit 0; `pnpm build` exit 0 (a production build of exactly the tree tested); Prettier `--check` clean on the changed files (the four sources were clean at `HEAD`).
- **The fixed build:** `unit` **1268 passed** (one more than before: the new test); `api`, the three specs that read questionnaire results and the public link (`questionnaire-anonymity`, `forms-results-grant`, `forms-public-questionnaire`): **31 passed**; browser, desktop and phone, the new spec plus `forms-screens.spec.ts`: **25 passed, 0 failed**.

**Not run, and not claimed:** the rest of the `api` project, `integration` and `https`, the rest of the browser suite, mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**
