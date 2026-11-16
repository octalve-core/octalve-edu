# 0076: Paper work whose closing time has already passed is refused unless it is given an earlier opening time (found by the walkthrough's paper-work chapter, task 0053)

- **Period / Focus:** 2026-11-16 (a flow-audit finding: paper work saved as "Opens 16 Nov 2026 · Closes 10 Sept 2026")
- **Status:** Done (the record is section 5)
- **Priority:** Low (it saves a state that cannot be true; nothing else reads it wrongly)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-paper-work-past-close` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Paper work can no longer be saved with a closing time that is earlier than its opening time, when the opening time is the one it was given by default.

## 2. How it was found, and what is wrong

Walkthrough chapter C13, step 115. The administrator makes paper work with a closing time of 10 September and no opening time (the form's "Opens" is optional). The list then reads **"Opens 16 Nov 2026, 18:04 · Closes 10 Sept 2026, 09:00"**: the service gives paper work with no opening time `opensAt = now` (`paper-work-service.ts`), and `validatePaperWorkInput` compares the two times only when **both** were typed. The paper work is therefore saved already closed, and closed before it opened. (A practice set or a questionnaire with no opening time stores none, so it has no such state.)

## 3. Decisions

- **D1. Refuse it, in words.** With no opening time and a closing time at or before now, the API answers 400 "The closing time has already passed. Choose a later one, or give an earlier opening time." and the builder says the same before sending, so nothing is saved. The sentence is one constant (`lib/forms/paper-work-messages.ts`, which has no database client, so the browser may import it).
- **D2. An earlier opening time is the way to record paper work whose time has gone.** Opens 1 Sep, closes 10 Sep is accepted: a teacher may record paper work after the fact, and pupils can then be marked as handed in late (what the walkthrough does). The existing "closes after it opens" check for two typed times is unchanged.
- **D3. The validator takes `now` as an argument** (default the current time) so that the unit test does not depend on the date.
- **D4. Not changed:** practice sets and questionnaires (no stored opening time, no inconsistent state); what the roll call does with paper that is no longer open.

## 4. Not in this task

Whether a roll call should be editable once paper work has closed (it is: the teacher records hand-ins; that is how lateness is recorded).

## 5. Build record and tests

**Build record (2026-11-16, worktree `octalve-edu-walk`, `TEST_LANE=2`, `TEST_TIMEOUT_SCALE=2`; `dev` at `3d665b5`).**

- **Failing first**, with `src` identical to `dev` (the build tested was made for the C13 run after task 0075 merged; `src` unchanged since): `unit`, `paper-work.spec.ts`: **1 failed, 5 passed** (the new test: `Expected: false, Received: true` for a closing time in the past with no opening time). Browser, `forms-paper-work-closing.spec.ts`, desktop and phone: **4 failed, 3 passed**: the refusal test and the axe-and-overflow control (which asserts the refusal first) failed on each viewport, with `Expected substring: "The closing time has already passed..."`; the `setup` project and the "accepted with an earlier opening time" test on each viewport passed (that path is unchanged).
- **Gates in order, on the fixed tree:** `tsc --noEmit` exit 0; `eslint` on the three sources and the two specs exit 0; `pnpm build` exit 0 (a production build of exactly the tree tested); Prettier `--check` clean on the changed files (`paper-work.ts` and `FormBuilderDialog.tsx` were clean at `HEAD`).
- **The fixed build:** `unit` **1269 passed** (one more than before); `api`, the two specs that create paper work (`forms-campus-scope`, `question-bank-parity-gates`): **92 passed**; browser, desktop and phone, the new spec plus `forms-screens.spec.ts` and `forms-refusal.spec.ts`: **33 passed, 0 failed**.

**Not run, and not claimed:** an API test of the new 400 on its own (the unit test pins the validator that the service calls), the rest of the `api` project, `integration` and `https`, the rest of the browser suite, mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**
