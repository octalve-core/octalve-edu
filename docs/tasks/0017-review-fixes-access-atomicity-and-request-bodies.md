# 0017: Review fixes - who may read and write what, writes that are all or nothing, request bodies

- **Period / Focus:** 2026-10-20 (follow-up of the code review that wrote the code catalogs: authorization and atomicity of existing routes)
- **Status:** Completed (merged into `dev` on 2026-10-20 as PRs #36 to #43; one full suite on the merged `dev` was run on 2026-10-20: 2159 passed, 23 skipped, 2 failed, the two failures repaired in task 0019, see section 4)
- **Priority:** High
- **Assignee:** Agent (Claude); merged at the maintainer's instruction ("merge all the PRs in order")
- **Target Branch / PR:** `dev`; PRs #36 to #41 (the six fixes), #42 and #43 (source characters), listed in section 6
- **Started:** before 2026-10-20 17:37:44 UTC (the first commit of the series; the start was not timestamped)
- **Ended:** 2026-10-20 19:57:42 UTC (PR #43 merged)
- **Duration:** at least 2 h 20 min (the start was not timestamped)

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Close the review findings about existing routes that a failing test confirmed: every route answers for the signed-in person's own records, a request that is refused writes nothing, and a request body is read no further than its cap. Each fix ships with tests that were seen to fail on the unfixed build.

## 2. Context & Related Docs
- ADR 0002 (a refusal after a write must roll back: decide it before the first write, or throw), ADR 0016 (campus administrators), the student attendance rule of ISS-0013 (`src/lib/attendance/access.ts`), PRD section 5 (a result cannot be edited directly after it is submitted).
- The review is the one that wrote the code catalogs (`docs/functions/*`, PR #35). Further review items are tracked outside the repository.
- Each branch changes the catalog rows of the files it touches in the same commit, as the catalogs require. The branches touch different files (the two timetable commits touch the same ones), so they merge in any order, apart from #43, which sits on top of #42. The merged `dev` (`d12d22d`) is the same tree as a throwaway merge of the eight branches (the diff between them is empty); that merge was built, and the merge of the six fix branches was checked as a whole (typecheck, lint, prettier, catalogs, unit 385).

---

## 3. Work Breakdown (Grouped by Module / Sub-Phase)

### Module A: Request bodies (`claude/fix-bounded-body-read`)
- [x] `validate()` reads the body through a new helper, `readBoundedText` (`src/lib/api/read-body.ts`): a declared length over the cap is refused without reading, and a body with no declared length is refused as soon as it passes the cap, whether or not the sender ever finishes it.

### Module B: Timetable (`claude/fix-timetable-write-checks`, two commits)
- [x] A refused batch changes nothing: the class arms, subjects and teachers it names must be in this school (400 `INVALID_FOREIGN_KEY`) and every clash is judged before the arm's lessons are deleted; the lessons being replaced do not clash with their own replacements.
- [x] A change to one lesson's start or end (PATCH with one time) is judged against the other as stored: a range that does not start before it ends is a 400.

### Module C: LMS (`claude/fix-lms-whose-work`)
- [x] Work is handed in for the signed-in student's own record. Staff (ADMIN, CAMPUS_ADMIN, TEACHING_STAFF) name the student, a CAMPUS_ADMIN only within their campus. An unknown assignment, quiz or student is a 404.
- [x] Reads follow the viewer: staff see everything; a STUDENT sees PUBLISHED work and their own submissions; a PARENT and non-teaching staff see PUBLISHED work and no submissions; the quiz answer key goes to staff only.
- [x] Student writes: only a PUBLISHED assignment; not after the due date when `allowLate` is off (409 `CLOSED`); marked (GRADED) work is final for the student (409 `ALREADY_MARKED`).

### Module D: Results (`claude/fix-results-draft-only`)
- [x] A result is edited only while it is DRAFT (409 `NOT_EDITABLE` otherwise, administrators included); the rows are read `FOR UPDATE` so a step that commits meanwhile is seen.
- [x] Every refusal is decided before the first write (a refused request saves nothing); the students must be in this school and, for a member anchored to a campus, in that campus or none (404); ids must have the shape of an id, a score or maximum is at most 9999.99, a student appears once per request; listing follows the same campus rule.

### Module E: Attendance (`claude/fix-attendance-roll`)
- [x] Taking a roll needs an ACTIVE session (409) and names only students on that arm's roll for it, once each (400 `VALIDATION` otherwise); nothing is saved on a refusal.

### Module F: Report card (`claude/fix-report-card-scope`)
- [x] Staff read a student's report card under the rule the student's attendance history already applies: a student of another campus is the same 404 as an unknown id, and a teacher reads only a student enrolled (ACTIVE, active session) in an arm they are assigned to.

### Module G: Source characters (`claude/chore-source-hygiene`, then `claude/fix-names-need-a-visible-character` on top of it)
- [x] No source file holds an invisible or direction-changing character typed in as itself: eight files (the name check and seven specs) now spell them as escapes, with the same values (checked by parsing both versions), and a unit test (`tests/unit/source-hygiene.spec.ts`, 2 tests) fails the build naming file and line if one comes back.
- [x] `checkName` refuses a name that has nothing visible in it (zero-width characters and the like, alone, repeated or with spaces between), as it refuses an empty one; joiners between letters and every name with at least one visible character are still accepted (`tests/unit/profile-name-visible.spec.ts`, 2 tests; the first failed on the unfixed code).

### Module H: Docs
- [x] Catalog rows (`docs/functions/school-app.md`, `docs/functions/shared.md`) in the same commit as each file.
- [x] This task file, the register row and section in `current-tasks.md`, `octalve_edu_progress.md`, `HANDOVER.md` section 6 and the banner of `CLAUDE.md`.
- [x] Open the pull requests into `dev` and merge them in order (#36 to #43, each after its Vercel check passed and with `base.ref` checked to be `dev`).
- [ ] After the promotion to `prod`: record the issues these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public).

---

## 4. Unified Verification & Quality Gates
- [x] `pnpm typecheck`, eslint and prettier clean on every branch alone and on the merge of all six.
- [x] The whole unit project passes on every branch alone (382 on `dev`; 385 on the body-read branch, which adds three unit tests), on the merge of the six fixes (385), and on the merged `dev` after the eight merges (389: the two source-character branches add two tests each; run on a tree identical to `d12d22d`, 2.2 min).
- [x] Every new test was run on an unfixed production build first and failed there as intended (results 14 of 16, attendance 6 of 8, LMS 19 of 28, timetable batch 2 of 6, body read 3 tests of which 2 are unit tests, report card 3 of 6, lesson times 1 of 3); the controls in them passed.
- [x] One production build of the first five changes (body read, timetable batch, LMS, results, attendance): unit 385, integration 614, API 705 passed (run with `--timeout=120000`), e2e-desktop attendance, lms-a11y and academics 15.
- [x] The report-card and lesson-time changes: a 148-test API run (145 passed; the 3 others are explained in section 5), then a 40-test re-run, all passed.
- [x] **One full suite on the merged `dev`** (PRs #36 to #44, before #45 and #46; production build, its own lane and database, all Playwright projects, 2.1 hours, on a machine busy with other work): **2159 passed, 23 skipped, 2 failed**. The two failures were not product defects: the email-change response-time check (a 40 ms tolerance inside the noise of a busy machine) and the account-menu e2e test (it waited for a page the person is sent on from); both are repaired and measured in task 0019 (PR #48). The first attempt at a full suite (a build of all eight branches) had ended before any test ran: Playwright timed out waiting 60 s for the web servers, at a load average of 48. NOT run, still: the API and integration projects on each branch alone.

---

## 5. Notes, Findings & Deviations
- **Behaviour a school will notice:** a result cannot be changed once it leaves DRAFT (a correction goes back through the lifecycle: send it to DRAFT, or an administrator unlocks a LOCKED result with a reason); a teacher with no assigned arm (no subject assignment, no timetable slot) cannot open any student's report card, as for attendance; in the LMS a student sees published work and their own submissions, cannot hand in over marked work, and is refused after the due date when late work is off; a roll call takes only the arm's roll in the active session; a timetable batch refused for a clash leaves the arm's lessons as they were.
- **Found on the way:** an unknown or other-school id in a roll call, a results entry, an LMS hand-in, a timetable batch and a one-time lesson change ended as an unhandled error (a 500); they answer 400 or 404 now. An id containing a NUL byte was a 500 in the same places; the ids have the shape of an id now.
- **Existing tests changed:** `tests/api/results.spec.ts` (its teacher now has a subject assignment in the arm, because the report-card test read a card as a teacher with no arm), `tests/integration/phase-1-lifecycle-walk.spec.ts` (the results call passes the caller), `tests/unit/route-role-guard.spec.ts` (the two LMS submit routes are no longer listed as "campus checked elsewhere": they call `studentScope`).
- **Test notes:** the email-change response-time check in `tests/api/account-self-service.spec.ts` takes about 85 s on a loaded machine against the 30 s default (run the API project with `--timeout=120000`), and in one run measured 150 ms against its 40 ms limit while the machine was loaded; it passes alone (59 s). Not changed here.
- **Not done here (written down privately, the repository is public):** items the review found outside these six areas.

## 6. Output & Deliverables
- **Pull requests, all into `dev` (off `e99972b`), merged in this order on 2026-10-20 with a merge commit each; the remote branches are kept:**

| PR | Branch | Merge commit | Merged (UTC) |
|---|---|---|---|
| #36 | `claude/fix-bounded-body-read` | `b13d725` | 19:54:30 |
| #37 | `claude/fix-timetable-write-checks` (two commits) | `6eb6fd4` | 19:54:47 |
| #38 | `claude/fix-lms-whose-work` | `25ae546` | 19:55:58 |
| #39 | `claude/fix-results-draft-only` | `3206971` | 19:56:14 |
| #40 | `claude/fix-attendance-roll` | `abe0d57` | 19:56:31 |
| #41 | `claude/fix-report-card-scope` | `fb76827` | 19:56:48 |
| #42 | `claude/chore-source-hygiene` | `87a4cb9` | 19:57:27 |
| #43 | `claude/fix-names-need-a-visible-character` | `d12d22d` | 19:57:42 |

- **Merge gate used:** state open, `base.ref` is `dev`, the head is the commit that was tested, the Vercel check (type-check and build of the preview) is SUCCESS, GitHub reports the PR mergeable. No other CI runs on a pull request here. #37 was merged by a command that printed its checks and went on (GitHub was recalculating mergeability right after #36 and the check name was not matched); its Vercel check had been read as SUCCESS on the same head minutes before. The later merges went through a script that refuses unless every condition holds.
- **Docs:** `docs/functions/school-app.md`, `docs/functions/shared.md`, this file, `docs/tasks/current-tasks.md`, `docs/development-history/octalve_edu_progress.md`, `docs/HANDOVER.md`, `CLAUDE.md`.
