# 0018: Teacher assignments for results, and certificates (verification by token, numbers per school, access by role and campus)

- **Period / Focus:** 2026-10-20 (follow-up of the review fixes of task 0017, on the maintainer's answers of the same day)
- **Status:** Completed (merged into `dev` as PRs #45 and #46 on 2026-10-20; the certificate migration is for the maintainer to run on the hosted database BEFORE the code is deployed there)
- **Priority:** High
- **Assignee:** Agent (Claude); merged into `dev` under the standing authority to merge after the checks pass; the certificate migration is the maintainer's to run on the hosted database
- **Target Branch / PR:** `dev`; PR #45 (results) and PR #46 (certificates), listed in section 6
- **Started:** 2026-10-20 20:31:57 UTC (the first commit of the series; the design work before it was not timestamped)
- **Ended:** 2026-10-20 21:39:38 UTC
- **Duration:** 1 h 7 min 41 s (from the first commit to the last merge)

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Bring two parts of Octalve to rules the platform already applies elsewhere: a teacher's results work (recording and listing) follows the arms they are assigned to, as a student's attendance history and report card do; and certificates get a public verification that can actually answer (by an opaque token, not by the sequential number), numbers that are unique within a school, and the same role and campus rules as every other record. Each change ships with tests that were seen to fail on the unfixed build.

## 2. Context & Related Docs
- The maintainer's answers of 2026-10-20: the teacher-assignment behaviour change is accepted ("report cards now and results entry next"); "Should a teacher's results list also be limited to the arms they're assigned to?" yes; the certificate migration may be written by the agent and is run by the maintainer.
- ADR 0002 (a refusal after a write must roll back: decide it before the first write, or throw), ADR 0016 (campus administrators), ISS-0013 and task 0017 (the attendance and report-card rules this follows, `src/lib/attendance/access.ts`), AlEemaan's `mayEnterResults` (ADMIN always; a teacher only for the subject and arm they are assigned), the verification-context pattern of `Result` (`forVerification`, `app_verification_token()`).
- Each branch changes the catalog rows of the files it touches in the same commit. The two branches touch different files except the catalogs, so they merge in any order.

---

## 3. Work Breakdown (Grouped by Module / Sub-Phase)

### Module A: Results entry (`claude/fix-results-assigned-subject-arm`, commit 1)
- [x] For a teacher, every student in a `POST /academics/results` request must be on the `ACTIVE` roll, in the period's session, of an arm in which the caller holds a subject assignment for exactly that subject (a live staff record; a timetable slot does not count). One student outside refuses the whole request: 403 `FORBIDDEN` (`NOT_ASSIGNED`), decided before the first write. Unknown or other-campus students and malformed ids answer as before; an `ADMIN` is not held to it.

### Module B: Results list (same branch, commit 2)
- [x] For a teacher, `GET /academics/results` lists the students on the `ACTIVE` roll, in the `ACTIVE` session, of the arms they are assigned to (the attendance definition: a subject assignment or a timetable slot); the filters only narrow it; no assigned arm, no staff record or no active session gives an empty list. `ADMIN` and `NON_TEACHING_STAFF` keep the campus rule alone, and so does a teacher who holds `CAN_APPROVE_RESULTS` (approving other teachers' results needs to see them: a decision made here, see section 5).

### Module C: Certificates, token and numbers (`claude/fix-certificates-verify-and-access`, commit 1)
- [x] Migration `20261029090000_certificate_verification_token`: `Certificate.verificationToken` (32 hex characters from the database's random source, unique, every existing row given its own), the number unique within a school (`tenantId, certificateNo`), and the policy `certificate_public_verification` (the one `ISSUED` row a token names).
- [x] `GET /api/v1/verify-certificate/[token]` replaces `[certificateNo]`: not 32 lower-case hex characters is 400 `INVALID_TOKEN`; unknown, `DRAFT` and `REVOKED` are 404; the answer names no id, admission number or token.
- [x] Issuing: unknown student or period is a 404 before any write; the next number is taken under a per-school advisory lock; a prefix with no letter or digit is `OCT`; ids are checked for shape; no database message in an answer. Revoking an unknown certificate is a 404.

### Module D: Certificates, access (same branch, commit 2)
- [x] A student lists their own certificates and no one else's; anyone else anchored to a campus lists that campus's students' and the school-wide ones'; `ADMIN` and members of no campus list the school's.
- [x] A campus administrator issues for, and revokes the certificates of, their own campus's students only (`studentScope`, new `certificateScope`; another campus or unknown 404, a school-wide student's 403).

### Module E: Docs
- [x] Catalog rows (`docs/functions/school-app.md`, `public.md`, `shared.md`, `docs/components/school-app.md`) in the same commits as the code.
- [x] This task file, the register row and section in `current-tasks.md`, `octalve_edu_progress.md`, `HANDOVER.md` section 6 and the banner of `CLAUDE.md`.
- [x] Open the pull requests into `dev` and merge them (#45 and #46 on 2026-10-20, each after its Vercel check was SUCCESS and with `base.ref` checked to be `dev`).
- [ ] The maintainer runs `pnpm db:migrate:deploy` on the hosted database BEFORE the certificate code is deployed there.
- [ ] After the promotion to `prod`: record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public).

---

## 4. Unified Verification & Quality Gates
- [x] `pnpm build` (which type-checks the source and the tests), eslint (one old warning) and prettier clean on each branch; the code catalogs: 412 tracked files, 412 rows, none missing, extra, duplicate or broken.
- [x] **Every new test was run on an unfixed production build first** (`dev` at `fda8546` with the specs copied in, own test lane and database): of 139 tests (the new and changed specs of both branches plus `integration/rls`) 35 failed, every one for the intended reason (403 expected and 200 received, list mismatches, a missing token, a number taken by another school, a database message, a 500 for an id with a NUL byte, `-VOC-` for a number), none by timeout, and 104 passed (the controls and the unchanged tests). Unit: 4 of 22 failed (the prefix test and three route-guard checks), 18 passed.
- [x] Results, on the branch's build: `results-assigned-subject` 12, `results-list-scope` 9, `results` 9, `results-edit-rules` 16, `campus-admin-academics` 14, `report-card-access` 6, `attendance-access` 48 (it shares `assignedArmIds`) and `integration/phase-1-lifecycle-walk` 10: **125 passed, 0 failed**. Whole unit project: 389 passed.
- [x] Certificates, on the branch's build: `certificates-verify` 10, `certificates-access` 9, `integration/rls` 73 (the whole file): **93 passed, 0 failed**. Whole unit project: 390 passed.
- [x] **A bug the first API run found in my own change, fixed before the pull request:** the per-school number lock was taken with `$queryRaw`, which cannot read the `void` result of `pg_advisory_xact_lock`, so every issue failed. The repository's way is `$executeRaw` with `hashtext` (it is written down in `docs/development-history/handoff/PHASE-1-SLICE-1-PROMPT.md`). The build and the numbers above are after the fix.
- [x] **The migration:** rehearsed with `prisma migrate deploy` over three existing certificates (each got its own 32-character token, the unique index became `(tenantId, certificateNo)`, the policy exists); `prisma migrate diff` of the migrated database against the schema files shows nothing for `Certificate` (its one difference is the partial unique index on `Result.verificationToken`, which the schema file cannot express and which is older than this change). The build of `dev` before this change, run against the migrated database, issues, lists and revokes a certificate: the migration can run before the deploy.
- [x] The full suite recorded in task 0017 (2159 passed, 23 skipped, 2 failed, 2.1 hours, all projects) is of `dev` BEFORE #45 and #46, so it is not a run of this task's code; its two failures are repaired in task 0019 (PR #48). The unit project on `dev` after #45 to #49 (tip `cf32c30`): 396 passed, 0 failed.
- [ ] NOT run: the mobile e2e project, the https project, the e2e specs, the API and integration specs that do not touch results, attendance, the report card or certificates, a full suite with both branches merged, and the migration on the hosted database.

---

## 5. Notes, Findings & Deviations
- **Behaviour a school will notice:** a teacher who records results without a subject assignment gets a 403 until an administrator gives them one (Staff, the teacher's page, *Teaches*, *Add a subject*); a teacher's results list shows only the students of the arms they are assigned to; a teacher with only a timetable slot reads that arm's results but cannot record them; a student sees their own certificates only; a campus administrator issues and revokes only for their own campus's students; the certificate verification link takes the token (the school reads it from the certificate list), not the certificate number. No screen calls the results or certificates routes yet (`ResultsEntryGrid`, `ResultsApprovalConsole` and `CertificatesConsole` are built and not mounted), so no screen changed.
- **A decision made here that the maintainer was not asked:** a teacher who holds `CAN_APPROVE_RESULTS` keeps the school-wide (campus-ruled) results list. If it is unwanted, the approver would approve from a screen that lists by class.
- **Why a timetable slot counts for reading and not for recording:** a slot says when a class meets; a mark is answered for by the person assigned the subject.
- **Existing tests changed:** `tests/api/results.spec.ts` and `tests/api/results-edit-rules.spec.ts` (setup only: staff records, subject assignments and enrolments the students now need), `tests/unit/route-role-guard.spec.ts` (the public certificate route's key, `certificateScope` among the campus helpers, the certificates list route on the "checked elsewhere" list with a new reason), `tests/integration/rls.spec.ts` (a new block for certificates).
- **Known limits, not changed here:** the certificate number is `count + 1` under the lock, so a certificate removed from the database directly (nothing in the application deletes one; a student's removal would cascade) makes the next number collide until the count catches up (a per-school counter would remove it); no screen shows or issues the token.
- **Test notes:** the whole of each branch's test run used its own test lane (own ports, database and Redis) so that runs did not meet; a build that is type-checked must not hold a throwaway Playwright config or specs that name a column the build's schema does not have (the type check covers them).
- **Not done here (written down privately, the repository is public):** items the review found outside these areas.

## 6. Output & Deliverables
- **Pull requests, both into `dev` (off `fda8546`):**

| PR | Branch | Merge commit | Merged (UTC) |
|---|---|---|---|
| #45 | `claude/fix-results-assigned-subject-arm` (two commits) | 443a565 | 2026-10-20 21:38:08 UTC |
| #46 | `claude/fix-certificates-verify-and-access` (two commits; needs a migration) | a17baa3 | 2026-10-20 21:39:38 UTC |

- **Merge gate used:** state open, `base.ref` is `dev`, the head is the commit that was tested, the Vercel check is SUCCESS, GitHub reports the PR mergeable; applied by a script that refuses unless every condition holds. The remote branches are kept.
- **Migration run order (the maintainer):** `pnpm db:migrate:deploy` on the hosted database first, then deploy the code. The release before this one keeps working on the migrated schema; the other order would make every certificate read fail until the migration is run.
- **Docs:** `docs/functions/school-app.md`, `docs/functions/public.md`, `docs/functions/shared.md`, `docs/components/school-app.md`, this file, `docs/tasks/current-tasks.md`, `docs/development-history/octalve_edu_progress.md`, `docs/HANDOVER.md`, `CLAUDE.md`.
