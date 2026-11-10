# 0034: The light-theme contrast scans stop failing at random (test-only)

- **Period / Focus:** 2026-11-10 (a flake in the browser specs; no application code changes)
- **Status:** Built; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `fix/theme-fade-contrast-flake` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The browser specs that scan a screen with axe in both themes stop failing now and then on `color-contrast` in the light theme, on a different screen each run. No test may be retried away (`retries: 0`, `tests/README.md`), so the cause is removed.

## 2. Context

- **What the full-suite runs showed (tasks 0031, 0032, 0033).** Each full run had a handful of light-theme `color-contrast` failures, never the same specs twice, and each one passed on its own. They were read one by one and none was in the code under test.
- **The cause.** The colours are CSS variables, so the theme toggle (and a test) only changes `data-theme` on `<html>`; nothing reloads. But 48 components carry `transition-colors` / `transition-all` (150 ms), so every colour **fades** for 150 ms after the flip. axe measures the colour that is painted at that instant. The old specs flipped the theme and then waited for `networkidle` (which says nothing about a CSS transition) and scanned at once, so a scan could land inside the fade and measure a colour that is neither theme's. `responsive-and-a11y.spec.ts` had already seen it once ("axe measured #565c6a on #a8acb4") and carried its own local `settled()` wait; twelve other specs had a copy of the flip without it, and the new logo spec (task 0033) a fixed 250 ms pause.
- **The application is right.** `globals.css` already drops every transition to 0.01 ms for a person who asks for reduced motion; nothing in the product changes.
- **AlEemaan is not touched.** It met the same flake earlier (about a third of the runs of its portal Forms tests) and fixed it in its `page` fixture with `emulateMedia({ reducedMotion: "reduce" })` (commit `ba7a018`), so no test there looks at a transition. A debug run on a fresh AlEemaan worktree showed every running transition there lasts 0.01 ms, so a second fix would be churn.

## 3. Decisions

- **D1. One helper, not a copy per spec.** `setTheme(page, theme)` in `tests/support/theme.ts` flips `data-theme` and returns only when every running **CSS transition** has finished. The flip and the wait are one `evaluate`, so no frame can slip between them; reading `getAnimations()` brings the style up to date first, so the transitions the flip has just started exist when the wait begins. Only transitions are awaited: an infinite animation (the loading spinner) never finishes and would hang it. `currentTheme(page)` reads the theme to put it back afterwards.
- **D2. Not `reducedMotion` in Octalve's fixture (AlEemaan's way).** It is one line and covers every future spec, but it also turns on the app's every reduced-motion branch for the whole suite (about 3,000 tests) and means the product is never scanned the way most people see it. The helper changes nothing about the environment and waits for the real fade. Trade-off accepted: a new spec has to use the helper (D3 makes forgetting it fail).
- **D3. A guard.** `tests/unit/theme-flip-guard.spec.ts` reads every browser spec and fails if one assigns `dataset.theme` itself. One line is exempt on purpose: the proof test in `theme.spec.ts`, which flips by hand to show the fade, marks it `theme-flip: deliberate`.
- **D4. The proof is a test.** `theme.spec.ts` gets a test that a flip made by hand leaves colour transitions running (the window a scan can fall into), and that `setTheme` returns only when none is left.

## 4. Work breakdown

- [x] `tests/support/theme.ts` (`setTheme`, `currentTheme`).
- [x] The fourteen browser specs that flipped the theme by hand use it (the hand-made flips are gone); `responsive-and-a11y`'s own `settled()` stays, since it also covers what a client-side refresh starts.
- [x] The guard spec (D3) and the proof test (D4).
- [x] Docs: this record, the tracker, `tests/README.md`.

## 5. Not in this task

- AlEemaan (see section 2). The walkthrough harness has its own theme control and is not a test of colour.
- Any change to the application's transitions.

## 6. Build record and tests (2026-11-10)

**What changed.** Tests and their docs only: `tests/support/theme.ts` (new), `tests/unit/theme-flip-guard.spec.ts` (new), a proof test in `tests/e2e/theme.spec.ts`, fourteen browser specs switched to `setTheme`/`currentTheme` (`auth-logo`, `finance-standing-screens`, `forms-screens`, `learn-screens`, `programs-screens`, `programs-work-screens`, `promotion-screens`, `question-bank-admin-screens`, `question-bank-print`, `question-bank-questions`, `question-bank-reports`, `responsive-and-a11y`, `results-approvers-screen`, `results-screens`), this record, the tracker and `tests/README.md`. No application code, no migration, no schema change.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors (one existing warning in `results-screens.spec.ts`, an unused `Person` import that was already there); `pnpm build` OK; Prettier clean on every new file and on every changed file that was clean at `dev`.

**Failing first.** The same 227 tests (the fifteen specs on desktop and phone, plus the setup test) on one lane, one worker, the same build, with `setTheme` reduced to the old line (flip and carry on, the `networkidle` waits left in place):

- **204 passed, 21 failed, 2 skipped (22 minutes).**
- Read one by one: **19 are the light-theme `color-contrast` rule**, in `forms-screens` (7), `learn-screens` (8) and `question-bank-reports` (4); the other 2 are the proof test failing as it should ("setTheme must not return while a colour is still fading", 5 transitions still running).

**With the helper.** The same tests plus the guard spec: **227 passed, 0 failed, 2 skipped (30 minutes; the machine was also running another build and test run).** Zero contrast failures in a run in which the old line had 19.

**What this does and does not show.** One run of each is evidence, not a rate: the old line failed 19 times in one run and the helper never, in the specs that were failing, so the cause is the one found. It does not prove no scan can ever fail again (a scan can still fail for a real reason). **Not run:** the rest of the suite (the change touches only the specs listed, the helper and the guard), the HTTPS project, anything against a hosted database.

**AlEemaan.** Not changed (see section 2). Its worktree was removed unpushed.
