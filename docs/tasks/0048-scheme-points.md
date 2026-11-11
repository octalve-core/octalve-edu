# 0048: The points left open by task 0032: a school names its exam, the grade scale locks with the first result, a bare score stays refused, and schools are told about new versions

- **Period / Focus:** 2026-11-11 (the maintainer approved the 0032 points on 2026-11-11: "Approve D7, D8 and the 0032 points")
- **Status:** Built and tested; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-scheme-points` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

> **Migration note (task 0049, 2026-11-11):** `20261126090000_promotion_undo`, `20261127090000_exam_name` no longer exist as folders: the six migrations that were waiting for a hosted database were merged into one, `20261122090000_progress_promotion_results`, with the same schema (`docs/tasks/0049-squash-pending-migrations.md`). The text below is the record of what was built then and keeps the old names.

---

## 1. Objective

Task 0032 tied a saved result to the class's assessment scheme and left four points for the maintainer. All four are decided; this task builds them.

1. **A school names its exam part** ("Final Examination", "Endterm") instead of it always being "Exam". This is the one change that needs a database column, so it needs a migration, which the maintainer runs.
2. **The default grade scale locks when the first result is graded by it**, as the assessment scheme already does and as AlEemaan does, so a grade letter stored with a result keeps meaning what it meant.
3. **A bare score where the scheme has parts stays refused** (it would let a pupil's total bypass the scheme). It is refused today; this task pins it with an API test.
4. **Schools are told**, on the scheme screen, that once marks have been entered under a scheme it can no longer be edited in place and a change is a new version.

## 2. Context

- `entryParts` (`src/lib/results/scheme.ts`) names the exam part "Exam", or "Final exam", "Examination", "Exam 2"... when a component already took the name. A saved result stores its parts by name (`componentScores`), and a save is refused unless its parts are exactly the scheme's (`partsProblem`).
- A scheme is edited in place only while unlocked (`lockedAt` null). The first save under it locks it (task 0032, with the shared advisory lock so no edit can land between the save's check and its lock), a database trigger (`assessment_scheme_locked_guard`) then refuses a change to its name, totals, version, scope and lock, and a change is a new version.
- Grade scales have the same lock, version and trigger machinery (`lockScale`, `grade_scale_locked_guard`), and the exclusive advisory lock `grade-scale:<tenant>` that every edit takes. But **nothing calls `lockScale` when a result is saved**: a result stores `gradeLetter` and `gradeRemark` as text, copied from the default scale at that moment, and the scale can be edited in place afterwards, so a school can change what an "A" means while the old results still say "A".
- The last migration is `20261126090000_promotion_undo`.

## 3. Decisions

- **D1. `AssessmentScheme.examName`, a nullable text column with no default.** `null` means "the default name", so every scheme that exists keeps the parts it has and every saved result keeps matching its scheme. Cleaned like a component's name (runs of whitespace become one space, trimmed); blank or null is no name; 1 to 40 characters (a database check, and the application's own message); never the same as a component's name, in any case (a result stores its parts by name, so two parts of one name could not be told apart); not allowed when the exam is worth nothing (nothing to name).
- **D2. It is a frozen field.** The locked-scheme trigger is replaced (`CREATE OR REPLACE`, the same function) with `examName` among the protected fields, with `IS DISTINCT FROM`, so `null` to "Endterm" is a change and `null` to `null` is not. A PATCH of a locked scheme is 409 `LOCKED` as before; a new version carries the name unless it is given another.
- **D3. The name travels everywhere the exam part does.** `entryParts(components, examMax, examName)` uses it; the marks sheet and the import template (whose header is built from the parts) show it; the canonical snapshot (`snapshotScheme`) includes `examName` **only when set**, so a scheme without a name keeps the bytes and the SHA-256 it always had. The create, PATCH and new-version routes take `examName` (a string up to 200 characters on the wire, `null` to clear; the service cleans it and judges its length), the audit rows carry it, and the scheme dialog has an optional field "What the exam is called".
- **D4. The migration is additive and the maintainer's to run.** One nullable column, one check constraint on a column that is null everywhere, and the replacement of one trigger function. Nothing is dropped, renamed or backfilled. It is safe to run before or after the code is deployed: the old code ignores the column, and the new code reads `null` as "Exam". File: `20261127090000_exam_name`, after `20261126090000_promotion_undo`. It was run here only on the test lanes' databases.
- **D5. The grade scale locks with the first result it grades.** `recordStudentResults` takes the shared form of the scale lock (`shareScaleLock`, the same key every scale edit takes exclusively) before it reads the default scale, and after every refusal has been decided and the scheme lock is taken, `lockScale` locks the scale it graded by (when there is a default scale with bands and the request has entries); one audit row `GRADE_SCALE_LOCKED` ({ locked: false } to { locked: true, periodId }) for the call that locks, none for later saves. A refused request locks nothing. After that a PATCH of the scale is 409 `LOCKED` and the way is a new version, which takes the default flag (existing behaviour of `newScaleVersion`).
- **D6. The bare score stays refused.** No code change: `entryProblem` already refuses it with a sentence that lists the parts. The API test pins it with nothing saved and nothing locked.
- **D7. The notice is permanent text on the scheme screen**, under the heading: "Once marks have been entered under a scheme it is locked: it can no longer be edited, only replaced by a new version, which applies to marks entered from then on." The "In use - locked" pill and the "New version" button already existed; the sentence says why.
- **D8. Existing data.** Results already saved under an unnamed scheme carry a part named "Exam"; their schemes have `examName` null, so they still match. A school that names the exam of a scheme that already has results does it through a new version, which applies to results entered from then on; results saved before keep their old part name and are not rewritten.

## 4. Work breakdown

- [x] Design (this file).
- [x] Schema, migration `20261127090000_exam_name`, trigger replaced.
- [x] `scoring.ts` (the rule, the snapshot), `assessment.ts` and the three routes (create, PATCH, new version), `http.ts` (messages), `scheme.ts` and `sheet.ts` (the parts, the sheet's scheme).
- [x] The grade scale lock in `recordStudentResults` (`shareScaleLock`, `lockScale`, the audit row).
- [x] The scheme dialog and panel (the field, the name shown, the notice).
- [x] Tests: unit (the rule, the snapshot, the parts), API (the name end to end, the trigger, the bare score, the scale lock), the browser screens of Academic setup, mutation check, regression.
- [x] Docs: HANDOVER, tracker, CLAUDE.md banner, the catalogues (stale lines about `lockScheme` and `lockScale` corrected), task 0032's open points.

## 5. Not in this task

- Renaming the exam part of results that are already saved.
- A per-subject or per-term exam name.
- Locking the grade scale when it is merely made default, or on a scale that no result has used.
- Showing which results were graded by which version of the scale (a result stores the letter and the remark, not the scale's id).

## 6. Build record and tests

**Built on** `claude/octalve-scheme-points`. **One migration, the maintainer's to run: `20261127090000_exam_name`** (additive: one nullable column, one check constraint on a column that is null everywhere, and the locked-scheme trigger function replaced by a copy that also protects the new column; run it after `20261126090000_promotion_undo`). It was run here only on the test lanes' databases. Changed: `prisma/schema/academics.prisma`, `scoring.ts` (`EXAM_NAME_MAX`, the three problems, the snapshot), `assessment.ts` and the three scheme routes (create, PATCH, new version) and `http.ts` (messages and the field path), `results/scheme.ts` and `sheet.ts` (the parts and the sheet's scheme), `academics/grading.ts` (`shareScaleLock`), `results/service.ts` (the shared scale lock before the default scale is read, and `lockScale` plus the audit row after the scheme lock), `AssessmentDialogs.tsx` and `AssessmentPanel.tsx` (the optional field, the tile label, the notice). The bare score needed no code (D6): it is pinned by a test.

**What the build found.**
- The catalogue said `lockScale` "has no caller in `src`, only in tests": true until now, and it is the reason the grade scale never locked (the open point of task 0032). It has a caller now and the row says so; the row for `assessment.ts` had not listed `shareSchemeLock`, which already existed, and now does. Both in `docs/functions/school-app.md`.
- A whole-suite run made before the race test and the extra screen assertions were added said 2,901 passed (unit and API) and 43 passed (browser); it predates those tests and is superseded by the regression below.
- My first unit-only mutation rounds on a lane that had no build never ran: the Playwright config starts a web server even for unit specs, and a fresh lane has no `.next`. They were redone once the lane had a build.

**Tests.**
- Unit `scoring-rules` (extended): a name of 1 to 40 characters is valid; empty or over 40 is `EXAM_NAME_INVALID`; a name a component already has, in any case, is `EXAM_NAME_DUPLICATE`; a name for an exam worth nothing is `EXAM_NAME_WITHOUT_EXAM`; the name is judged before the sum; a named exam is stored in the snapshot and an unnamed one keeps the bytes and the hash it always had. Unit `results-scheme` (extended): the school's name is the exam part's name, and a scheme with a named exam asks for, and accepts, that name and no other.
- API `results-scheme-points` (new, 13 tests): the name end to end (cleaned, stored, shown by the API, part of the snapshot); no name, null or blank is the default; a name too long, a component's, for an exam worth nothing, or not text is refused with its own sentence and nothing is made; the sheet and the import template use the name; a save must use that name (the default name is refused with a sentence listing the parts) and the save locks the scheme; once locked, a PATCH is 409 `LOCKED` and the database itself refuses to change, set or clear the name; a new version keeps or changes the name, the old version keeps its own, and the audit row; the bare score is refused with a sentence listing the parts, nothing saved or locked; with no default scale a save locks none; with one, a refused save locks nothing and the first save that grades a result locks the scale once with one audit row; two saves at the same moment lock it once, and a save waits for a scale edit in progress (the test holds the scale's advisory lock to stand for the edit); the locked scale cannot be edited in place (409 `LOCKED`) and a new version keeps the default.
- Browser `academics` (extended, desktop and phone): the notice, the optional field and its refusal of a component's name, the exam tile carrying the school's name, and the dialog prefilled with the name.
- **Mutation check:** twenty changes, each applied alone to a copy of the code in a test lane (the unit rounds ran the two unit specs, 39 tests on the unmutated code; the API rounds 80 tests on the unmutated code, 81 after the race test was added; the browser rounds ran `academics`, 21 tests). E12 changes the migration, so it ran on a lane whose database had not been migrated yet. Every one is caught. A "did not run" count in the logs is the tests after the first failure in a file that runs in order.

| | Change | Caught by |
| --- | --- | --- |
| E1 | no refusal of a name a component has | 2 unit: the duplicate test and "judged before the sum" |
| E2 | no length check | 1 unit: "empty or over 40 characters" |
| E3 | no refusal of a name for an exam worth nothing | 1 unit |
| E4 | the snapshot always includes `examName` (null when unset) | 2 unit: the canonical-JSON test and the unchanged-hash test |
| E5 | the snapshot never includes the name | 1 unit: the named-exam snapshot |
| E6 | `entryParts` ignores the name | 2 unit: the parts and the accepts-that-name tests |
| E7 | a new version does not carry the name | 1 API, the new-version assertion (line 239) |
| E8 | create does not store the name | 1 API, the name end to end (line 111, received null) |
| E9 | PATCH does not store the name | 1 API, the PATCH assertion (line 244, a different line from E7 in the same test) |
| E10 | the name is not cleaned (runs of spaces stay) | 1 API, the same test and line as E8 with a different received value ("Final   Examination") |
| E11 | the sheet does not pass the name to `entryParts` | 1 API: the sheet's parts (line 169) |
| E12 | the trigger no longer protects `examName` | 1 API: the database change of a locked scheme's name is not rejected (line 210) |
| E13 | `lockScale` is never called | 1 API: the scale's `lockedAt` is not null (line 339) |
| E14 | the audit action renamed | 1 API: one audit row (line 340, the same test as E13) |
| E15 | the notice's sentence changed | 2 browser (desktop and phone), line 439 |
| E16 | the tile always says "Exam" | 2 browser, line 464 |
| E17 | the dialog sends no name | 2 browser, line 449 |
| E18 | the dialog is not prefilled | 2 browser, line 468 |
| E19 | the field path of the three new problems | 1 API: the error names `body.examName` (line 159) |
| E20 | no shared scale lock in a save | 1 API: the race test, "waiting" (line 425) |

**Not mutation-tested:** the bare score's refusal (no code changed: the test pins what `entryProblem` already did).

**Static gates:** `tsc --noEmit` clean, `eslint` clean on the sixteen changed code files, Prettier `--check` clean on them and on the docs and the migration's folder.

**Regression.** A clean build in a test lane (lane 1, the finished tree including the race test and the screen assertions), then the whole `unit` and `api` projects and four browser specs (`academics`, `results-screens`, `promotion-screens`, `responsive-and-a11y`, each on desktop and phone). **Unit and API: 2,902 passed, 0 failed, 0 skipped. Browser: 99 passed, 0 failed.** This is the last of several attempts, and the earlier ones were not valid runs, for reasons that were not the code: the first (with three other test lanes running at once) stopped at setup with "remaining connection slots are reserved for roles with the SUPERUSER attribute" and reported "1,700 did not run", so I stopped it; the next three launches refused to start because the killed run had left its mock server, Redis and TLS proxy holding their ports (killed by PID after checking each one's working directory was this lane); the launch after that ran for about 35 minutes with two failures (`lms-visibility.spec.ts:147` and `mfa-account.spec.ts:294`, neither near this change), and then the run process disappeared from the process list without an error in the log while the machine had about 0.6 GB of memory free. I did not read those two failures' messages. The run recorded above started fresh afterwards, with no other test lane of mine running, and those two specs passed in it.

**After the rebase onto `dev`** (which now holds tasks 0046 and 0047; 0046 and this task both changed `results/service.ts` and git merged them without a conflict): `tsc --noEmit` clean, a clean build in lane 1, and a focused run of the specs that touch the two changes, **204 passed, 0 failed** (`results-campus-admin`, `results-scheme-points`, `results-scheme-tie`, `results-sheet`, `results`, `report-card-access`, `report-card-pdf`, `report-card-gate`, `report-remarks`, `promotion`, and the unit specs `route-role-guard`, `results-campus-admin`, `scoring-rules`, `results-scheme`, `promotion-final-term`). The whole suite was not re-run after the rebase.

**Not tested, and not claimed.** No deploy, and the migration was not run on any hosted database. The race test stands the scale's advisory lock in for an edit in progress; it does not run a real scale edit in a second request. A school with many thousands of results saving at once was not tried. No person has read the notice on the screen except through the browser tests.
