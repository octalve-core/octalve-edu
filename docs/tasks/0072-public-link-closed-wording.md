# 0072: A public questionnaire's link that no longer opens says why it may not, in words that are true (found by the walkthrough's forms chapter, task 0053)

- **Period / Focus:** 2026-11-16 (a flow-audit finding: the school closes its public questionnaire and a visitor who opens the same link is told they copied it wrongly)
- **Status:** Done (the record is section 6)
- **Priority:** Low (a wording defect; nothing is lost or exposed)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-public-link-closed` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The sentence a visitor reads at a public questionnaire's link that the school can no longer be answered is **true for every case that produces it**, and does not send a person with a correct link off to check their copying.

## 2. How it was found, and what is wrong

Walkthrough chapter C12 (task 0053), step "closing a questionnaire". The administrator closes the public questionnaire; a visitor who opens the same link (the one the school handed out, copied whole) reads **"This link doesn't match a questionnaire. Check that you copied all of it."** (screenshot of the step).

That is the page's sentence for any 404 from the public API, and the API answers 404 on purpose for four different cases (`withPublicQuestionnaire`): a token that is not a token, a token nobody owns, a school code that is not the school's own, and a questionnaire that is a draft or **closed** (it looks for `status: PUBLISHED` only). `tests/api/forms-public-questionnaire.spec.ts` pins that, so that a link "says nothing about what it is not". The page's code already had a sentence for a closed questionnaire ("This questionnaire is closed.") but it is for the 403 the API gives when the window has ended, which is checked **after** the 404 check, so a closed-by-hand questionnaire never reaches it. For the person with a correct link the sentence is false: it says the link is wrong and asks them to copy again.

## 3. Decisions

- **D1. The API is not changed.** Telling "closed" from "never existed" would let anyone holding a guessed or old token learn that it was once a questionnaire; the choice not to say is a security decision with a test, and stays.
- **D2. The sentence is true of all four cases.** The 404 now reads **"This questionnaire isn't open for answers. It may have been closed, or the link may be incomplete: check that you copied all of it."** It names both possibilities and does not say which one it is (which the page cannot know).
- **D3. The 403 sentences are unchanged** ("not open yet", "closed" for an ended window, "not open to the public"): there the API does say which.

## 4. Not in this task

The public page does not show the school's name or a contact for a closed link (nothing about the school is shown on that page by design, to keep the link saying nothing).

## 5. Work breakdown

- [x] The test first: `tests/e2e/learn-screens.spec.ts` ("a link that cannot be answered says why in a sentence"): its three 404 cases expect the new sentence.
- [x] The fix: one line in `PublicQuestionnaire.tsx`.
- [x] Catalogue row (`docs/components/school-app.md`), tracker TASK-0072, HANDOVER 6.43.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-16, worktree `octalve-edu-walk`, `TEST_LANE=2`, `TEST_TIMEOUT_SCALE=2`, a production build of exactly the tree tested; `dev` at `94046c5`).**

- **Failing first**, on a build of the unfixed tree (`src` identical to `dev`): `learn-screens.spec.ts`, the test "a link that cannot be answered says why in a sentence", desktop and phone: **2 failed, 1 passed** (the passing one is the `setup` project). Both failures read `Received string: "QuestionnaireThis link doesn't match a questionnaire. Check that you copied all of it."` against the expected new sentence.
- **Gates in order, on the fixed tree:** `tsc --noEmit` exit 0; `eslint` on the component and the spec exit 0; `pnpm build` exit 0; Prettier `--check` clean on the changed files (the component was clean at `HEAD`, so `--write` formatted only my line, split in two).
- **The fixed build:** the two public-questionnaire tests of `learn-screens.spec.ts`, desktop and phone: **5 passed** (1 setup, 2 per viewport); `unit` **1267 passed**; `forms-public-questionnaire.spec.ts` (the API test that pins the 404 for an unknown token, another school's code, a draft and a closed survey): **12 passed**, so the API is unchanged and still says nothing about what a link is not.

**Not run, and not claimed:** the rest of the browser suite (one component's sentence changed), the `integration` and `https` projects, mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**
