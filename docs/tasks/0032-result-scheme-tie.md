# 0032: A saved result is tied to the class's assessment scheme (the exam is one of its parts, and the first use locks the scheme)

- **Period / Focus:** 2026-11-09 (a follow-up to task 0031, Promotion and the Results screens)
- **Status:** Built and tested; PR into `dev`
- **Priority:** High (an integrity gap in the one writer of marks; it needs no migration)
- **Assignee:** Claude (maintainer decides the open points in section 7)
- **Target Branch / PR:** `claude/octalve-result-scheme` / PR into `dev`
- **Started:** 2026-11-09

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`POST /academics/results` accepts only parts (components) that belong to the class's assessment scheme, with that scheme's names and maxima, and a total out of that scheme's total; and the first save under a scheme locks it, as the scheme's own code has always said it would. Today a hand-made request can store parts of its own invention, and a scheme can be edited after marks exist.

## 2. Context and what was found

- Task 0031 §8 listed this: *the save checks that the parts add up to the score and that each part is within its own maximum, but not that the part names and maxima are the class's scheme.* Left "for a decision" because it changes the API's contract. The maintainer then asked for the recommended items to be built (2026-11-09), and this was the first.
- **The scheme was always meant to be locked by a result.** `lockScheme` (src/lib/academics/assessment.ts) says it is "called the first time a result references it … Phase 1.4 is its first caller", and the database already refuses any change to a locked scheme or its components (`assessment_scheme_locked`, `assessment_component_locked`, migration 20261013090000). **Nothing calls `lockScheme` outside the tests**, so in Octalve a scheme stays editable after marks exist: an edit changes what the next save must look like while the saved parts keep the old names, and the Marks sheet, which matches parts by name, shows blanks.
- AlEemaan did this from the start: its `results.ts` stores the scheme on each result and calls `lockScheme` on the first one ("the first result locks the scheme and the scale it used"). Octalve's `Result` has no scheme column (it stores `componentScores` as self-describing JSON), so this task ports the behaviour without a column.
- The only caller in the product is the Marks screen (task 0031), which already sends exactly the scheme's parts and `maxScore = totalMax`. Tests that save results: `results.spec.ts`, `results-edit-rules.spec.ts` and others create no scheme (no scheme in force: unchanged); `results-sheet.spec.ts` and the results screens spec save under one.

- **A bug in the Marks screen of task 0031, found while writing this one.** The scheme rule is *components + exam = total, exactly* (`checkScheme`): in a scheme made through the app (Academics, Assessment) the **components are only the continuous-assessment parts and the exam is the separate `examMax`** ("Enter the exam mark, 0 if there is no exam"). `Result` has no exam column and nothing outside scheme setup reads `examMax`. The Marks sheet showed `scheme.components` only, so **for a real scheme a teacher could not enter the exam mark at all**, and the total was out of the scheme's total while the cells could only reach total minus exam. 0031's fixtures hid it: they were written straight into the database with an "Exam" *component* next to `examMax` (e.g. CA 40 + Exam 60 + examMax 60 = 160, which the rule rejects when a scheme is made through the app), so no test ever met a scheme the product can make. This task fixes the screen, the sheet and the fixtures together; tying a save to the scheme's components alone would have refused every real exam mark.

## 3. Decisions

- **D0. The exam is a part of the saved result.** The parts a result is entered under are the scheme's components in order, then **`Exam` out of `examMax` when `examMax` > 0** (`entryParts`, one function used by the sheet and by the save). The saved result already stores its parts as self-describing JSON, so no column and no migration. If a component is already called "Exam" (ignoring case) the exam part is called "Final exam" (then "Examination", then "Exam 2", "Exam 3"…), so the names stay unique. The sheet answers with `examMax`, `components` (as the scheme defines them) and `parts` (what to enter); the Marks screen enters `parts`.

- **D1. Which scheme applies.** The same rule as the sheet: a student's ACTIVE enrolment in the period's session gives an arm, the arm's class group gives its own live scheme, else the school's oldest live school-wide scheme, else none. One function (`src/lib/results/scheme.ts`) is used by both the sheet and the save so they cannot drift. A student with no active enrolment in that session (an administrator may save one) gets the school-wide scheme or none.
- **D2. No scheme in force: nothing changes.** There is nothing to tie to, so parts stay free-form and `maxScore` still defaults to 100.
- **D3. A scheme in force: the save must match it.**
  - If the request sends `components`: the same set of names as the scheme's **parts** (D0: the components and the exam; no extra, none missing, no repeats; order is free) and each `maxScore` equal to the part's. Anything else is `SCHEME_VALIDATION_FAILED` with a sentence naming the part and what the scheme has.
  - If the scheme has parts and the request sends a bare `score`: refused, the sentence listing the parts. Allowing it would let one request step around every rule above.
  - `maxScore` omitted means the scheme's total; sent, it must equal it. (The request schema's default of 100 is removed; the service now decides, so a scheme out of 60 is not refused for a client that said nothing.)
  - A scheme with no parts: a bare `score` out of its total.
- **D4. The first save under a scheme locks it**, in the same transaction, after every refusal has been decided and next to the writes (a refused request locks nothing). An audit row `ASSESSMENT_SCHEME_LOCKED` is written when this call did the locking. From then on a change to the scheme is a new version, which the Assessment screen already offers.
- **D5. Concurrency.** The save takes the **shared** form of the advisory lock the scheme editor takes exclusively (`assessment-scheme:<tenant>`): any number of saves go at once, and a save waits for an edit in progress and an edit waits for saves in progress, so the scheme a save validates against is the scheme it locks. The database triggers remain the last line.
- **D6. Drafts saved before a scheme change** are checked again when they are next saved (they carry the old parts); the sentence tells the teacher to enter the new parts. Published and locked results are never touched by this.

## 4. Work breakdown

- [x] `src/lib/results/scheme.ts`: `entryParts`, `schemeForClassGroup`, `schemesForStudents`, the problem sentences; the sheet uses it and answers `examMax` and `parts`.
- [x] The Marks screen enters `parts` (so the exam can be entered); the 0031 fixtures become schemes the app can make (components + exam = total).
- [x] `recordStudentResults` ties and locks (D3, D4, D5); the request schema no longer defaults `maxScore`.
- [x] Failing-first tests on a build of unmodified `dev` (API; and the sheet of a real scheme has no exam part there): a foreign part name, a wrong maximum, a missing part, a repeated part, a bare score under a scheme with parts, a wrong `maxScore`; and that the first save locks the scheme and an edit is then refused; plus the cases that must keep working.
- [x] The Marks screen shows the real sentence when a save is refused (it already shows the server's message); check it.
- [x] Docs: this record, the tracker, HANDOVER, task 0031 §8 updated, catalogues.

## 5. Not in this task

- A scheme column on `Result` (a migration; the self-describing parts make it unnecessary for this rule).
- Re-tying already saved results (a one-time report of drafts that no longer match is possible later).
- The grade scale (it is read, not locked, here; its lock is a separate question).

## 6. Maintainer's list

- **No migration.** Nothing to run on any hosted database.
- Behaviour change to tell schools: after the first marks are saved for a class, its scheme can no longer be edited in place, only versioned.

## 7. Open for the maintainer

- Whether the grade scale should be locked by the first result as AlEemaan does (it is not here).
- Whether a bare `score` should stay allowed for a scheme that has parts (D3 refuses it).
- **The exam part's name.** A scheme has an `examMax` but no name for the exam, so the part is called "Exam" everywhere (D0). The one existing test that saved under a real scheme, the Phase 1 lifecycle walk, had called it "Final Examination" and was changed to "Exam": that is the only existing expectation this task changed. A school that wants its own word ("Final Examination", "Endterm") needs an `examName` on the scheme: a column, so a migration; not done.

## 8. Build record and tests (2026-11-09 and 10)

**What exists.** `src/lib/results/scheme.ts` (`schemeForClassGroup`, `schemesForStudents`, `entryParts`, `partsProblem`, `entryProblem`); `recordStudentResults` ties and locks (D3, D4, D5) and takes `shareSchemeLock` (new, next to the editor's `lockSchemes` in `assessment.ts`, same key); `getSheet` answers `examMax` and `parts`; the request schema no longer defaults `maxScore`; the Marks screen enters `parts`. No migration, no new route.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors (1 old warning, an unused import in a 0031 spec); `pnpm build` OK; Prettier clean on every changed file that was clean at `dev`; catalogues 798 of 798.

**New and changed tests.** Unit `results-scheme` (17). API `results-scheme-tie` (11: refusals with their sentences and nothing saved or locked; one bad pupil refuses the request; any order, total left out, first save locks once with one audit row; a locked scheme is 409 to edit and a new version means re-entering a stale draft; a teacher under the same rule; two classes in one request; six simultaneous saves lock once, and a save waits for an edit that holds the advisory lock; the school-wide fallback, a pupil on no roll, the class's own scheme winning, an archived scheme; no scheme in force unchanged). API `results-sheet` (12, fixtures made schemes the app can make, new fields asserted). Browser `results-screens` (7 on desktop and 7 on a phone, Axe in both themes; the exam is saved as a part, the save locked the scheme, and a stale sheet after the scheme was replaced shows the server's sentence and saves nothing). One existing test changed: the Phase 1 lifecycle walk saved its exam as "Final Examination" and now saves "Exam" (section 7).

**Failing first, on a build of unmodified `dev` (f7a3bf7, its own lane).** `results-scheme-tie` with its serial mode switched off so every test runs: **9 of 11 fail**, each for the right reason (foreign parts answered 200 instead of 400; a total stored as 100 instead of 50; a scheme edited with 200 instead of 409 and never locked; a save that did not wait). The other two pass on old code by nature: "no scheme in force, unchanged", and the archived-scheme test, which only asserted an acceptance; it was strengthened afterwards (a refusal first, then acceptance after archiving) and **that strengthened version was not re-run on old `dev`**. `results-sheet`: 1 fails on old `dev` (no `examMax`/`parts`). `results-screens`: 1 fails on old `dev` with "columnheader Exam /60 not found" (the bug of section 2); the other 6 pass.

**Full suite on the fix (setup, unit, integration, api, e2e-desktop, e2e-mobile; lane 1): 3868 passed, 15 failed, 51 skipped, 4 did not run (1.2 h of test time; the run stalled for hours overnight and Chrome reported its network suspended, so the machine was probably suspended).** The 15, each read before it was explained:
- **1 caused by this change:** the lifecycle walk (the exam's name). Fixed; the walk passes 10 of 10 on re-run.
- **1 time-window flake:** `mfa.spec.ts` "confirming activates it…" expected a replayed TOTP code to be refused but a 30-second step had rolled over. Passes with the other 27 on re-run.
- **2 from a suspended network:** `password-reset` (one error is `net::ERR_NETWORK_IO_SUSPENDED`); both pass on re-run.
- **11 `color-contrast` in the light theme** in older browser specs (`forms-screens`, `learn-screens`, `question-bank-print`, `question-bank-reports`). **Not from this change** (it touches no styles, and no file those specs exercise): re-running the failed files gave 6 failures, then 11, then (a single file, twice) 1 and 4, **a different set each time**. With the element and colours logged the failure is the active sidebar tab measured as `#534cd2` on `#cccfe2` (4.07:1), blended colours that exist in neither theme: these specs flip the theme and scan at once, inside the 150 ms colour fade. Specs written since wait 250 ms for it. A test-only fix is its own task.

**Not run.** The HTTPS project; anything against a hosted database; the strengthened archived-scheme test on old `dev`; mutation passes (end of Phase 2).
